#!/usr/bin/env node
// @ts-check
// 公開の前の検査（依存なし。Node 22 以降）。page を足したり文や色を変えたりしたら走らせる:
//   node scripts/check-site.mjs [--canonical <amikomi の repo>/docs/PRIVACY.md]
//
// 確かめること:
//   1. どの page も lang（ja か en）・charset・viewport・空でない title を持つ。
//   2. 外部の資源を読み込まない（script・img・iframe などは置かない。link は同じ site の stylesheet と、公開の URL を
//      指す hreflang の alternate だけ。どの .css にも @import と外の url() が無い）。訪問者の情報を第三者に送らないため。
//   3. site の中の link（相対の href と、公開の URL を指す alternate）が実在の file を指し、#id もその page にある。
//   4. 日本語の page と /en/ の page が対になり、h2 の id の並びが同じ（訳の抜けを見つける）。
//   5. style.css の色の組が light と dark の両方で WCAG 2.2 AA（文字 4.5:1、focus の枠 3:1）を満たす。
//   6. --canonical を渡したとき: privacy の 2 つの page の h2 が、docs/PRIVACY.md の「## 日本語」「## English」の
//      下の ### 見出しと同じ並びで、その節の本文の行（箇条・表の cell・段落）がどれも page の文の中にそのままある
//      （公開の文と正本の文のずれを見つける）。
// 失敗が 1 つでもあれば一覧を出して exit 1。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** GitHub Pages の公開の URL（alternate の href はこの下だけを許す）。 */
const SITE_URL = 'https://tomodahinata.github.io/amikomi-support/';
/** 日本語の page の対訳を置く directory。 */
const EN_DIR = 'en';

/** @type {string[]} */
const problems = [];

/** @param {string} dir @param {string} extension @returns {string[]} root からの相対 path */
function filesWithExtension(dir, extension) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'node_modules' || name === 'scripts') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesWithExtension(path, extension);
    return name.endsWith(extension) ? [relative(root, path)] : [];
  });
}

/** @param {string} tag @param {string} name @returns {string | null} */
function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1] ?? null;
}

/** @param {string} html @param {string} name @returns {string[]} 開きの tag の全文 */
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

/** @param {string} html @returns {Set<string>} */
function idsOf(html) {
  return new Set([...html.matchAll(/\sid\s*=\s*"([^"]+)"/gi)].map((match) => match[1] ?? ''));
}

/** @param {string} html @returns {{ id: string | null, text: string }[]} */
function headings2(html) {
  return [...html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)].map((match) => ({
    id: attribute(match[1] ?? '', 'id'),
    text: (match[2] ?? '').replace(/<[^>]+>/g, '').trim(),
  }));
}

/**
 * site の中の href を、root からの相対の file と #id に解く。外（mailto・別の host）は null。
 * @param {string} page root からの相対 path
 * @param {string} href
 * @returns {{ file: string, hash: string | null } | null}
 */
function resolveInternal(page, href) {
  let path = href;
  if (path.startsWith(SITE_URL)) path = `/${path.slice(SITE_URL.length)}`;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  const [beforeHash, hash = null] = path.split('#', 2);
  const target = beforeHash === undefined || beforeHash === '' ? page : resolveFile(page, beforeHash);
  return { file: target, hash };
}

/** @param {string} page @param {string} path @returns {string} */
function resolveFile(page, path) {
  const absolute = path.startsWith('/')
    ? join(root, path)
    : resolve(join(root, dirname(page)), path);
  const file = path.endsWith('/') || (existsSync(absolute) && statSync(absolute).isDirectory())
    ? join(absolute, 'index.html')
    : absolute;
  return relative(root, file);
}

const pages = filesWithExtension(root, '.html').sort();
/** @type {Map<string, string>} */
const sources = new Map(pages.map((page) => [page, readFileSync(join(root, page), 'utf8')]));

