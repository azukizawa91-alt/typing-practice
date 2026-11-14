"use strict";

// ===== 画面の部品 =====
const $ = (id) => document.getElementById(id);
const el = {
  textSelect: $("textSelect"),
  randomBtn: $("randomBtn"),
  saveTextBtn: $("saveTextBtn"),
  deleteTextBtn: $("deleteTextBtn"),
  pasteOpenBtn: $("pasteOpenBtn"),
  judgeSelect: $("judgeSelect"),
  resultJudge: $("resultJudge"),
  resultStatus: $("resultStatus"),
  layoutSelect: $("layoutSelect"),
  compare: $("compare"),
  practiceView: $("practiceView"),
  panes: $("panes"),
  sample: $("sample"),
  sampleInfo: $("sampleInfo"),
  input: $("input"),
  phase: $("phase"),
  timer: $("timer"),
  message: $("message"),
  resetBtn: $("resetBtn"),
  finishBtn: $("finishBtn"),
  resultView: $("resultView"),
  resultTitle: $("resultTitle"),
  againBtn: $("againBtn"),
  compareNote: $("compareNote"),
  textHistory: $("textHistory"),
  historyBtn: $("historyBtn"),
  historyView: $("historyView"),
  saveStatus: $("saveStatus"),
  loginView: $("loginView"),
  loginForm: $("loginForm"),
  loginHeading: $("loginHeading"),
  loginNotice: $("loginNotice"),
  loginName: $("loginName"),
  loginPass: $("loginPass"),
  loginPass2: $("loginPass2"),
  showPass: $("showPass"),
  passPreview: $("passPreview"),
  registerPreview: $("registerPreview"),
  passChangeBtn: $("passChangeBtn"),
  passDialog: $("passDialog"),
  passForm: $("passForm"),
  passNotice: $("passNotice"),
  passCurrent: $("passCurrent"),
  backupBtn: $("backupBtn"),
  backupDialog: $("backupDialog"),
  backupStatus: $("backupStatus"),
  backupNotice: $("backupNotice"),
  backupExportBtn: $("backupExportBtn"),
  backupManual: $("backupManual"),
  backupText: $("backupText"),
  backupFile: $("backupFile"),
  backupCloseBtn: $("backupCloseBtn"),
  passNew: $("passNew"),
  passNew2: $("passNew2"),
  showNewPass: $("showNewPass"),
  newPassPreview: $("newPassPreview"),
  passCancelBtn: $("passCancelBtn"),
  passSubmitBtn: $("passSubmitBtn"),
  registerFields: $("registerFields"),
  registerCode: $("registerCode"),
  loginSubmit: $("loginSubmit"),
  switchModeBtn: $("switchModeBtn"),
  localHint: $("localHint"),
  versionInfo: $("versionInfo"),
  userName: $("userName"),
  logoutBtn: $("logoutBtn"),
  historyBackBtn: $("historyBackBtn"),
  historySummary: $("historySummary"),
  historyList: $("historyList"),
  stats: $("stats"),
  restNote: $("restNote"),
  compareSample: $("compareSample"),
  compareInput: $("compareInput"),
  kindSummary: $("kindSummary"),
  mistakeList: $("mistakeList"),
  pasteDialog: $("pasteDialog"),
  pasteTitle: $("pasteTitle"),
  pasteBody: $("pasteBody"),
  pasteFile: $("pasteFile"),
  pasteCount: $("pasteCount"),
  pasteMessage: $("pasteMessage"),
  pasteCancelBtn: $("pasteCancelBtn"),
  pasteUseBtn: $("pasteUseBtn"),
  pasteSaveBtn: $("pasteSaveBtn"),
};

const MAX_CHARS = 4000;
const CUSTOM_ID = "custom";

// ===== 今の状態 =====
const state = {
  text: null,         // 練習中の文章 {id, title, body, group}
  customText: null,   // 貼り付けて、まだ保存していない文章（この画面を開いている間だけ）
  savedTexts: [],     // 保存した文章（storage.js から読む）
  judge: "strict",    // 判定。strict=きびしい / lenient=ゆるい
  phase: "ready",     // ready=打つ前 / typing=計測中 / done=結果表示
  startTime: 0,
  timerId: 0,
  deleteComposing: 0, // 変換中（確定前）に BackSpace / Delete を押した回数
  deleteConfirmed: 0, // 確定したあとに BackSpace / Delete を押した回数
  progress: [],       // 打っている途中の進み具合 [{t: 経過秒, len: 入力欄の文字数}]（前半・後半の速さに使う）
  layout: "sample-left", // 配置。sample-left / input-left / sample-top / input-top
};

// ===== 小さな設定の保存（配置・判定など。消えても困らないもの） =====
// 文章や結果のような大事なデータは storage.js で扱う
function loadSetting(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (e) {
    return fallback;
  }
}
function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // 保存できなくても練習には関係ないので何もしない
  }
}

// ===== 文章の選択・保存・削除 =====
const GROUPS = [
  ["custom", "貼り付けた文章（まだ保存していません）"],
  ["ふつう", "ふつう（日常の文章・気軽に）"],
  ["長文", "ふつう・長文（約2倍の長さ）"],
  ["やさしめ", "仕事・やさしめ（記号なし）"],
  ["本番", "仕事・本番（記号・英数字あり）"],
  ["saved", "保存した文章"],
];

// 一覧に出す名前：「【ジャンル】タイトル（○文字）」
function textLabel(t) {
  const genre = t.genre ? `【${t.genre}】` : "";
  return `${genre}${t.title}（${toChars(normalizeText(t.body)).length}文字）`;
}

// 選べる文章をすべて並べる。group で、一覧のどの見出しに入るかを決める
function allTexts() {
  const list = [];
  if (state.customText) list.push({ ...state.customText, group: "custom" });
  for (const t of state.savedTexts) list.push({ ...t, group: "saved" });
  return list.concat(PRESET_TEXTS);
}

