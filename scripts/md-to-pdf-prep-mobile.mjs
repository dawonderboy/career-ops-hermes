#!/usr/bin/env node
// md-to-pdf-prep-mobile.mjs — Mobile-friendly PDF (phone-aspect, larger fonts).
// Usage: node scripts/md-to-pdf-prep-mobile.mjs <input.md> [output.pdf]

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { resolve, basename, extname } from 'path';
import { existsSync } from 'fs';

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: node scripts/md-to-pdf-prep-mobile.mjs <input.md> [output.pdf]');
  process.exit(1);
}
const inputPath = resolve(inputArg);
if (!existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}
const outputPath = resolve(
  process.argv[3] ||
    inputPath.slice(0, -extname(inputPath).length) + ' - Mobile.pdf'
);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(s) {
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const split = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const headers = split(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(split(lines[i])); i++;
      }
      let t = '<div class="tablewrap"><table><thead><tr>';
      for (const hd of headers) t += `<th>${renderInline(hd)}</th>`;
      t += '</tr></thead><tbody>';
      for (const r of rows) {
        t += '<tr>';
        for (const c of r) t += `<td>${renderInline(c)}</td>`;
        t += '</tr>';
      }
      t += '</tbody></table></div>';
      out.push(t);
      continue;
    }
    if (/^[\s]*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*]\s+/, '')); i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s+/, '')); i++;
      }
      out.push('<ol>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) && !/^[\s]*[-*]\s+/.test(lines[i]) &&
      !/^[\s]*\d+\.\s+/.test(lines[i]) &&
      !(/\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const md = await readFile(inputPath, 'utf8');
const body = mdToHtml(md);
const title = basename(inputPath, extname(inputPath));

// Mobile page: 4.13in x 7.32in (~ phone ratio), tight margins, larger body type.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: 4.13in 7.32in; margin: 0.25in 0.25in; }
  * { -webkit-print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; font-size: 11.5pt; line-height: 1.45; margin: 0; word-wrap: break-word;
         overflow-wrap: anywhere; }
  h1 { font-size: 16pt; margin: 0 0 6pt 0; border-bottom: 2px solid #222; padding-bottom: 3pt; }
  h2 { font-size: 13pt; margin: 14pt 0 5pt 0; border-bottom: 1px solid #ccc; padding-bottom: 2pt;
       page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 10pt 0 4pt 0; page-break-after: avoid; }
  h4 { font-size: 11.5pt; margin: 8pt 0 3pt 0; page-break-after: avoid; }
  p  { margin: 4pt 0; }
  ul, ol { margin: 4pt 0 6pt 0; padding-left: 18pt; }
  li { margin: 3pt 0; }
  hr { border: none; border-top: 1px solid #bbb; margin: 10pt 0; }
  blockquote { border-left: 3px solid #1a4fa3; margin: 6pt 0; padding: 6pt 10pt;
               background: #f0f5fc; color: #1a1a1a; font-style: normal; font-size: 11.5pt; }
  blockquote strong { color: #000; }
  .tablewrap { width: 100%; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 9pt;
          table-layout: fixed; }
  th, td { border: 1px solid #bbb; padding: 3pt 5pt; vertical-align: top; text-align: left;
           overflow-wrap: anywhere; word-break: break-word; }
  th { background: #eee; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 10pt; background: #f0f0f0;
         padding: 1pt 3pt; border-radius: 2pt; }
  a { color: #1a4fa3; text-decoration: none; word-break: break-all; }
  strong { color: #000; }
  /* avoid widows in lists */
  li, p, blockquote { page-break-inside: avoid; }
</style>
</head><body>
${body}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
  path: outputPath,
  width: '4.13in', height: '7.32in',
  printBackground: true,
  margin: { top: '0.25in', bottom: '0.25in', left: '0.25in', right: '0.25in' },
});
await browser.close();
console.log(`Wrote: ${outputPath}`);