// 1–3: page ごとの検査。
for (const [page, html] of sources) {
  const lang = /<html\b[^>]*\slang="([^"]+)"/i.exec(html)?.[1];
  if (lang !== 'ja' && lang !== 'en') problems.push(`${page}: <html lang> が ja でも en でもない（${String(lang)}）`);
  if (!/<meta\s+charset="utf-8">/i.test(html)) problems.push(`${page}: <meta charset="utf-8"> が無い`);
  if (!tags(html, 'meta').some((tag) => attribute(tag, 'name') === 'viewport' && (attribute(tag, 'content') ?? '').includes('width=device-width'))) {
    problems.push(`${page}: viewport の meta が無い`);
  }
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  if (title === '') problems.push(`${page}: title が空`);
  if (tags(html, 'h1').length !== 1) problems.push(`${page}: h1 が 1 つでない`);

  for (const name of ['script', 'img', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'base', 'form']) {
    if (tags(html, name).length > 0) problems.push(`${page}: <${name}> を置かない（外部の資源と通信を持たない site）`);
  }
  if (/\sstyle\s*=|@import|url\(/i.test(html)) problems.push(`${page}: inline の style・@import・url() を置かない`);
  if (/target\s*=\s*"_blank"/i.test(html)) problems.push(`${page}: target="_blank" を使わない`);

  for (const tag of tags(html, 'link')) {
    const rel = attribute(tag, 'rel');
    const href = attribute(tag, 'href') ?? '';
    if (rel === 'stylesheet' && (href.includes(':') || href.startsWith('//'))) {
      problems.push(`${page}: 外部の stylesheet ${href}`);
    } else if (rel === 'alternate' && !href.startsWith(SITE_URL)) {
      problems.push(`${page}: alternate が公開の URL の外を指す ${href}`);
    } else if (rel !== 'stylesheet' && rel !== 'alternate') {
      problems.push(`${page}: 許していない link（rel=${String(rel)}）`);
    }
  }

  const hrefs = [...tags(html, 'a'), ...tags(html, 'link')]
    .map((tag) => attribute(tag, 'href'))
    .filter((href) => href !== null);
  for (const href of hrefs) {
    if (href.startsWith('mailto:')) continue;
    if (/^https?:/i.test(href) && !href.startsWith(SITE_URL)) {
      problems.push(`${page}: 外の site への link ${href}（必要なら規則と一緒に許す）`);
      continue;
    }
    const target = resolveInternal(page, href);
    if (target === null) continue;
    const targetHtml = sources.get(target.file) ?? (existsSync(join(root, target.file)) ? readFileSync(join(root, target.file), 'utf8') : null);
    if (targetHtml === null) {
      problems.push(`${page}: ${href} の先 ${target.file} が無い`);
    } else if (target.hash !== null && target.file.endsWith('.html') && !idsOf(targetHtml).has(target.hash)) {
      problems.push(`${page}: ${href} の #${target.hash} が ${target.file} に無い`);
    }
  }
}

// 2 の続き: stylesheet も外の資源を読まない（@import と、scheme か // で始まる url()）。
for (const sheet of filesWithExtension(root, '.css').sort()) {
  if (/@import|url\(\s*['"]?(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(readFileSync(join(root, sheet), 'utf8'))) {
    problems.push(`${sheet}: @import と外の url() を置かない（外部の資源と通信を持たない site）`);
  }
}

// 4: 日本語と英語の対。
for (const page of pages) {
  const isEnglish = page.startsWith(`${EN_DIR}/`);
  const pair = isEnglish ? page.slice(EN_DIR.length + 1) : join(EN_DIR, page);
  const pairHtml = sources.get(pair);
  if (pairHtml === undefined) {
    problems.push(`${page}: 対の page ${pair} が無い`);
    continue;
  }
  if (isEnglish) continue; // 対は日本語の側から 1 回だけ比べる
  const ids = (/** @type {string} */ html) => headings2(html).map((heading) => heading.id ?? '(id なし)').join(' ');
  const ownIds = ids(sources.get(page) ?? '');
  if (ownIds !== ids(pairHtml)) problems.push(`${page} と ${pair}: h2 の id の並びが違う（${ownIds} / ${ids(pairHtml)}）`);
}

// 5: 色のコントラスト（WCAG 2.2 の相対輝度）。
/** @param {string} hex @returns {number} */
function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b @returns {number} */
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}
/** @param {string} block @returns {Map<string, string>} */
function tokens(block) {
  return new Map([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1] ?? '', match[2] ?? '']));
}
const css = readFileSync(join(root, 'style.css'), 'utf8');
const lightBlock = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
/** 前景・背景・必要な比（文字は 4.5、focus の枠は 3: WCAG 1.4.3・1.4.11）。 */
const PAIRS = [
  ['ink', 'ground', 4.5],
  ['ink-soft', 'ground', 4.5],
  ['accent', 'ground', 4.5],
  ['ink', 'surface', 4.5],
  ['ink-soft', 'surface', 4.5],
  ['accent', 'surface', 4.5],
  ['focus', 'ground', 3],
];
/** @type {string[]} */
const ratios = [];
for (const [mode, block] of /** @type {const} */ ([['light', lightBlock], ['dark', darkBlock]])) {
  const palette = tokens(block);
  for (const [fg, bg, minimum] of PAIRS) {
    const a = palette.get(String(fg));
    const b = palette.get(String(bg));
    if (a === undefined || b === undefined) {
      problems.push(`style.css（${mode}）: --${String(fg)} か --${String(bg)} が 16 進の 6 桁で無い`);
      continue;
    }
    const ratio = contrast(a, b);
    ratios.push(`${mode} ${String(fg)}/${String(bg)} ${ratio.toFixed(2)}`);
    if (ratio < Number(minimum)) problems.push(`style.css（${mode}）: --${String(fg)} と --${String(bg)} の比 ${ratio.toFixed(2)} < ${String(minimum)}`);
  }
}