function renderTextSelect() {
  el.textSelect.innerHTML = "";
  const texts = allTexts();
  for (const [group, label] of GROUPS) {
    const items = texts.filter((t) => t.group === group);
    if (items.length === 0) continue;
    const og = document.createElement("optgroup");
    og.label = label;
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = textLabel(t);
      og.appendChild(opt);
    }
    el.textSelect.appendChild(og);
  }
  if (state.text) el.textSelect.value = state.text.id;
}

function selectText(id) {
  const t = allTexts().find((x) => x.id === id) || PRESET_TEXTS[0];
  state.text = t;
  el.textSelect.value = t.id;
  saveSetting("typingPracticeLastText", t.id);
  // 見本は、比べるときと同じそろえ方をしたものを見せる
  el.sample.textContent = normalizeText(t.body);
  el.sample.scrollTop = 0;
  el.sampleInfo.textContent = `${toChars(normalizeText(t.body)).length}文字`;
  // 貼り付けたままの文章なら「保存」、保存した文章なら「削除」のボタンを出す
  el.saveTextBtn.hidden = t.group !== "custom";
  el.deleteTextBtn.hidden = t.group !== "saved";
  resetPractice();
}

// 保存や削除のように Google とやりとりする操作を、失敗しても止まらないように包む。
// ログインの期限が切れていたらログイン画面へ、それ以外の失敗はメッセージを出す。
// 成功したら true を返す
async function guarded(task, failMessage, show = showMessage) {
  try {
    await task();
    return true;
  } catch (e) {
    if (isSessionExpired(e)) {
      showLogin("しばらく時間がたったため、ログインが切れました。もう一度ログインしてください。");
    } else {
      show(`${failMessage}（${e.message}）`);
    }
    return false;
  }
}

// 文章を保存して、保存した文章を選んだ状態にする
async function saveText(title, body) {
  showMessage("保存しています…", "info");
  let result;
  const ok = await guarded(async () => {
    result = await store.addText({ title, body });
  }, "文章を保存できませんでした。");
  if (!ok) return;
  const { text, duplicate } = result;
  state.savedTexts = await store.listTexts();
  // 保存できたら「まだ保存していない文章」は不要になる
  if (state.customText && state.customText.body === body) state.customText = null;
  renderTextSelect();
  selectText(text.id);
  showMessage(
    duplicate
      ? `同じ文章が「${text.title}」として保存済みだったので、それを選びました。`
      : `「${text.title}」を保存しました。`,
    "info"
  );
}

// 打っている途中で別の操作をするときの確認
function confirmLeaveTyping() {
  if (state.phase !== "typing" || el.input.value === "") return true;
  return confirm("入力の途中です。やめて、最初からにしますか？");
}

el.textSelect.addEventListener("change", () => {
  if (!confirmLeaveTyping()) {
    el.textSelect.value = state.text.id;
    return;
  }
  selectText(el.textSelect.value);
});

// おまかせ：今と同じ段階の文章から、今のもの以外を1つ選ぶ
el.randomBtn.addEventListener("click", () => {
  if (!confirmLeaveTyping()) return;
  const group = state.text && state.text.group !== "custom" ? state.text.group : "ふつう";
  const candidates = allTexts().filter((t) => t.group === group && t.id !== state.text.id);
  if (candidates.length === 0) {
    showMessage("同じ段階に、ほかの文章がありません。");
    return;
  }
  selectText(candidates[Math.floor(Math.random() * candidates.length)].id);
});

el.saveTextBtn.addEventListener("click", () => {
  if (!state.customText || !confirmLeaveTyping()) return;
  saveText(state.customText.title, state.customText.body);
});

el.deleteTextBtn.addEventListener("click", async () => {
  const t = state.text;
  if (!t || t.group !== "saved") return;
  if (!confirm(`保存した文章「${t.title}」を削除しますか？\n（元に戻せません）`)) return;
  showMessage("削除しています…", "info");
  const ok = await guarded(() => store.deleteText(t.id), "文章を削除できませんでした。");
  if (!ok) return;
  state.savedTexts = await store.listTexts();
  renderTextSelect();
  selectText(PRESET_TEXTS[0].id);
  showMessage(`「${t.title}」を削除しました。`, "info");
});

// ===== 練習の流れ =====
function setPhase(phase) {
  state.phase = phase;
  el.phase.textContent = {
    ready: "準備OK（最初の1文字で計測開始）",
    typing: "計測中",
    done: "終了",
  }[phase];
  el.phase.classList.toggle("typing", phase === "typing");
}

function resetPractice() {
  clearInterval(state.timerId);
  state.startTime = 0;
  state.deleteComposing = 0;
  state.deleteConfirmed = 0;
  state.progress = [];
  el.input.value = "";
  el.input.readOnly = false;
  el.input.scrollTop = 0;
  el.timer.textContent = "0:00";
  showMessage("");
  setPhase("ready");
  showView("practice");
  el.input.focus();
}

function startTyping() {
  if (state.phase !== "ready") return;
  state.startTime = performance.now();
  setPhase("typing");
  state.timerId = setInterval(updateTimer, 250);
}

function elapsedSec() {
  return (performance.now() - state.startTime) / 1000;
}

