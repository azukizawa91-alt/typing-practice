// 見本と入力した文を照らし合わせるための関数
// 画面には関係しない「計算だけ」の部分なので、app.js とファイルを分けている

// 比べる前のそろえ方（おすすめ判定）
// ・改行の種類（\r\n など）をそろえる
// ・見た目が同じでも中身がちがう文字（「が」と「か＋゛」など）をそろえる
// ・行の終わりのスペースと、文章の最後の改行は数えない
// ・それ以外（行の先頭の全角スペース、全角/半角のちがいなど）はそのまま比べる
function normalizeText(s) {
  return s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t　]+$/gm, "")
    .replace(/\n+$/, "");
}

// 文章の中身から「目印」を作る（同じ中身なら同じ目印になる）
// 結果を「同じ文章ごと」にまとめるために使う。保存していない貼り付け文章でも使える
function textKeyOf(body) {
  const s = normalizeText(body);
  let h = 0x811c9dc5; // FNV-1a という、短い目印を作るよく知られた計算方法
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `k${h.toString(16)}-${s.length}`;
}

// 1文字ずつに分ける（絵文字など2つ分の大きさの文字も1文字として数える）
function toChars(s) {
  return Array.from(s);
}

// 「最長共通部分」（両方に同じ順番で出てくる文字をいちばん多く拾う方法）で、
// 見本と入力の対応を1文字ずつ求める。
// 返り値: [{op:"eq"|"del"|"ins", ch}]
//   eq  = 合っていた文字
//   del = 見本にあるのに入力に無い文字
//   ins = 見本に無いのに入力した文字
function diffChars(a, b) {
  const ops = [];

  // 先頭の合っている部分は計算を省く（長い文章でも速くするため）
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) {
    ops.push({ op: "eq", ch: a[p] });
    p++;
  }
  const A = a.slice(p);
  const B = b.slice(p);
  const n = A.length;
  const m = B.length;
  const W = m + 1;

  // dp[i*W+j] = A[i..] と B[j..] で共通に拾える文字の数
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = A[i] === B[j]
        ? dp[(i + 1) * W + j + 1] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }

  // 前からたどる（同じ文字ならできるだけ早く合わせる → 途中でやめた分は最後にまとまる）
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ op: "eq", ch: A[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) {
      ops.push({ op: "del", ch: A[i] });
      i++;
    } else {
      ops.push({ op: "ins", ch: B[j] });
      j++;
    }
  }
  while (i < n) ops.push({ op: "del", ch: A[i++] });
  while (j < m) ops.push({ op: "ins", ch: B[j++] });
  return ops;
}

// 照らし合わせの結果を「かたまり」に分けて、数字を計算する
// 返り値:
//   segments: [{type:"eq", text} | {type:"err", kind, sample, input, line} | {type:"rest", text}]
//   stats:    数字のまとめ
// 最後の何文字までの打ち忘れなら「完了」とみなすか（ユーザー決定：3文字）
const TAIL_TOLERANCE = 3;

