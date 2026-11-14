// ===== 保存の窓口 =====
// 画面（app.js）は、保存や読み込みを必ずこの store を通して行う。
//   ・Google に載せたとき … Google 側のプログラム（Code.gs の api）とやりとりして、スプレッドシートに保存する
//   ・手元で開いたとき   … api-local.js の「Google のまね」を使う（このPCのブラウザに保存）
// どちらかは自動で見分ける。
//
// 文章のタイトルと本文、記録に控える文章のタイトルは、ここで鍵をかけてから送り、
// 受け取ったら鍵を外してから画面に渡す（crypto.js）。Google 側には鍵のかかった形しか届かない。
//
// 読みこんだ文章と記録は、ここで覚えておく（キャッシュ）。毎回 Google に聞かずに済むので速い。

const IN_GOOGLE = typeof google !== "undefined" && google.script && google.script.run;
const SESSION_KEY = "typingPractice.session"; // タブを閉じるまでだけ覚える（sessionStorage）

// Google 側（または手元のまね）に頼む
function callApi(name, payload) {
  if (!IN_GOOGLE) return LocalApi.call(name, payload);
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((e) => reject(new Error((e && e.message) || String(e))))
      .api(name, payload);
  });
}

// ログインの期限が切れたときのエラーかどうか
function isSessionExpired(e) {
  return Boolean(e && String(e.message).includes("SESSION_EXPIRED"));
}