/** @param {string} text @returns {string} 空白の並びを 1 つの空白にする（改行の位置の違いを比べない）。 */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** @param {string} markdown @param {string} section @returns {string} `## <section>` から次の `## ` までの本文 */
function sectionBody(markdown, section) {
  const start = markdown.search(new RegExp(`^## ${section}`, 'm'));
  if (start === -1) return '';
  const headingEnd = markdown.indexOf('\n', start);
  const rest = headingEnd === -1 ? '' : markdown.slice(headingEnd + 1);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * 正本の節の本文を、page の文と比べる単位（見出し・箇条・段落の行、表は cell ごと）に分ける。markdown の記号は落とす。
 * @param {string} body @returns {string[]}
 */
function canonicalLines(body) {
  return body.split('\n').flatMap((line) => {
    if (/^\|[\s|:-]+\|$/.test(line)) return []; // 表の区切りの行
    const cells = line.startsWith('|') ? line.split('|') : [line.replace(/^(?:#{1,6}|-)\s+/, '')];
    // 行の末の \ は markdown の改行（page の <br>）。
    return cells.map((cell) => collapse(cell.replace(/`|\*\*|\\$/g, ''))).filter((cell) => cell !== '');
  });
}

/**
 * page の文（tag を除き、文字参照を戻し、空白を詰めたもの）。block の tag は区切りにし、inline の tag はそのまま除く。
 * @param {string} html @returns {string}
 */
function pageText(html) {
  const text = html
    .replace(/<\/?(?:p|li|ul|ol|tr|td|th|table|caption|h[1-6]|header|main|div|footer|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return collapse(text);
}

// 6: 正本（docs/PRIVACY.md）との構成と文の一致。
const canonicalAt = process.argv.indexOf('--canonical');
if (canonicalAt !== -1) {
  const canonicalPath = process.argv[canonicalAt + 1];
  if (canonicalPath === undefined || !existsSync(canonicalPath)) {
    problems.push(`--canonical の file が無い（${String(canonicalPath)}）`);
  } else {
    const markdown = readFileSync(canonicalPath, 'utf8');
    /** @param {string} section @returns {string[]} */
    const canonicalHeadings = (section) =>
      [...sectionBody(markdown, section).matchAll(/^### (.+)$/gm)].map((match) => (match[1] ?? '').trim());
    for (const [page, section] of [['privacy/index.html', '日本語'], ['en/privacy/index.html', 'English']]) {
      const html = sources.get(String(page)) ?? '';
      const published = headings2(html).map((heading) => heading.text);
      const canonical = canonicalHeadings(String(section));
      if (published.join('\n') !== canonical.join('\n')) {
        problems.push(`${String(page)}: h2 が docs/PRIVACY.md の「## ${String(section)}」の ### と違う\n  公開: ${published.join(' | ')}\n  正本: ${canonical.join(' | ')}`);
      }
      const text = pageText(html);
      const missing = canonicalLines(sectionBody(markdown, String(section))).filter((line) => !text.includes(line));
      for (const line of missing) problems.push(`${String(page)}: 正本の文が page に無い: ${line}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`check-site: ${String(problems.length)} 件\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-site: OK（${String(pages.length)} pages。${ratios.join('、')}）`);
