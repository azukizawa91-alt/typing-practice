// ===== 文章の控え（書き出すファイルの形） =====
// 保存した文章を、メモ帳でも読める1つのテキストファイルにまとめる。
// ★このファイルには鍵がかかっていない（読みこみ直せるように、文章をそのまま書く）。
//
// 形：
//   === タイピング練習の文章（2026年11月7日に書き出し） ===
//
//   --- タイトル：〇〇 ---
//   本文
//
// 本文の行が「---」や「\」で始まるときは、行の先頭に「\」を足して、区切りとまちがえないようにする。

const BACKUP_HEADER = "=== タイピング練習の文章";
const BACKUP_TITLE_START = "--- タイトル：";
const BACKUP_TITLE_END = " ---";

// ファイルの中身が、この形の控えかどうか
function isBackupText(raw) {
  return raw.replace(/^﻿/, "").startsWith(BACKUP_HEADER);
}

// texts = [{ title, body }] を、ファイルの中身（文字列）にする
function buildBackup(texts, now = new Date()) {
  const date = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  const lines = [`${BACKUP_HEADER}（${date}に書き出し） ===`, ""];
  for (const t of texts) {
    lines.push(`${BACKUP_TITLE_START}${t.title.replace(/\s*\n\s*/g, " ")}${BACKUP_TITLE_END}`);
    for (const line of t.body.split("\n")) {
      lines.push(/^(---|\\)/.test(line) ? `\\${line}` : line);
    }
    lines.push("");
  }
  return lines.join("\r\n");
}

// ファイルの中身を [{ title, body }] に戻す
function parseBackup(raw) {
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const texts = [];
  let current = null;
  for (const line of lines.slice(1)) {
    if (line.startsWith(BACKUP_TITLE_START) && line.endsWith(BACKUP_TITLE_END)) {
      const title = line.slice(BACKUP_TITLE_START.length, line.length - BACKUP_TITLE_END.length).trim();
      current = { title, lines: [] };
      texts.push(current);
    } else if (current) {
      current.lines.push(line.startsWith("\\") ? line.slice(1) : line);
    }
  }
  return texts
    .map((t) => ({ title: t.title, body: normalizeText(t.lines.join("\n")) }))
    .filter((t) => t.title && t.body);
}

// 書き出すファイルの名前
function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `タイピング練習_文章_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.txt`;
}
