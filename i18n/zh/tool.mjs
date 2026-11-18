#!/usr/bin/env node
// 中文译本工具：英文原文 → 译文 的段落对照。
//
//   node i18n/zh/tool.mjs extract   # 按英文原文刷新对照文件（新增段落留空，保留已有译文）
//   node i18n/zh/tool.mjs build     # 由英文原文 + 对照文件生成 docs/zh/** 页面，并更新 docs.json 中文标签页
//   node i18n/zh/tool.mjs status    # 列出各页未翻译 / 过期段落数
//
// 对照文件位于 i18n/zh/segments/<页面路径>.txt，格式：
//
//   @@ <段落 id>
//   <英文原文，原样>
//   @@ zh
//   <中文译文>
//
// 段落 id = 英文段落（空白折叠后）的 sha1 前 10 位。上游改了某段，id 就变，
// extract 会把旧条目移到文件末尾标记为 stale，供重译时参考。

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DOCS = path.join(ROOT, "docs");
const SEG_DIR = path.join(HERE, "segments");
const PAGES_FILE = path.join(HERE, "pages.json");
const TAB_NAME = "中文（非官方）";

const FM_KEYS = ["title", "sidebarTitle", "description"];

const norm = (s) => s.replace(/\s+/g, " ").trim();
const segId = (en) => createHash("sha1").update(norm(en)).digest("hex").slice(0, 10);

function loadPages() {
  return JSON.parse(fs.readFileSync(PAGES_FILE, "utf8"));
}
// pages.json 里的条目：字符串 = 要翻译的英文页面路径；
// { "original": "路径" } = docs/zh/ 下手写的原创页（如解读页），只进导航，不参与抽取和生成。
const allPages = (cfg) => cfg.groups.flatMap((g) => g.pages).filter((p) => typeof p === "string");
const navPath = (p) => "zh/" + (typeof p === "string" ? p : p.original);

// ---------- 解析英文 MDX ----------

// 返回 { fm: [{key, value, raw}], fmRest: [lines], chunks: [{type:'text'|'code'|'blank', lines}] }
function parseMdx(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  const fm = [];
  const fmOther = [];
  if (lines[0] === "---") {
    i = 1;
    while (i < lines.length && lines[i] !== "---") {
      const m = lines[i].match(/^(\w+):\s*(.*)$/);
      if (m && FM_KEYS.includes(m[1])) fm.push({ key: m[1], value: m[2] });
      else fmOther.push(lines[i]);
      i++;
    }
    i++; // 跳过结尾的 ---
  }
  const chunks = [];
  let cur = null;
  let fence = null;
  const push = (type) => {
    cur = { type, lines: [] };
    chunks.push(cur);
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    const fm2 = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      cur.lines.push(line);
      if (fm2 && fm2[1][0] === fence[0] && fm2[1].length >= fence.length && line.trim() === fm2[1]) fence = null;
      continue;
    }
    if (fm2) {
      fence = fm2[1];
      push("code");
      cur.lines.push(line);
      continue;
    }
    if (line.trim() === "") {
      if (!cur || cur.type !== "blank") push("blank");
      cur.lines.push(line);
      continue;
    }
    if (!cur || cur.type !== "text") push("text");
    cur.lines.push(line);
  }
  return { fm, fmOther, chunks };
}

// 段落里是否有需要翻译的文字（标签外的英文，或 title/tip 属性）
function translatable(text) {
  const attrs = [...text.matchAll(/\b(?:title|tip)="([^"]*)"/g)].map((m) => m[1]).join(" ");
  const outside = text.replace(/`[^`]*`/g, "").replace(/<[^>]*>/g, " ");
  return /[A-Za-z]{2,}/.test(outside + " " + attrs);
}

// 按文档顺序列出所有可翻译段落 [{id, en}]
function segmentsOf(src) {
  const { fm, chunks } = parseMdx(src);
  const out = [];
  for (const f of fm) out.push({ id: segId(f.value), en: f.value });
  for (const c of chunks) {
    if (c.type !== "text") continue;
    const en = c.lines.join("\n");
    if (translatable(en)) out.push({ id: segId(en), en });
  }
  return out;
}

// ---------- 对照文件读写 ----------

function readSeg(file) {
  const map = new Map(); // id -> {en, zh, stale}
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let cur = null;
  let mode = null;
  const flush = () => {
    if (!cur) return;
    const trim = (a) => a.join("\n").replace(/^\n+|\n+$/g, "");
    map.set(cur.id, { en: trim(cur.en), zh: trim(cur.zh), stale: cur.stale });
  };
  for (const line of lines) {
    const m = line.match(/^@@ ([0-9a-f]{10})( stale)?$/);
    if (m) {
      flush();
      cur = { id: m[1], en: [], zh: [], stale: !!m[2] };
      mode = "en";
      continue;
    }
    if (cur && line === "@@ zh") {
      mode = "zh";
      continue;
    }
    if (cur) cur[mode].push(line);
  }
  flush();
  return map;
}

function writeSeg(file, page, segs, old) {
  const seen = new Set();
  let out = `# 对照文件：docs/${page}.mdx\n# 只改 "@@ zh" 下面的译文；英文部分由 extract 生成，不要手改。\n\n`;
  for (const s of segs) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const zh = old.get(s.id)?.zh ?? "";
    out += `@@ ${s.id}\n${s.en}\n@@ zh\n${zh}\n\n`;
  }
  for (const [id, o] of old) {
    if (seen.has(id) || !o.zh) continue;
    out += `@@ ${id} stale\n${o.en}\n@@ zh\n${o.zh}\n\n`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
}

const segFile = (page) => path.join(SEG_DIR, page + ".txt");
const enFile = (page) => path.join(DOCS, page + ".mdx");