function updateTimer() {
  const s = Math.floor(elapsedSec());
  el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function finishTyping() {
  if (state.phase !== "typing") {
    showMessage("まだ何も入力していません。");
    return;
  }
  if (normalizeText(el.input.value) === "") {
    showMessage("入力が空のため、終了できません。");
    return;
  }
  const sec = elapsedSec();
  clearInterval(state.timerId);
  setPhase("done");
  el.input.readOnly = true;

  const result = compareTexts(state.text.body, el.input.value, { lenient: state.judge === "lenient" });
  const st = result.stats;
  const halves = halfSpeeds(sec, st.inputChars, st.completed);
  const data = {
    textKey: textKeyOf(state.text.body),
    textId: state.text.id,
    textTitle: state.text.title,     // 文章を消しても分かるように、タイトルを控えておく
    textGroup: state.text.group,
    durationSec: round(sec, 1),
    perMin: round(sec > 0 ? st.correct / (sec / 60) : 0, 1),
    accuracy: round(st.accuracy * 100, 1),
    mistakes: st.mistakes,
    ignored: st.ignored,
    correct: st.correct,
    sampleChars: st.sampleChars,
    inputChars: st.inputChars,
    restCount: st.restCount,
    completed: st.completed,         // 最後まで打ったか（残り3文字以下の打ち忘れは完了扱い）
    tailMissing: st.tailMissing,
    firstHalfPerMin: halves.first,   // 前半の速さ（目安）
    secondHalfPerMin: halves.second, // 後半の速さ（目安）
    deleteComposing: state.deleteComposing,
    deleteConfirmed: state.deleteConfirmed,
    judge: state.judge,
    layout: state.layout,
  };

  // 結果はすぐに見せて、記録の保存はそのあとで行う（Google への保存は1〜2秒かかるため）
  const temp = { ...data, id: null, playedAt: new Date().toISOString() };
  showResult(result, temp);
  await saveResult(data, temp);
}

// 記録を保存する。失敗したら「もう一度保存する」ボタンを出す
async function saveResult(data, temp) {
  setSaveStatus("記録を保存しています…");
  try {
    const record = await store.addResult(data);
    setSaveStatus("記録を保存しました。");
    await renderTextHistory(record);
  } catch (e) {
    if (isSessionExpired(e)) {
      setSaveStatus("ログインが切れたため、記録を保存できませんでした。", true);
    } else {
      setSaveStatus(`記録を保存できませんでした（${e.message}）。`, true, () => saveResult(data, temp));
    }
    await renderTextHistory(temp);
  }
}

// 結果画面の「保存しています／保存しました」の表示。retry を渡すと「もう一度保存する」ボタンを出す
function setSaveStatus(text, isError = false, retry = null) {
  el.saveStatus.textContent = text;
  el.saveStatus.classList.toggle("error", isError);
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary";
    btn.textContent = "もう一度保存する";
    btn.addEventListener("click", retry, { once: true });
    el.saveStatus.appendChild(btn);
  }
}

function round(n, digits) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

// kind="info" はお知らせ（緑）、それ以外は注意（赤）
function showMessage(text, kind) {
  el.message.textContent = text;
  el.message.classList.toggle("info", kind === "info");
}

// 最初の1文字（日本語入力の変換開始も含む）で計測を始める
el.input.addEventListener("compositionstart", startTyping);
el.input.addEventListener("input", () => {
  startTyping();
  // 進み具合を覚えておく（入力欄の文字が変わるたび）
  if (state.phase === "typing") {
    state.progress.push({ t: elapsedSec(), len: toChars(el.input.value).length });
  }
});

// 前半と後半の速さ（1分あたりの入力文字数）を出す。
// 入力した文字数の半分に届いた時刻で、前半と後半に分ける。
// 変換中の文字も数に入るので、目安の数字。短すぎる文章や途中終了のときは出さない（null）
function halfSpeeds(totalSec, inputChars, completed) {
  if (!completed || inputChars < 40 || totalSec <= 0) return { first: null, second: null };
  const half = inputChars / 2;
  const mark = state.progress.find((p) => p.len >= half);
  if (!mark || mark.t <= 0 || mark.t >= totalSec) return { first: null, second: null };
  return {
    first: round(half / (mark.t / 60), 1),
    second: round((inputChars - half) / ((totalSec - mark.t) / 60), 1),
  };
}

el.input.addEventListener("keydown", (e) => {
  const composing = e.isComposing || e.keyCode === 229;

  // 消した回数を数える。変換中は e.key が "Process" になって何のキーか分からないので、
  // 押した物理キーの名前（e.code）で BackSpace / Delete かを見分ける
  const isDelete =
    e.code === "Backspace" || e.code === "Delete" || e.key === "Backspace" || e.key === "Delete";
  if (isDelete && state.phase === "typing" && !el.input.readOnly) {
    if (composing) state.deleteComposing++;
    else state.deleteConfirmed++;
  }

  // 日本語の変換中のキーは、ここから先では扱わない（IME にまかせる）
  if (composing) return;

  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    finishTyping();
    return;
  }
  if (el.input.readOnly) return;

  // Tab キーで次の欄へ移らず、タブ文字を入れる（見本にタブがある文章のため）
  if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    el.input.setRangeText("\t", el.input.selectionStart, el.input.selectionEnd, "end");
    startTyping();
  }
});

// 貼り付けとドラッグでの文字の持ちこみを止める（打つ練習なので）
el.input.addEventListener("paste", (e) => {
  e.preventDefault();
  showMessage("入力欄には貼り付けできません。");
});
el.input.addEventListener("drop", (e) => {
  e.preventDefault();
  showMessage("入力欄には文字を持ちこめません。");
});

el.finishBtn.addEventListener("click", finishTyping);
el.resetBtn.addEventListener("click", () => {
  if (!confirmLeaveTyping()) return;
  resetPractice();
});
el.againBtn.addEventListener("click", resetPractice);

