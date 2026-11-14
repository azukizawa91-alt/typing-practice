// ===== 文章に鍵をかける・外す（ブラウザの中だけで行う） =====
// 合言葉そのものは、どこにも送らない・保存しない。
// 合言葉から、次の2つを作る（どちらも元の合言葉には戻せない）
//   ・確認用の印（loginProof）… Google に送り、本人かどうかの確認に使う
//   ・鍵（deriveKey）          … 文章に鍵をかける・外すのに使う。Google には送らない
// 2つは作り方（混ぜる材料）を変えているので、確認用の印から鍵を作ることはできない。

const SecretBox = {
  ITERATIONS: 100000, // 合言葉を当てようとする人に時間をかけさせるための、くり返しの回数

  // 合言葉をそろえる（全角/半角のちがい・前後の空白をなくす）
  normalizePass(pass) {
    return String(pass || "").normalize("NFKC").trim();
  },

  // 合言葉に使える文字か（半角の英字・数字・記号だけ。8文字以上）
  // 全角で入れられても、そろえたあとの半角で見る
  isAscii(pass) {
    return /^[\x21-\x7E]+$/.test(this.normalizePass(pass));
  },
  isValidNewPass(pass) {
    return this.isAscii(pass) && this.normalizePass(pass).length >= 8;
  },

  // 鍵の材料になる、でたらめな文字列を作る
  randomSalt() {
    return this.toB64(crypto.getRandomValues(new Uint8Array(16)));
  },

  toB64(buf) {
    let s = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  },

  fromB64(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  },

  // 合言葉と材料から、決まった長さのでたらめなデータを作る（PBKDF2 という決まった作り方）
  async stretch(pass, salt) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(this.normalizePass(pass)), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: this.ITERATIONS, hash: "SHA-256" },
      base,
      256
    );
  },

  // 確認用の印。材料に利用者名を使う（同じ合言葉でも、人がちがえば印もちがう）
  async loginProof(name, pass) {
    // 利用者名のそろえ方は、server-core.js の normalizeUserName と同じにしておくこと
    const user = String(name || "").normalize("NFKC").trim().toLowerCase();
    return this.toB64(await this.stretch(pass, "typing-login:" + user));
  },

  // 文章の鍵。材料は、登録のときに Google 側で決めた keySalt
  async deriveKey(pass, keySalt) {
    const bits = await this.stretch(pass, "typing-key:" + keySalt);
    return crypto.subtle.importKey("raw", bits, "AES-GCM", true, ["encrypt", "decrypt"]);
  },

  // 鍵を、タブを閉じるまでの間だけ覚えておくための形にする（再読みこみでログインし直さなくて済む）
  async exportKey(key) {
    return this.toB64(await crypto.subtle.exportKey("raw", key));
  },
  async importKey(b64) {
    return crypto.subtle.importKey("raw", this.fromB64(b64), "AES-GCM", true, ["encrypt", "decrypt"]);
  },

  // 鍵をかける。できあがりは「v1.〇〇.〇〇」の形の、読めない文字の並び
  async encrypt(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
    return `v1.${this.toB64(iv)}.${this.toB64(data)}`;
  },

  // 鍵を外す。鍵がちがう・こわれているときは失敗する
  async decrypt(key, sealed) {
    const parts = String(sealed).split(".");
    if (parts.length !== 3 || parts[0] !== "v1") throw new Error("鍵のかかった形ではありません。");
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: this.fromB64(parts[1]) }, key, this.fromB64(parts[2]));
    return new TextDecoder().decode(data);
  },
};
