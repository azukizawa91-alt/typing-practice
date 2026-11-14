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