// 打っている途中でページを閉じようとしたら確認する
window.addEventListener("beforeunload", (e) => {
  if (state.phase === "typing" && el.input.value !== "") {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ===== 結果の表示 =====
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function showResult(result, rec) {
  const st = result.stats;
  const lenient = rec.judge === "lenient";
  el.resultTitle.textContent = rec.textTitle;
  el.resultJudge.textContent = `判定：${JUDGE_LABELS[rec.judge]}`;
  el.resultStatus.textContent = isCompleted(rec) ? "" : `途中終了（残り${rec.restCount}文字）`;
  el.resultStatus.hidden = isCompleted(rec);

  const items = [
    ["入力時間", formatTime(rec.durationSec), "", "最初の1文字〜終了"],
    ["速さ", Math.round(rec.perMin), "文字/分", "1分あたりの正しい文字数"],
    ["正確率", rec.accuracy.toFixed(1), "%", "未入力の部分はのぞく"],
    ["ミス", rec.mistakes, "か所",
      lenient ? `ほかに数えなかったちがい ${rec.ignored}か所` : "最後に残ったまちがい"],
    ["正しい文字数", rec.correct, "文字", `見本は${rec.sampleChars}文字`],
    ["入力文字数", rec.inputChars, "文字", "変換したあとの文字数"],
    ["消した回数", rec.deleteComposing + rec.deleteConfirmed, "回",
      `変換中 ${rec.deleteComposing}・確定後 ${rec.deleteConfirmed}`],
  ];
  if (rec.firstHalfPerMin != null) {
    items.push(["前半 → 後半の速さ", `${Math.round(rec.firstHalfPerMin)} → ${Math.round(rec.secondHalfPerMin)}`,
      "文字/分", "入力した文字数で計算（目安）"]);
  }
  el.stats.innerHTML = "";
  for (const [label, value, unit, note] of items) {
    const box = document.createElement("div");
    box.className = "stat";
    box.innerHTML =
      '<div class="stat-label"></div><div class="stat-value"><span class="v"></span><span class="stat-unit"></span></div><div class="stat-note"></div>';
    box.querySelector(".stat-label").textContent = label;
    box.querySelector(".v").textContent = value;
    box.querySelector(".stat-unit").textContent = unit;
    box.querySelector(".stat-note").textContent = note;
    el.stats.appendChild(box);
  }

  if (rec.restCount > 0) {
    el.restNote.textContent =
      `最後の ${rec.restCount} 文字は未入力です（ミスには数えていません）。「途中終了」として記録しました。`;
  } else if (rec.tailMissing > 0) {
    el.restNote.textContent =
      `最後の ${rec.tailMissing} 文字が打たれていませんでした。打ち忘れとみなして「完了」とし、「抜け」のミスに数えました。`;
  }
  el.restNote.hidden = !(rec.restCount > 0 || rec.tailMissing > 0);

  renderCompare(result.segments);
  renderMistakes(result.segments);

  showView("result");
  el.resultView.scrollTop = 0;
  el.againBtn.focus();
}

// ===== 記録の表示 =====
const JUDGE_LABELS = { strict: "きびしい", lenient: "ゆるい" };
const LAYOUT_LABELS = {
  "sample-left": "左見本", "input-left": "左入力", "sample-top": "上見本", "input-top": "上入力",
};
const GROUP_LABELS = { "ふつう": "ふつう", "長文": "長文","やさしめ": "やさしめ", "本番": "本番", saved: "保存", custom: "貼り付け" };

// 最後まで打った記録か（「completed」が無い前の版の記録は、未入力が無ければ完了とみなす）
function isCompleted(r) {
  return r.completed !== undefined ? r.completed : !(r.restCount > 0);
}

// 「10/10（土）14:05」の形
function formatDate(iso) {
  const d = new Date(iso);
  const w = "日月火水木金土"[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()}（${w}）${hh}:${mm}`;
}

function signed(n, digits = 0) {
  const v = round(n, digits);
  if (v === 0) return "±0";
  return (v > 0 ? "+" : "") + v.toFixed(digits);
}

// 記録の表を作る。columns で出す列を選ぶ
function buildHistoryTable(records, { currentId, withText, onDelete } = {}) {
  const cols = [
    ["日時", (r) => formatDate(r.playedAt)],
    ["状態", (r) => (isCompleted(r) ? "完了" : `途中終了（残り${r.restCount}）`)],
    ...(withText ? [["文章", (r) => r.textTitle], ["段階", (r) => GROUP_LABELS[r.textGroup] || ""]] : []),
    ["文字数", (r) => r.sampleChars, "num"],
    ["時間", (r) => formatTime(r.durationSec), "num"],
    ["速さ（文字/分）", (r) => Math.round(r.perMin), "num"],
    ["前半→後半", (r) => (r.firstHalfPerMin != null
      ? `${Math.round(r.firstHalfPerMin)}→${Math.round(r.secondHalfPerMin)}` : "－"), "num"],
    ["正確率", (r) => `${r.accuracy.toFixed(1)}%`, "num"],
    ["ミス", (r) => r.mistakes, "num"],
    ["消した回数（変換中・確定後）", (r) => `${r.deleteComposing + r.deleteConfirmed}（${r.deleteComposing}・${r.deleteConfirmed}）`, "num"],
    ["判定", (r) => JUDGE_LABELS[r.judge] || ""],
    ["配置", (r) => LAYOUT_LABELS[r.layout] || ""],
  ];
  const wrap = document.createElement("div");
  wrap.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "history-table";
  const head = document.createElement("tr");
  for (const [label] of cols) {
    const th = document.createElement("th");
    th.textContent = label;
    head.appendChild(th);
  }
  if (onDelete) head.appendChild(document.createElement("th"));
  const thead = document.createElement("thead");
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of records) {
    const tr = document.createElement("tr");
    if (!isCompleted(r)) tr.classList.add("incomplete");
    if (r.id && r.id === currentId) tr.classList.add("current");
    for (const [, get, cls] of cols) {
      const td = document.createElement("td");
      td.textContent = get(r);
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    if (onDelete) {
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      btn.textContent = "削除";
      btn.addEventListener("click", () => onDelete(r));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// 結果画面：この文章の過去の記録と、前回との比べ
async function renderTextHistory(rec) {
  // 貼り付けたまま（保存していない）文章の番号 "custom" は、どれも同じなので使わない
  const records = await store.listResults({
    textId: rec.textId !== CUSTOM_ID ? rec.textId : null,
    textKey: rec.textKey,
  });
  // 比べるのは、同じ判定で「完了」した記録どうし
  // （判定がちがうと数字の意味が変わる。途中終了は最後まで打った記録と比べられないため）
  const sameJudge = records.filter((r) => r.judge === rec.judge && isCompleted(r));
  const prev = sameJudge.find((r) => r.id !== rec.id && r.playedAt <= rec.playedAt);
  const others = sameJudge.filter((r) => r.id !== rec.id);

  if (!isCompleted(rec)) {
    el.compareNote.textContent = "途中終了のため、前回との比べと自己ベストの判定には入れていません。";
    el.compareNote.hidden = false;
  } else if (prev) {
    const bestBefore = Math.max(...others.map((r) => r.perMin));
    const parts = [
      `速さ ${signed(rec.perMin - prev.perMin)}文字/分`,
      `正確率 ${signed(rec.accuracy - prev.accuracy, 1)}%`,
      `ミス ${signed(rec.mistakes - prev.mistakes)}か所`,
    ];
    el.compareNote.innerHTML = "";
    el.compareNote.appendChild(document.createTextNode(`前回（${formatDate(prev.playedAt)}）と比べて：${parts.join("、")}`));
    if (rec.perMin > bestBefore) {
      const best = document.createElement("span");
      best.className = "best";
      best.textContent = "　速さの自己ベストを更新しました！";
      el.compareNote.appendChild(best);
    }
    el.compareNote.hidden = false;
  } else {
    el.compareNote.textContent = `この文章を「${JUDGE_LABELS[rec.judge]}」の判定で最後まで練習したのは、今回が初めてです。`;
    el.compareNote.hidden = false;
  }

  el.textHistory.innerHTML = "";
  if (records.length === 0) {
    el.textHistory.textContent = "記録がありません。";
    return;
  }
  el.textHistory.appendChild(buildHistoryTable(records.slice(0, 10), { currentId: rec.id }));
  if (records.length > 10) {
    const more = document.createElement("p");
    more.className = "legend";
    more.textContent = `新しいものから10件を表示しています（全部で${records.length}件）。すべては「記録を見る」で見られます。`;
    el.textHistory.appendChild(more);
  }
}

// 記録の一覧の画面
async function renderHistoryView() {
  const records = await store.listResults();
  const totalSec = records.reduce((s, r) => s + r.durationSec, 0);
  const done = records.filter(isCompleted).length;
  el.historySummary.textContent = records.length
    ? `全部で ${records.length} 回（完了 ${done} 回・途中終了 ${records.length - done} 回）、合計 ${formatTime(totalSec)} 練習しました。`
    : "";
  el.historyList.innerHTML = "";
  if (records.length === 0) {
    el.historyList.textContent = "まだ記録がありません。練習して「終了」を押すと、ここに記録されます。";
    return;
  }
  el.historyList.appendChild(
    buildHistoryTable(records, {
      withText: true,
      onDelete: async (r) => {
        if (!confirm(`${formatDate(r.playedAt)}「${r.textTitle}」の記録を削除しますか？\n（元に戻せません）`)) return;
        el.historySummary.textContent = "削除しています…";
        const ok = await guarded(() => store.deleteResult(r.id), "記録を削除できませんでした。",
          (m) => { el.historySummary.textContent = m; });
        if (ok) renderHistoryView();
      },
    })
  );
}

// 画面の切りかえ（login / practice / result / history）
function showView(name) {
  el.loginView.hidden = name !== "login";
  el.practiceView.hidden = name !== "practice";
  el.resultView.hidden = name !== "result";
  el.historyView.hidden = name !== "history";
  document.body.classList.toggle("logged-out", name === "login");
}

el.historyBtn.addEventListener("click", async () => {
  if (!confirmLeaveTyping()) return;
  if (state.phase === "typing") resetPractice();
  await renderHistoryView();
  showView("history");
  el.historyView.scrollTop = 0;
});
el.historyBackBtn.addEventListener("click", resetPractice);

// 見えない文字（スペース・改行・タブ）を、まちがいの中では記号で見せる
// keepBreaks=true のときは、↵ のあとで本当に改行して、行の形をくずさない
function visible(text, keepBreaks) {
  return text
    .replace(/ /g, "␣")
    .replace(/\u3000/g, "□")
    .replace(/\t/g, "→")
    .replace(/\n/g, keepBreaks ? "↵\n" : "↵");
}

function addSpan(parent, className, text, n) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  if (n) span.dataset.n = n;
  parent.appendChild(span);
}

// 見本と入力を左右に並べて、まちがいの場所に同じ番号をつける
function renderCompare(segments) {
  const left = el.compareSample;
  const right = el.compareInput;
  left.innerHTML = "";
  right.innerHTML = "";
  let n = 0;
  for (const seg of segments) {
    if (seg.type === "eq") {
      left.appendChild(document.createTextNode(seg.text));
      right.appendChild(document.createTextNode(seg.text));
    } else if (seg.type === "rest") {
      addSpan(left, "d-rest", seg.text);
    } else {
      n++;
      // ゆるい判定で数えなかったちがいは、色を付けず点線だけにする
      const badge = seg.soft ? "err-no soft" : "err-no";
      addSpan(left, badge, String(n), n);
      addSpan(right, badge, String(n), n);
      if (seg.sample) addSpan(left, seg.soft ? "d-soft" : "d-miss", visible(seg.sample, true), n);
      if (seg.input) addSpan(right, seg.soft ? "d-soft" : "d-extra", visible(seg.input, true), n);
    }
  }
}

function renderMistakes(segments) {
  const errs = segments.filter((s) => s.type === "err");
  el.mistakeList.innerHTML = "";
  el.kindSummary.textContent = "";
  if (errs.length === 0) {
    el.mistakeList.textContent = "まちがいはありませんでした。";
    return;
  }

  // 種類ごとの数（どんなまちがいが多いかを見るため）。数えなかったものは別にする
  const counts = new Map();
  for (const e of errs.filter((x) => !x.soft)) counts.set(e.kind, (counts.get(e.kind) || 0) + 1);
  const softCount = errs.filter((x) => x.soft).length;
  const parts = [...counts].map(([k, c]) => `${k} ${c}`);
  el.kindSummary.textContent =
    "種類ごとの数：" + (parts.length ? parts.join("、") : "なし") +
    (softCount ? `　／　数えなかったちがい ${softCount}` : "");

  const table = document.createElement("table");
  table.className = "mistake-table";
  table.innerHTML = "<thead><tr><th>番号</th><th>見本の行</th><th>種類</th><th>見本</th><th>入力</th><th>ミスに</th></tr></thead>";
  const tbody = document.createElement("tbody");
  errs.forEach((e, i) => {
    const tr = document.createElement("tr");
    tr.dataset.n = i + 1;
    const cells = [
      [String(i + 1), "num"],
      [`${e.line}行目`, "num"],
      [e.kind, ""],
      [e.sample ? visible(e.sample) : "（なし）", ""],
      [e.input ? visible(e.input) : "（なし）", ""],
      [e.soft ? "数えない" : "数える", ""],
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  el.mistakeList.appendChild(table);
}

// 同じ番号のもの（見本・入力・一覧の行）をまとめて強調する
function highlightError(n) {
  for (const x of el.resultView.querySelectorAll(".active")) x.classList.remove("active");
  if (!n) return;
  for (const x of el.resultView.querySelectorAll(`[data-n="${n}"]`)) x.classList.add("active");
}
el.resultView.addEventListener("mouseover", (e) => {
  const t = e.target.closest("[data-n]");
  highlightError(t ? t.dataset.n : null);
});
// 一覧の行を押すと、見本のその場所まで移動する
el.mistakeList.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-n]");
  if (!tr) return;
  highlightError(tr.dataset.n);
  const mark = el.compareSample.querySelector(`.err-no[data-n="${tr.dataset.n}"]`);
  if (mark) mark.scrollIntoView({ block: "center", behavior: "smooth" });
});

// ===== 配置（見本と入力欄の位置）の切り替え =====
const LAYOUTS = ["sample-left", "input-left", "sample-top", "input-top"];

function applyLayout(layout) {
  // 前の版で保存した "row" / "column" は、見本が先の形として読みかえる
  if (layout === "row") layout = "sample-left";
  if (layout === "column") layout = "sample-top";
  if (!LAYOUTS.includes(layout)) layout = "sample-left";
  state.layout = layout;
  el.panes.dataset.layout = layout;
  el.layoutSelect.value = layout;
  el.compare.classList.toggle("input-first", layout.startsWith("input"));
}
el.layoutSelect.addEventListener("change", () => {
  applyLayout(el.layoutSelect.value);
  saveSetting("typingPracticeLayout", state.layout);
  if (state.phase !== "done") el.input.focus();
});

// ===== 判定（きびしい / ゆるい）の切り替え =====
function applyJudge(judge) {
  state.judge = judge === "lenient" ? "lenient" : "strict";
  el.judgeSelect.value = state.judge;
}
el.judgeSelect.addEventListener("change", () => {
  applyJudge(el.judgeSelect.value);
  saveSetting("typingPracticeJudge", state.judge);
  if (state.phase !== "done") el.input.focus();
});

// ===== 自分の文章を貼り付ける =====
function updatePasteCount() {
  el.pasteCount.textContent = toChars(normalizeText(el.pasteBody.value)).length.toLocaleString();
}

el.pasteOpenBtn.addEventListener("click", () => {
  if (!confirmLeaveTyping()) return;
  el.pasteMessage.textContent = "";
  updatePasteCount();
  el.pasteDialog.showModal();
  el.pasteBody.focus();
});
el.pasteBody.addEventListener("input", updatePasteCount);

// テキストファイルを読み込んで、文章の欄に入れる
// メモ帳の保存形式は UTF-8（今のふつう）と Shift_JIS（古い形式）があるので、両方を試す
async function decodeTextFile(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

const MAX_TEXT_FILE_BYTES = 1024 * 1024;

async function loadTextFile(file) {
  el.pasteMessage.textContent = "";
  if (!file) return;
  if (file.size > MAX_TEXT_FILE_BYTES) {
    el.pasteMessage.textContent = "ファイルが大きすぎます（1MBまで）。";
    return;
  }
  const text = await decodeTextFile(file);
  if (isBackupText(text)) {
    el.pasteMessage.textContent = "これは文章の控えのファイルです。上の帯の「文章の控え」から読み込んでください。";
    return;
  }
  el.pasteBody.value = normalizeText(text);
  // タイトルが空なら、ファイル名（.txt を除いたもの）をタイトルにする
  if (!el.pasteTitle.value.trim()) el.pasteTitle.value = file.name.replace(/\.[^.]+$/, "").slice(0, 60);
  updatePasteCount();
  el.pasteBody.focus();
}

el.pasteFile.addEventListener("change", async () => {
  await loadTextFile(el.pasteFile.files[0]);
  el.pasteFile.value = ""; // 同じファイルをもう一度選んでも読み込めるように
});

// 文章の欄にファイルをドラッグして落とした場合（文字のドラッグはそのまま）
el.pasteBody.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
el.pasteBody.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length === 0) return;
  e.preventDefault();
  loadTextFile(e.dataTransfer.files[0]);
});
el.pasteCancelBtn.addEventListener("click", () => el.pasteDialog.close());

// 窓に入れた文章を確かめて {title, body} を返す。だめなら null
function readPasteForm() {
  const body = normalizeText(el.pasteBody.value);
  const len = toChars(body).length;
  if (len === 0) {
    el.pasteMessage.textContent = "文章が入っていません。";
    return null;
  }
  if (len > MAX_CHARS) {
    el.pasteMessage.textContent = `${MAX_CHARS.toLocaleString()}文字以内にしてください。`;
    return null;
  }
  const title = el.pasteTitle.value.trim() || body.split("\n")[0].slice(0, 20);
  return { title, body };
}

function clearPasteForm() {
  el.pasteTitle.value = "";
  el.pasteBody.value = "";
  el.pasteDialog.close();
}

el.pasteUseBtn.addEventListener("click", () => {
  const form = readPasteForm();
  if (!form) return;
  state.customText = { id: CUSTOM_ID, ...form };
  clearPasteForm();
  renderTextSelect();
  selectText(CUSTOM_ID);
});

el.pasteSaveBtn.addEventListener("click", async () => {
  const form = readPasteForm();
  if (!form) return;
  clearPasteForm();
  await saveText(form.title, form.body);
});

// ===== ログイン =====
// 画面に出す版の番号。Google に貼り直したあと、ここが新しくなっていれば貼り付けは成功
const APP_VERSION = "2026-11-07b";
const NEW_PASS_RULE = "合言葉は、半角の英字・数字・記号で8文字以上にしてください。日本語は使えません。";

let registerMode = false; // true のときは「新しく登録」の画面

function setRegisterMode(on) {
  registerMode = on;
  el.registerFields.hidden = !on;
  el.loginHeading.textContent = on ? "新しく登録" : "ログイン";
  el.loginSubmit.textContent = on ? "登録してはじめる" : "ログイン";
  el.switchModeBtn.textContent = on ? "登録ずみの方は、こちらからログイン" : "はじめての方は、こちらから新しく登録";
  setLoginNotice("");
}

function setLoginNotice(text, kind) {
  el.loginNotice.textContent = text;
  el.loginNotice.classList.toggle("info", kind === "info");
}

// 合言葉の確認表示。入力欄は隠したままにして、別の場所に文字を見せる
// （入力欄を通常の欄に変えると、日本語入力が働いて予測変換に残るおそれがあるため）
function updatePreview(checkbox, input, preview) {
  preview.hidden = !checkbox.checked || input.value === "";
  preview.textContent = preview.hidden ? "" : `入力中の合言葉：${input.value}`;
}

function updateLoginPreviews() {
  updatePreview(el.showPass, el.loginPass, el.passPreview);
  updatePreview(el.showPass, el.registerCode, el.registerPreview);
}

function clearLoginFields() {
  el.loginPass.value = "";
  el.loginPass2.value = "";
  el.registerCode.value = "";
  el.showPass.checked = false;
  updateLoginPreviews();
}

function showLogin(notice = "") {
  clearInterval(state.timerId);
  store.clearSession();
  state.savedTexts = [];
  state.customText = null;
  clearLoginFields();
  closePassDialog();
  if (el.backupDialog.open) el.backupDialog.close();
  showView("login");
  setLoginNotice(notice);
  el.loginName.focus();
}

// ログインできたら、自分の文章を読みこんで練習画面へ
function enterApp() {
  el.userName.textContent = `${store.session.name} さん`;
  state.savedTexts = store.texts.length ? [...store.texts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  renderTextSelect();
  // 前回選んでいた文章から始める（無ければ最初の文章）
  selectText(loadSetting("typingPracticeLastText", PRESET_TEXTS[0].id));
  const newCount = store.newTextCount();
  if (newCount > 0) {
    showMessage(`まだ控えを取っていない文章が${newCount}件あります。上の帯の「文章の控え」から書き出せます。`, "info");
  }
}

el.switchModeBtn.addEventListener("click", () => setRegisterMode(!registerMode));

el.showPass.addEventListener("change", updateLoginPreviews);
el.loginPass.addEventListener("input", updateLoginPreviews);
el.registerCode.addEventListener("input", updateLoginPreviews);

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.loginName.value.trim();
  const pass = el.loginPass.value;
  if (!name || !SecretBox.normalizePass(pass)) {
    setLoginNotice("利用者名と合言葉を入れてください。");
    return;
  }
  if (registerMode) {
    if (!SecretBox.isValidNewPass(pass)) {
      setLoginNotice(NEW_PASS_RULE);
      return;
    }
    if (SecretBox.normalizePass(pass) !== SecretBox.normalizePass(el.loginPass2.value)) {
      setLoginNotice("確認のための合言葉が一致しません。");
      return;
    }
    // みんなが知っている言葉を自分の合言葉にすると、だれでもログインできてしまうので防ぐ
    // （この確認は画面の中だけで行う。登録する本人は登録用の合言葉をもう知っているので、新しく分かることはない）
    if (samePass(pass, el.registerCode.value)) {
      setLoginNotice("自分の合言葉に、登録用の合言葉と同じものは使えません。別の合言葉にしてください。");
      return;
    }
    if (samePass(pass, name)) {
      setLoginNotice("自分の合言葉に、利用者名と同じものは使えません。別の合言葉にしてください。");
      return;
    }
  }
  el.loginSubmit.disabled = true;
  setLoginNotice(registerMode ? "登録しています…" : "ログインしています…", "info");
  try {
    if (registerMode) await store.register(name, pass, el.registerCode.value);
    else await store.login(name, pass);
    clearLoginFields();
    setRegisterMode(false);
    enterApp();
  } catch (err) {
    setLoginNotice(err.message);
  } finally {
    el.loginSubmit.disabled = false;
  }
});

function samePass(a, b) {
  return SecretBox.normalizePass(a).toLowerCase() === SecretBox.normalizePass(b).toLowerCase();
}

// ===== 合言葉の変更 =====
function openPassDialog() {
  el.passNotice.textContent = "";
  el.passNotice.classList.remove("info");
  el.passCurrent.value = "";
  el.passNew.value = "";
  el.passNew2.value = "";
  el.showNewPass.checked = false;
  updatePreview(el.showNewPass, el.passNew, el.newPassPreview);
  el.passDialog.showModal();
  el.passCurrent.focus();
}

function closePassDialog() {
  el.passCurrent.value = "";
  el.passNew.value = "";
  el.passNew2.value = "";
  el.newPassPreview.textContent = "";
  if (el.passDialog.open) el.passDialog.close();
}

el.passChangeBtn.addEventListener("click", () => {
  if (!confirmLeaveTyping()) return;
  if (state.phase === "typing") resetPractice();
  openPassDialog();
});

el.showNewPass.addEventListener("change", () => updatePreview(el.showNewPass, el.passNew, el.newPassPreview));
el.passNew.addEventListener("input", () => updatePreview(el.showNewPass, el.passNew, el.newPassPreview));

el.passCancelBtn.addEventListener("click", closePassDialog);

el.passForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const showNotice = (text, kind) => {
    el.passNotice.textContent = text;
    el.passNotice.classList.toggle("info", kind === "info");
  };
  const current = el.passCurrent.value;
  const next = el.passNew.value;
  if (!SecretBox.normalizePass(current)) {
    showNotice("今の合言葉を入れてください。");
    return;
  }
  if (!SecretBox.isValidNewPass(next)) {
    showNotice(NEW_PASS_RULE);
    return;
  }
  if (SecretBox.normalizePass(next) !== SecretBox.normalizePass(el.passNew2.value)) {
    showNotice("確認のための合言葉が一致しません。");
    return;
  }
  if (samePass(next, store.session.name)) {
    showNotice("自分の合言葉に、利用者名と同じものは使えません。別の合言葉にしてください。");
    return;
  }
  if (samePass(next, current)) {
    showNotice("今の合言葉とは別のものにしてください。");
    return;
  }
  el.passSubmitBtn.disabled = true;
  showNotice("変更しています…", "info");
  try {
    await store.changePassphrase(current, next);
    closePassDialog();
    showMessage("合言葉を変更しました。次回から新しい合言葉でログインしてください。", "info");
  } catch (err) {
    if (isSessionExpired(err)) showLogin("しばらく時間がたったため、ログインが切れました。もう一度ログインしてください。");
    else showNotice(err.message);
  } finally {
    el.passSubmitBtn.disabled = false;
  }
});

// ===== 文章の控え（書き出し・まとめて読み込み） =====
function setBackupNotice(text, kind) {
  el.backupNotice.textContent = text;
  el.backupNotice.classList.toggle("info", kind === "info");
}

function renderBackupStatus() {
  const total = store.texts.length;
  const last = store.exportedAt ? formatDate(store.exportedAt) : "まだ書き出していません";
  const count = store.newTextCount();
  el.backupStatus.textContent =
    `保存した文章：${total}件　／　前回の書き出し：${last}` +
    (count > 0 ? `　／　控えを取っていない文章：${count}件` : "");
  el.backupExportBtn.disabled = total === 0;
}

el.backupBtn.addEventListener("click", () => {
  if (!confirmLeaveTyping()) return;
  if (state.phase === "typing") resetPractice();
  setBackupNotice("");
  el.backupManual.hidden = true;
  el.backupManual.open = false;
  el.backupText.value = "";
  renderBackupStatus();
  el.backupDialog.showModal();
});

el.backupCloseBtn.addEventListener("click", () => {
  el.backupText.value = "";
  el.backupDialog.close();
});

// ファイルとして保存する。保存されない環境のために、同じ中身を窓の中にも出す
function downloadTextFile(name, content) {
  const url = URL.createObjectURL(new Blob(["﻿", content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

el.backupExportBtn.addEventListener("click", async () => {
  const oldestFirst = [...store.texts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const content = buildBackup(oldestFirst);
  downloadTextFile(backupFileName(), content);
  el.backupText.value = content;
  el.backupManual.hidden = false;
  setBackupNotice("書き出しました。自分だけが見られる場所にしまったら、共用のPCからは消してください。", "info");
  // 書き出した日時を覚える。ここで失敗しても、ファイルはもう手元にある
  const ok = await guarded(() => store.markExported(), "書き出した日時を覚えられませんでした。", setBackupNotice);
  if (ok) renderBackupStatus();
});

el.backupFile.addEventListener("change", async () => {
  const file = el.backupFile.files[0];
  el.backupFile.value = ""; // 同じファイルをもう一度選んでも読み込めるように
  if (!file) return;
  if (file.size > MAX_TEXT_FILE_BYTES) {
    setBackupNotice("ファイルが大きすぎます（1MBまで）。");
    return;
  }
  const raw = await decodeTextFile(file);
  if (!isBackupText(raw)) {
    setBackupNotice("文章の控えのファイルではありません。「文章を書き出す」で作ったファイルを選んでください。");
    return;
  }
  const texts = parseBackup(raw);
  const usable = texts.filter((t) => toChars(t.body).length <= MAX_CHARS);
  const tooLong = texts.length - usable.length;
  if (usable.length === 0) {
    setBackupNotice(tooLong > 0 ? "読み込める文章がありません（4,000文字までです）。" : "ファイルの中に文章がありません。");
    return;
  }
  setBackupNotice("読み込んでいます…", "info");
  let result;
  const ok = await guarded(async () => {
    result = await store.addTexts(usable);
  }, "読み込めませんでした。", setBackupNotice);
  if (!ok) return;
  state.savedTexts = await store.listTexts();
  renderTextSelect();
  renderBackupStatus();
  const parts = [`${result.added}件を読み込みました`];
  if (result.skipped > 0) parts.push(`同じ文章${result.skipped}件はとばしました`);
  if (tooLong > 0) parts.push(`4,000文字を超える${tooLong}件は読み込めませんでした`);
  setBackupNotice(`${parts.join("。")}。`, "info");
});

el.logoutBtn.addEventListener("click", async () => {
  if (!confirmLeaveTyping()) return;
  await store.logout();
  showLogin();
  setLoginNotice("ログアウトしました。", "info");
});

// ===== はじめに =====
async function init() {
  applyLayout(loadSetting("typingPracticeLayout", "sample-left"));
  applyJudge(loadSetting("typingPracticeJudge", "strict"));
  el.localHint.hidden = store.inGoogle;
  el.versionInfo.textContent = `画面の版：${APP_VERSION}${store.inGoogle ? "" : "（このPCで試す版）"}`;
  // Google 側の版も確かめる（貼り付けがうまくいったかの確認に使う）
  if (store.inGoogle) {
    callApi("ping", {})
      .then((r) => {
        el.versionInfo.textContent = `画面の版：${APP_VERSION}　／　Google 側の版：${r.version}`;
      })
      .catch(() => {});
  }
  showView("login");
  setLoginNotice("読みこんでいます…", "info");
  // 同じタブで前にログインしていれば、そのまま続ける
  if (await store.restore()) {
    enterApp();
  } else {
    showLogin();
  }
}
init();