const store = {
  inGoogle: Boolean(IN_GOOGLE),
  session: null, // { name, token, key }  key は文章の鍵
  texts: [],     // 鍵を外した文章
  results: [],   // 鍵を外した記録
  unreadable: 0, // 鍵を外せなかった数（0 でなければ、合言葉の変更を止める）
  exportedAt: "", // 前回、文章を書き出した日時

  // ===== ログイン =====

  // 同じタブで前にログインしていれば、そのまま続ける
  async restore() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      saved = null;
    }
    if (!saved) return false;
    try {
      this.session = { name: saved.name, token: saved.token, key: await SecretBox.importKey(saved.key) };
      await this.loadAll();
      return true;
    } catch (e) {
      this.clearSession();
      return false;
    }
  },

  async register(name, pass, registerCode) {
    const proof = await SecretBox.loginProof(name, pass);
    const r = await callApi("register", { name, proof, registerCode });
    await this.startSession(r, pass);
  },

  async login(name, pass) {
    const proof = await SecretBox.loginProof(name, pass);
    const r = await callApi("login", { name, proof });
    await this.startSession(r, pass);
  },

  async startSession(r, pass) {
    const key = await SecretBox.deriveKey(pass, r.keySalt);
    this.session = { name: r.name, token: r.token, key };
    await this.rememberSession();
    await this.loadAll();
  },

  async rememberSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        name: this.session.name, token: this.session.token, key: await SecretBox.exportKey(this.session.key),
      }));
    } catch (e) {
      // 覚えられなくても、このページを開いている間は使える
    }
  },

  // 合言葉を変える。文章と記録のタイトルに、新しい鍵をかけ直してから送る。
  // 読めない文章が1つでもあれば、壊さないように変更しない
  async changePassphrase(currentPass, newPass) {
    if (this.unreadable > 0) {
      throw new Error("読めない文章や記録があるため、変更できません。管理者に相談してください。");
    }
    const name = this.session.name;
    const keySalt = SecretBox.randomSalt();
    const newKey = await SecretBox.deriveKey(newPass, keySalt);
    const reseal = (text) => SecretBox.encrypt(newKey, text);
    const texts = await Promise.all(this.texts.map(async (t) => ({
      id: t.id, title: await reseal(t.title), body: await reseal(t.body),
    })));
    const results = await Promise.all(this.results.map(async (r) => ({
      id: r.id, textTitle: await reseal(r.textTitle),
    })));
    await callApi("changePass", {
      token: this.token(),
      oldProof: await SecretBox.loginProof(name, currentPass),
      newProof: await SecretBox.loginProof(name, newPass),
      keySalt, texts, results,
    });
    this.session.key = newKey;
    await this.rememberSession();
  },

  async logout() {
    const token = this.session && this.session.token;
    this.clearSession();
    if (token) {
      try {
        await callApi("logout", { token });
      } catch (e) {
        // 期限切れなどで失敗しても、画面側はログアウトできていればよい
      }
    }
  },

  clearSession() {
    this.session = null;
    this.texts = [];
    this.results = [];
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // 何もしない
    }
  },

  token() {
    if (!this.session) throw new Error("SESSION_EXPIRED");
    return this.session.token;
  },

  async seal(text) {
    return SecretBox.encrypt(this.session.key, text);
  },

  // 鍵を外す。外せないもの（こわれている等）は「（読めません）」にする
  async open(sealed) {
    try {
      return await SecretBox.decrypt(this.session.key, sealed);
    } catch (e) {
      this.unreadable++;
      return "（読めません）";
    }
  },

  // ログインした直後に、自分の文章と記録をまとめて読みこむ
  async loadAll() {
    const token = this.token();
    this.unreadable = 0;
    const [texts, results, profile] = await Promise.all([
      callApi("listTexts", { token }),
      callApi("listResults", { token }),
      callApi("profile", { token }),
    ]);
    this.exportedAt = profile.exportedAt || "";
    this.texts = await Promise.all(texts.map(async (t) => ({
      ...t, title: await this.open(t.title), body: await this.open(t.body),
    })));
    this.results = await Promise.all(results.map(async (r) => ({
      ...r, textTitle: await this.open(r.textTitle),
    })));
  },

  // ===== 文章 =====

  // 保存した文章の一覧（新しいものが先）
  async listTexts() {
    return [...this.texts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // 文章を保存する。同じ本文がすでにあれば、新しく作らずにそれを返す
  // （本文は鍵がかかっていて Google 側では比べられないので、ここで比べる）
  // 返り値: { text, duplicate }
  async addText({ title, body }) {
    const same = this.texts.find((t) => t.body === body);
    if (same) return { text: same, duplicate: true };
    const r = await callApi("addText", { token: this.token(), title: await this.seal(title), body: await this.seal(body) });
    const text = { ...r, title, body };
    this.texts.push(text);
    return { text, duplicate: false };
  },

  async deleteText(id) {
    await callApi("deleteText", { token: this.token(), id });
    this.texts = this.texts.filter((t) => t.id !== id);
  },

  // 控えのファイルの文章をまとめて保存する。同じ本文の文章はとばす
  // 返り値: { added, skipped }
  async addTexts(list) {
    const known = new Set(this.texts.map((t) => t.body));
    const fresh = list.filter((t) => {
      if (known.has(t.body)) return false;
      known.add(t.body);
      return true;
    });
    if (fresh.length > 0) {
      const sealed = await Promise.all(fresh.map(async (t) => ({
        title: await this.seal(t.title), body: await this.seal(t.body),
      })));
      const rows = await callApi("addTexts", { token: this.token(), texts: sealed });
      rows.forEach((row, i) => this.texts.push({ ...row, title: fresh[i].title, body: fresh[i].body }));
    }
    return { added: fresh.length, skipped: list.length - fresh.length };
  },

  // 前回の書き出しのあとに保存した文章の数
  newTextCount() {
    return this.texts.filter((t) => t.createdAt > this.exportedAt).length;
  },

  async markExported() {
    const r = await callApi("markExported", { token: this.token() });
    this.exportedAt = r.exportedAt;
  },

  // ===== 練習の結果（文章とは別の箱） =====
  // 結果には文章そのものは入れず、textKey（文章の中身から作った目印）と、鍵をかけたタイトルの控えだけを入れる。

  // 結果を1件記録する。返り値は記録したもの（id と日時つき）
  async addResult(data) {
    const r = await callApi("addResult", {
      token: this.token(),
      record: { ...data, textTitle: await this.seal(data.textTitle) },
    });
    const record = { ...r, textTitle: data.textTitle };
    this.results.push(record);
    return record;
  },

  // 結果の一覧（新しいものが先）
  // match を渡すと、その文章の結果だけにしぼる。
  //   match.textId  … 用意した文章・保存した文章の番号（中身を少し直しても同じ文章としてつながる）
  //   match.textKey … 文章の中身から作った目印（保存していない貼り付け文章でもつながる）
  // どちらかが一致すれば「同じ文章」とみなす
  async listResults(match) {
    const same = (r) =>
      !match ||
      (match.textId && r.textId === match.textId) ||
      (match.textKey && r.textKey === match.textKey);
    return this.results
      .filter(same)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  },

  async deleteResult(id) {
    await callApi("deleteResult", { token: this.token(), id });
    this.results = this.results.filter((r) => r.id !== id);
  },
};