// ---------- 生成中文页 ----------

function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>|`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function rewriteLinks(text, page, translated) {
  const pageDir = "/" + path.posix.dirname(page) + "/";
  const fix = (url) => {
    if (/^(https?:|mailto:|#)/.test(url)) return url;
    let [p, hash] = url.split(/(?=#)/);
    if (p.startsWith("./") || p.startsWith("../")) p = path.posix.normalize(pageDir + p);
    if (!p.startsWith("/")) return url;
    const key = p.replace(/^\//, "").replace(/\/$/, "");
    if (translated.has(key)) p = "/zh/" + key;
    return p + (hash ?? "");
  };
  return text
    .replace(/\]\(([^)\s]+)\)/g, (_, u) => `](${fix(u)})`)
    .replace(/\bhref="([^"]+)"/g, (_, u) => `href="${fix(u)}"`);
}

function sourceCommit(page) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h", "--", enFile(page)], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildPage(page, translated) {
  const src = fs.readFileSync(enFile(page), "utf8");
  const seg = readSeg(segFile(page));
  const { fm, fmOther, chunks } = parseMdx(src);
  const missing = [];
  const tr = (en) => {
    const s = seg.get(segId(en));
    if (s && !s.stale && s.zh) return s.zh;
    missing.push(norm(en).slice(0, 60));
    return en;
  };

  let out = "---\n";
  for (const f of fm) out += `${f.key}: ${tr(f.value)}\n`;
  for (const l of fmOther) out += l + "\n";
  out += "---\n\n";

  const license = page.startsWith("specification/") ? "Apache-2.0" : "CC-BY-4.0";
  const licenseUrl =
    license === "Apache-2.0" ? "https://www.apache.org/licenses/LICENSE-2.0" : "https://creativecommons.org/licenses/by/4.0/";
  out +=
    `<Info>\n  本页是社区维护的**非官方**中文译文，不代表 MCP 官方。原文：Model Context Protocol 项目的` +
    `[英文页面](https://modelcontextprotocol.io/${page})（上游提交 \`${sourceCommit(page)}\`），` +
    `© Model Context Protocol a Series of LF Projects, LLC.，按 [${license}](${licenseUrl}) 授权。` +
    `本页由原文翻译成中文，并按同一许可发布。如有出入，以英文原文为准。\n</Info>\n`;

  let prevText = "";
  const slugCount = new Map(); // 同名标题按 github-slugger 规则加 -1、-2
  for (const c of chunks) {
    if (c.type !== "text") {
      out += c.lines.join("\n") + "\n";
      continue;
    }
    const en = c.lines.join("\n");
    let zh = translatable(en) ? tr(en) : en;
    // 标题译成中文后，Mintlify 生成的锚点会变；补一个英文锚点，保持 #scope 这类链接可用
    const h = en.match(/^(#{1,6})\s+(.+)$/);
    if (h && !en.includes("\n")) {
      const base = slug(h[2]);
      const n = slugCount.get(base) ?? 0;
      slugCount.set(base, n + 1);
      if (zh !== en && !/<a id=/.test(prevText)) zh = `<a id="${n ? `${base}-${n}` : base}" />\n${zh}`;
    }
    out += rewriteLinks(zh, page, translated) + "\n";
    prevText = en;
  }

  const dest = path.join(DOCS, "zh", page + ".mdx");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out.replace(/\n+$/, "\n"));
  return missing;
}

function updateDocsJson(cfg) {
  const file = path.join(DOCS, "docs.json");
  const raw = fs.readFileSync(file, "utf8");
  const d = JSON.parse(raw);
  const tab = {
    tab: TAB_NAME,
    pages: cfg.groups.map((g) => ({ group: g.group, pages: g.pages.map(navPath) })),
  };
  const tabs = d.navigation.tabs;
  const idx = tabs.findIndex((t) => t.tab === TAB_NAME);
  if (idx >= 0) tabs[idx] = tab;
  else tabs.push(tab);
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
}

// ---------- 命令 ----------

const cmd = process.argv[2];
const cfg = loadPages();
const pages = allPages(cfg);

if (cmd === "extract") {
  for (const page of pages) {
    const segs = segmentsOf(fs.readFileSync(enFile(page), "utf8"));
    const old = readSeg(segFile(page));
    const ids = new Set(segs.map((s) => s.id));
    const added = [...ids].filter((id) => !old.get(id)?.zh || old.get(id).stale).length;
    const stale = [...old.keys()].filter((id) => !ids.has(id)).length;
    writeSeg(segFile(page), page, segs, old);
    console.log(`${page}: ${ids.size} 段，新增/待译 ${added}，过期 ${stale}`);
  }
} else if (cmd === "build") {
  const translated = new Set(pages);
  let bad = 0;
  for (const page of pages) {
    const missing = buildPage(page, translated);
    console.log(`${page}: ${missing.length ? `未翻译 ${missing.length} 段（以英文输出）` : "完成"}`);
    for (const m of missing) console.log("   - " + m);
    bad += missing.length;
  }
  updateDocsJson(cfg);
  console.log(`docs.json 已更新「${TAB_NAME}」标签页`);
  process.exitCode = bad ? 1 : 0;
} else if (cmd === "status") {
  for (const page of pages) {
    const segs = segmentsOf(fs.readFileSync(enFile(page), "utf8"));
    const seg = readSeg(segFile(page));
    const todo = segs.filter((s) => !seg.get(s.id)?.zh || seg.get(s.id).stale).length;
    const stale = [...seg.values()].filter((s) => s.stale).length;
    console.log(`${page}: 待译 ${todo} / ${segs.length}，过期条目 ${stale}`);
  }
} else {
  console.log("用法：node i18n/zh/tool.mjs <extract|build|status>");
  process.exitCode = 2;
}
