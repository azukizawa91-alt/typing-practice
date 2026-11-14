// ===== サーバーの中身（Google 側と、手元で試すための「まね」で共通） =====
// このファイルは、そのまま Google 側の Code.gs にも入る（tools/build-gas.sh がつなげる）。
// 保存場所（スプレッドシート／ブラウザ）とのやりとりは deps として外から渡すので、ここには書かない。
//
// deps に渡すもの:
//   db.read(table)          … その表の全部の行を [{...}] で返す
//   db.append(table, obj)   … 1行足す
//   db.remove(table, match) … match(行) が true の行を消す
//   db.update(table, change) … change(行) が返した新しい行で書きかえる（null を返した行はそのまま）
//   hash(text)              … text から、元に戻せない印（文字列）を作る
//   sessions.put/get/remove … ログイン中の人の「入館証」（token）を覚える。しばらくすると自動で消える
//   limits.get/put/remove   … まちがいの回数を覚える。15分ほどで自動で消える
//   randomId()              … ぶつからない、でたらめな文字列
//   registerCode()          … 新しく登録するときの「登録用の合言葉」（管理者が決める）
//   now()                   … 今の日時（ISO 形式の文字列）
//
// ★大事な決まり: どの処理も、必ず「入館証の持ち主」の行だけを読み書きする。
//   ブラウザ側から別の人の名前を送られても、ここで持ち主を決めるので、他の人のデータは出ない。

var CODE_VERSION = "2026-11-14a";

// 表の形
//   fields … プログラムの中で使う名前（列の順番もこのとおり）
//   labels … スプレッドシートの1行目に出す見出し（管理者が見て分かるように日本語）
var TABLES = {
  users: {
    sheet: "利用者",
    // ★列は順番で読み書きする。増やすときは必ずいちばん右に足す
    fields: ["name", "salt", "proofHash", "keySalt", "createdAt", "exportedAt"],
    labels: ["利用者名", "合言葉の確認用（材料）", "合言葉の確認用（印）", "鍵の材料", "登録した日時", "文章を書き出した日時"],
  },
  texts: {
    // title と body は、ブラウザで鍵をかけた（暗号化した）文字列が入る。管理者にも読めない
    sheet: "文章",
    fields: ["id", "user", "title", "body", "createdAt"],
    labels: ["番号", "利用者名", "タイトル（鍵つき）", "本文（鍵つき）", "保存した日時"],
  },
  results: {
    // textTitle も鍵をかけた文字列。数字は読める（管理者も練習の状況は分かる）
    sheet: "記録",
    fields: [
      "id", "user", "playedAt", "textId", "textKey", "textTitle", "textGroup",
      "completed", "durationSec", "perMin", "accuracy", "mistakes", "ignored", "correct",
      "sampleChars", "inputChars", "restCount", "tailMissing",
      "firstHalfPerMin", "secondHalfPerMin", "deleteComposing", "deleteConfirmed",
      "judge", "layout",
    ],
    labels: [
      "番号", "利用者名", "練習した日時", "文章の番号", "文章の目印", "文章のタイトル（鍵つき）", "段階",
      "完了したか", "時間（秒）", "速さ（文字/分）", "正確率（％）", "ミス（か所）", "数えなかったちがい", "正しい文字数",
      "見本の文字数", "入力した文字数", "未入力の文字数", "最後の打ち忘れ",
      "前半の速さ", "後半の速さ", "消した回数（変換中）", "消した回数（確定後）",
      "判定", "配置",
    ],
    numbers: [
      "durationSec", "perMin", "accuracy", "mistakes", "ignored", "correct",
      "sampleChars", "inputChars", "restCount", "tailMissing",
      "firstHalfPerMin", "secondHalfPerMin", "deleteComposing", "deleteConfirmed",
    ],
    booleans: ["completed"],
  },
};

// 書きこみをする処理（Google 側では、同時に書きこんでもこわれないように順番待ちをする）
// まちがいが何回続いたら止めるか
var LOGIN_FAIL_LIMIT = 5;
var REGISTER_FAIL_LIMIT = 20;

var WRITE_ACTIONS = ["register", "addText", "addTexts", "deleteText", "addResult", "deleteResult", "changePass", "markExported"];

// 利用者名をそろえる（全角/半角・前後の空白・英字の大文字小文字のちがいをなくす）
function normalizeUserName(name) {
  return String(name || "").normalize("NFKC").trim().toLowerCase();
}

