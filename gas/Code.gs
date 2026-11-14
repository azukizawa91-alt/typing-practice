// ===== タイピング練習：Google 側のプログラム（Code.gs） =====
// ★このファイルは tools/build-gas.sh で作られたもの。直すときは gas-src/Code.head.gs と server-core.js を直す。
//
// 前半：スプレッドシートや Google の機能とのやりとり（ここ）
// 後半：中身の処理（server-core.js をそのままつなげたもの）
//
// 管理者が最初に1回だけやること（くわしくは gas/README.md）
//   1. 関数「setup」を実行して、シートを作る
//   2. プロジェクトの設定 → スクリプト プロパティ に REGISTER_CODE（登録用の合言葉）を入れる

// ページを開いたとき（URL を開いたとき）に画面を返す
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("タイピング練習")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// 画面から呼ばれる、ただ一つの入口。name で操作を選ぶ
function api(name, payload) {
  var server = createServer(gasDeps());
  if (WRITE_ACTIONS.indexOf(name) < 0) return server.call(name, payload);

  // 書きこむ処理は、同時に動かないように順番待ちをする（最大20秒）
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return server.call(name, payload);
  } finally {
    lock.releaseLock();
  }
}

// 最初に1回だけ実行する：シートを3つ作る。
// もうあるシートは、1行目の見出しだけを最新のもの（日本語）に書き直す（2行目より下のデータはさわらない）
// あわせて、シートに「警告を表示」の保護をかける。人が直接書きかえようとすると確認が出る（うっかり防止）。
// この保護は人の操作にだけ働き、アプリ（このプログラム）の保存や削除はそのままできる
function setup() {
  Object.keys(TABLES).forEach(function (table) {
    var def = TABLES[table];
    var sh = sheetFor(table);
    sh.getRange(1, 1, 1, def.labels.length).setValues([def.labels]);
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      sh.protect()
        .setDescription("タイピング練習アプリが使うシートです。直接書きかえないでください。")
        .setWarningOnly(true);
    }
  });
  var code = PropertiesService.getScriptProperties().getProperty("REGISTER_CODE");
  Logger.log("シートの準備ができました。版: " + CODE_VERSION);
  Logger.log(code ? "登録用の合言葉は設定ずみです。" : "★登録用の合言葉（REGISTER_CODE）がまだです。プロジェクトの設定から入れてください。");
}

// 表に対応するシートを取り出す。無ければ作り、見出しを入れて、全部の列を「文字」の書式にする
// （書式を文字にしないと、日時や数字が Google に勝手に変換されてしまうため）
// ★列は「見出しの名前」ではなく「順番」で読み書きする（TABLES の fields の順）。
//   見出しは管理者が読むための日本語なので、プログラムは見出しを使わない
function sheetFor(table) {
  var def = TABLES[table];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.getRange(1, 1, 1, def.labels.length).setValues([def.labels]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), def.fields.length).setNumberFormat("@");
  }
  return sh;
}

// 読みこんだ文字を、数字や はい/いいえ に戻す
function convertCell(def, field, v) {
  if (def.numbers && def.numbers.indexOf(field) >= 0) return v === "" || v === null ? null : Number(v);
  if (def.booleans && def.booleans.indexOf(field) >= 0) return v === true || String(v).toLowerCase() === "true";
  return v === null ? "" : String(v);
}

// シートの1行分（値の並び）を、名前つきのまとまりに直す
function rowToObject(def, values) {
  var obj = {};
  for (var c = 0; c < def.fields.length; c++) {
    obj[def.fields[c]] = convertCell(def, def.fields[c], values[c] === undefined ? "" : values[c]);
  }
  return obj;
}

function gasDeps() {
  var cache = CacheService.getScriptCache();
  return {
    db: {
      read: function (table) {
        var def = TABLES[table];
        var values = sheetFor(table).getDataRange().getValues();
        var rows = [];
        for (var i = 1; i < values.length; i++) rows.push(rowToObject(def, values[i]));
        return rows;
      },
      append: function (table, obj) {
        var def = TABLES[table];
        var sh = sheetFor(table);
        var row = def.fields.map(function (f) {
          return obj[f] === undefined || obj[f] === null ? "" : String(obj[f]);
        });
        var r = sh.getLastRow() + 1;
        sh.getRange(r, 1, 1, row.length).setNumberFormat("@").setValues([row]);
      },
      // change(行) が返した内容で、その行を書きかえる（null の行はそのまま）。全部まとめて1回で書く
      update: function (table, change) {
        var def = TABLES[table];
        var sh = sheetFor(table);
        var values = sh.getDataRange().getValues();
        if (values.length < 2) return;
        var rows = [];
        var changed = false;
        for (var i = 1; i < values.length; i++) {
          var next = change(rowToObject(def, values[i]));
          if (next) {
            changed = true;
            rows.push(def.fields.map(function (f) {
              return next[f] === undefined || next[f] === null ? "" : String(next[f]);
            }));
          } else {
            rows.push(def.fields.map(function (f, c) { return values[i][c] === undefined ? "" : values[i][c]; }));
          }
        }
        if (changed) sh.getRange(2, 1, rows.length, def.fields.length).setValues(rows);
      },
      remove: function (table, match) {
        var def = TABLES[table];
        var sh = sheetFor(table);
        var values = sh.getDataRange().getValues();
        // 下の行から消す（上から消すと行の番号がずれるため）
        for (var i = values.length - 1; i >= 1; i--) {
          if (match(rowToObject(def, values[i]))) sh.deleteRow(i + 1);
        }
      },
    },
    hash: function (text) {
      return Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
      );
    },
    sessions: {
      // 入館証は6時間で自動的に消える（Google の決まりで、これより長くできない）
      put: function (token, name) { cache.put("s:" + token, name, 21600); },
      get: function (token) { return cache.get("s:" + token); },
      remove: function (token) { cache.remove("s:" + token); },
    },
    randomId: function () {
      return Utilities.getUuid().replace(/-/g, "");
    },
    registerCode: function () {
      return PropertiesService.getScriptProperties().getProperty("REGISTER_CODE") || "";
    },
    // 日本時間で「2026-10-17T13:36:42.958+09:00」の形（スプレッドシートで見ても分かるように）
    now: function () {
      return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
    },
  };
}

// ===== ここから下は server-core.js（中身の処理） =====
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
//   randomId()              … ぶつからない、でたらめな文字列
//   registerCode()          … 新しく登録するときの「登録用の合言葉」（管理者が決める）
//   now()                   … 今の日時（ISO 形式の文字列）
//
// ★大事な決まり: どの処理も、必ず「入館証の持ち主」の行だけを読み書きする。
//   ブラウザ側から別の人の名前を送られても、ここで持ち主を決めるので、他の人のデータは出ない。

var CODE_VERSION = "2026-11-07b";

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
      if (String(p.registerCode || "").normalize("NFKC").trim() !== String(code).normalize("NFKC").trim()) {
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

    login: function (p) {
      var user = findUser(p.name);
      if (!user || deps.hash(user.salt + p.proof) !== user.proofHash) {
        fail("利用者名か合言葉がちがいます。");
      }
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