// options.lenient = true のときは「ゆるい判定」
//   全角/半角・大文字/小文字・似た記号・スペースや改行だけのちがいは、ミスに数えない
function compareTexts(sampleRaw, inputRaw, options = {}) {
  const sample = toChars(normalizeText(sampleRaw));
  const input = toChars(normalizeText(inputRaw));
  const ops = diffChars(sample, input);

  // 連続する eq / それ以外 をまとめる
  const runs = [];
  for (const o of ops) {
    const isEq = o.op === "eq";
    let last = runs[runs.length - 1];
    if (!last || last.isEq !== isEq) {
      last = { isEq, eq: [], del: [], ins: [] };
      runs.push(last);
    }
    last[o.op].push(o.ch);
  }

  const segments = [];
  let line = 1;          // 見本の何行目にいるか
  let correct = 0;       // 合っていた文字数
  let judged = 0;        // 正確率の分母（合っていた文字 + まちがいの文字）
  let mistakes = 0;      // まちがいの箇所数
  let ignored = 0;       // ゆるい判定で数えなかった箇所数
  let restCount = 0;     // 最後に打たなかった文字数（0 なら「完了」、1 以上なら「途中終了」）
  let tailMissing = 0;   // 最後の打ち忘れとして「抜け」に数えた文字数

  runs.forEach((r, idx) => {
    if (r.isEq) {
      const text = r.eq.join("");
      segments.push({ type: "eq", text });
      correct += r.eq.length;
      judged += r.eq.length;
      line += countNewlines(text);
      return;
    }

    let del = r.del;
    const ins = r.ins;
    const isLast = idx === runs.length - 1;

    // 最後のかたまりで見本の文字が余っている → 途中で終えた分（未入力）として分ける
    // 入力が少しある場合は、その文字数ぶんだけを「まちがい」として扱う
    // ただし残りが TAIL_TOLERANCE 文字以下なら、最後の打ち忘れとみなして「完了」扱いにし、
    // 残りの文字は「抜け」のミスとして数える（最後の「。」だけ忘れた、など）
    let rest = [];
    if (isLast && del.length > ins.length) {
      const left = del.length - ins.length;
      if (left <= TAIL_TOLERANCE) {
        tailMissing = left;
      } else {
        rest = del.slice(ins.length);
        del = del.slice(0, ins.length);
      }
    }

    if (del.length > 0 || ins.length > 0) {
      const s = del.join("");
      const t = ins.join("");
      const names = errorKindNames(s, t);
      const kind = names ? names.join("・") : t === "" ? "抜け" : s === "" ? "余分" : "ちがい";
      const soft = Boolean(options.lenient && names && names.every((n) => LENIENT_KINDS.includes(n)));
      segments.push({ type: "err", kind, soft, sample: s, input: t, line });
      if (soft) {
        // 数えないちがいは、見本の文字を正しく打てたものとして扱う
        ignored++;
        correct += del.length;
        judged += del.length;
      } else {
        mistakes++;
        judged += Math.max(del.length, ins.length);
      }
      line += countNewlines(s);
    }
    if (rest.length > 0) {
      segments.push({ type: "rest", text: rest.join("") });
      restCount = rest.length;
    }
  });

  return {
    segments,
    stats: {
      sampleChars: sample.length,
      inputChars: input.length,
      correct,
      mistakes,
      ignored,
      restCount,
      tailMissing,
      completed: restCount === 0,
      accuracy: judged > 0 ? correct / judged : 0,
    },
  };
}

function countNewlines(s) {
  let c = 0;
  for (const ch of s) if (ch === "\n") c++;
  return c;
}

// 見た目が似ていてまちがえやすい記号のグループ（全角の形も入れておく）
const SIMILAR_GROUPS = ["ー-‐−–—―－", "~〜～", "'‘’＇", "\"“”＂"];

function toSimilarBase(s) {
  return Array.from(s).map((ch) => {
    const g = SIMILAR_GROUPS.find((x) => x.includes(ch));
    return g ? g[0] : ch;
  }).join("");
}

// カタカナをひらがなにそろえる（ァ〜ヶ）
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 「どんなちがいか」を調べるための、そろえ方の一覧
// 上から順に重ねてそろえていき、一致したら、そのちがいの種類が分かる
const KIND_STEPS = [
  ["全角/半角", (s) => s.normalize("NFKC")],
  ["大文字/小文字", (s) => s.toLowerCase()],
  ["ひらがな/カタカナ", kataToHira],
  ["似た記号", toSimilarBase],
  ["スペース・改行", (s) => s.replace(/\s/g, "")],
];

// ゆるい判定で「ミスに数えない」種類
const LENIENT_KINDS = ["全角/半角", "大文字/小文字", "似た記号", "スペース・改行"];

// まちがいの種類を調べる。上の一覧のどれかで説明できれば、その名前の配列を返す
// 説明できないとき（抜け・余分・ちがい）は null
// 種類は「どんなまちがいが多いか」を知るための目印
function errorKindNames(sample, input) {
  const applySteps = (s, steps) => steps.reduce((acc, [, fn]) => fn(acc), s);
  const same = (steps) => applySteps(sample, steps) === applySteps(input, steps);

  // 何段目までそろえたら一致するか
  let k = -1;
  for (let i = 0; i < KIND_STEPS.length; i++) {
    if (same(KIND_STEPS.slice(0, i + 1))) {
      k = i;
      break;
    }
  }
  if (k < 0) return null;

  // 一致するのに本当に必要だったそろえ方だけを、種類として並べる
  const used = KIND_STEPS.slice(0, k + 1);
  const names = used
    .filter((step) => !same(used.filter((x) => x !== step)))
    .map(([name]) => name);
  return names.length ? names : null;
}