function createServer(deps) {
  function fail(message) {
    throw new Error(message);
  }

  function findUser(name) {
    var key = normalizeUserName(name);
    var users = deps.db.read("users");
    for (var i = 0; i < users.length; i++) {
      if (normalizeUserName(users[i].name) === key) return users[i];
    }
    return null;
  }

  // 入館証から、ログイン中の人の名前を取り出す。期限切れなら知らせる
  function ownerOf(p) {
    var name = p && p.token ? deps.sessions.get(p.token) : null;
    if (!name) fail("SESSION_EXPIRED");
    return name;
  }

  function startSession(user) {
    var token = deps.randomId() + deps.randomId();
    deps.sessions.put(token, user.name);
    return { token: token, name: user.name, keySalt: user.keySalt };
  }

  // 決められた欄だけを取り出す（よけいな欄を送られても保存しない）
  function pick(table, obj) {
    var out = {};
    TABLES[table].fields.forEach(function (f) {
      if (obj[f] !== undefined) out[f] = obj[f];
    });
    return out;
  }

  // 返すときは「user」欄を外す（ブラウザには要らない）
  function strip(row) {
    var out = {};
    for (var k in row) if (k !== "user") out[k] = row[k];
    return out;
  }

  var handlers = {
    ping: function () {
      return { version: CODE_VERSION };
    },

    // 新しく登録する。proof はブラウザで合言葉から作った「確認用の印」（合言葉そのものは来ない）
    register: function (p) {
      var name = String(p.name || "").normalize("NFKC").trim();
      if (!name) fail("利用者名を入れてください。");
      if (name.length > 20) fail("利用者名は20文字以内にしてください。");
      if (!p.proof) fail("合言葉を入れてください。");
      var code = deps.registerCode();
      if (!code) fail("登録用の合言葉が、まだ設定されていません。管理者に連絡してください。");
      // 登録用の合言葉を次々に試されないように、まちがいが続いたら、しばらく誰も登録できなくする
      var regFails = Number(deps.limits.get("register") || 0);
      if (regFails >= REGISTER_FAIL_LIMIT) {
        fail("登録用の合言葉のまちがいが続いたため、しばらく（15分ほど）登録できません。");
      }
      if (String(p.registerCode || "").normalize("NFKC").trim() !== String(code).normalize("NFKC").trim()) {
        deps.limits.put("register", regFails + 1);
        fail("登録用の合言葉がちがいます。");
      }
      if (findUser(name)) fail("その利用者名は、もう使われています。別の名前にしてください。");

      var salt = deps.randomId();
      var user = {
        name: name,
        salt: salt,
        proofHash: deps.hash(salt + p.proof),
        keySalt: deps.randomId(),
        createdAt: deps.now(),
      };
      deps.db.append("users", user);
      return startSession(user);
    },

    // 合言葉を続けてまちがえたら、その利用者名でしばらくログインできなくする（次々に試されるのを防ぐ）
    login: function (p) {
      var key = "login:" + normalizeUserName(p.name);
      var fails = Number(deps.limits.get(key) || 0);
      if (fails >= LOGIN_FAIL_LIMIT) {
        fail("合言葉を続けてまちがえたため、しばらく（15分ほど）ログインできません。時間をおいてから、もう一度試してください。");
      }
      var user = findUser(p.name);
      if (!user || deps.hash(user.salt + p.proof) !== user.proofHash) {
        deps.limits.put(key, fails + 1);
        fail("利用者名か合言葉がちがいます。");
      }
      deps.limits.remove(key);
      return startSession(user);
    },

    logout: function (p) {
      if (p && p.token) deps.sessions.remove(p.token);
      return { ok: true };
    },

    // 合言葉を変える。文章の鍵も変わるので、ブラウザで鍵をかけ直した文章と記録のタイトルを全部受け取る。
    // 1件でも足りなければ変更しない（古い鍵のまま残る文章が出ないように）。
    // 途中で失敗したら、変更前の内容に戻す
    changePass: function (p) {
      var owner = ownerOf(p);
      var user = findUser(owner);
      if (!user || deps.hash(user.salt + p.oldProof) !== user.proofHash) fail("今の合言葉がちがいます。");
      if (!p.newProof || !p.keySalt) fail("新しい合言葉を入れてください。");

      var newTexts = {};
      (p.texts || []).forEach(function (t) { newTexts[t.id] = t; });
      var newResults = {};
      (p.results || []).forEach(function (r) { newResults[r.id] = r; });

      var oldTexts = deps.db.read("texts").filter(function (t) { return t.user === owner; });
      var oldResults = deps.db.read("results").filter(function (r) { return r.user === owner; });
      var complete =
        oldTexts.length === (p.texts || []).length &&
        oldResults.length === (p.results || []).length &&
        oldTexts.every(function (t) { return newTexts[t.id] && newTexts[t.id].title && newTexts[t.id].body; }) &&
        oldResults.every(function (r) { return newResults[r.id] && newResults[r.id].textTitle; });
      if (!complete) fail("保存した内容が変わっています。ページを開き直してから、もう一度やり直してください。");

      // 失敗したときに戻すための、変更前の内容
      var before = {};
      oldTexts.concat(oldResults).forEach(function (row) { before[row.id] = row; });
      var ownRow = function (row) { return row.user === owner && before[row.id]; };
      var restore = function (table) {
        deps.db.update(table, function (row) { return ownRow(row) ? before[row.id] : null; });
      };

      var salt = deps.randomId();
      try {
        deps.db.update("texts", function (row) {
          if (!ownRow(row)) return null;
          var next = {};
          for (var k in row) next[k] = row[k];
          next.title = newTexts[row.id].title;
          next.body = newTexts[row.id].body;
          return next;
        });
        deps.db.update("results", function (row) {
          if (!ownRow(row)) return null;
          var next = {};
          for (var k in row) next[k] = row[k];
          next.textTitle = newResults[row.id].textTitle;
          return next;
        });
        deps.db.update("users", function (row) {
          if (normalizeUserName(row.name) !== normalizeUserName(owner)) return null;
          return {
            name: row.name, salt: salt, proofHash: deps.hash(salt + p.newProof),
            keySalt: p.keySalt, createdAt: row.createdAt, exportedAt: row.exportedAt,
          };
        });
      } catch (e) {
        try {
          restore("texts");
          restore("results");
        } catch (e2) {
          fail("合言葉を変更できず、もとに戻すこともできませんでした。保存した文章はまだ消さず、管理者に連絡してください。");
        }
        fail("合言葉を変更できませんでした。もとの状態に戻しました。もう一度やり直してください。");
      }
      return { ok: true };
    },

    listTexts: function (p) {
      var owner = ownerOf(p);
      return deps.db.read("texts")
        .filter(function (t) { return t.user === owner; })
        .map(strip);
    },

    addText: function (p) {
      var owner = ownerOf(p);
      if (!p.title || !p.body) fail("文章が空です。");
      var row = { id: "t-" + deps.randomId(), user: owner, title: p.title, body: p.body, createdAt: deps.now() };
      deps.db.append("texts", row);
      return strip(row);
    },

    // 控えのファイルから、複数の文章をまとめて保存する
    addTexts: function (p) {
      var owner = ownerOf(p);
      var list = p.texts || [];
      if (list.some(function (t) { return !t.title || !t.body; })) fail("空の文章があります。");
      return list.map(function (t) {
        var row = { id: "t-" + deps.randomId(), user: owner, title: t.title, body: t.body, createdAt: deps.now() };
        deps.db.append("texts", row);
        return strip(row);
      });
    },

    // 前回の書き出しの日時を返す
    profile: function (p) {
      var user = findUser(ownerOf(p));
      return { exportedAt: user ? user.exportedAt : "" };
    },

    // 書き出した日時を覚える
    markExported: function (p) {
      var owner = ownerOf(p);
      var at = deps.now();
      deps.db.update("users", function (row) {
        if (normalizeUserName(row.name) !== normalizeUserName(owner)) return null;
        var next = {};
        for (var k in row) next[k] = row[k];
        next.exportedAt = at;
        return next;
      });
      return { exportedAt: at };
    },

    deleteText: function (p) {
      var owner = ownerOf(p);
      deps.db.remove("texts", function (t) { return t.id === p.id && t.user === owner; });
      return { ok: true };
    },

    listResults: function (p) {
      var owner = ownerOf(p);
      return deps.db.read("results")
        .filter(function (r) { return r.user === owner; })
        .map(strip);
    },

    addResult: function (p) {
      var owner = ownerOf(p);
      var row = pick("results", p.record || {});
      row.id = "r-" + deps.randomId();
      row.user = owner;
      row.playedAt = deps.now();
      deps.db.append("results", row);
      return strip(row);
    },

    deleteResult: function (p) {
      var owner = ownerOf(p);
      deps.db.remove("results", function (r) { return r.id === p.id && r.user === owner; });
      return { ok: true };
    },
  };

  return {
    call: function (name, payload) {
      var h = handlers[name];
      if (!h) fail("知らない操作です: " + name);
      return h(payload || {});
    },
  };
}
