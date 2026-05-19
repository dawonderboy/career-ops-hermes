#!/usr/bin/env node
// md-to-pdf-prep.mjs — Convert an interview-prep markdown file to PDF.
// Usage: node scripts/md-to-pdf-prep.mjs <input.md> [output.pdf]

import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { resolve, dirname, basename, extname } from 'path';
import { existsSync } from 'fs';

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: node scripts/md-to-pdf-prep.mjs <input.md> [output.pdf]');
  process.exit(1);
}
const inputPath = resolve(inputArg);
if (!existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}
const outputPath = resolve(
  process.argv[3] ||
    inputPath.slice(0, -extname(inputPath).length) + '.pdf'
);

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(s) {
  s = escapeHtml(s);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *x* (avoid matching ** edges)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${renderInline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // Table (header | header)\n(--- | ---)\n rows
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const split = (l) =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const headers = split(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(split(lines[i]));
        i++;
      }
      let t = '<table><thead><tr>';
      for (const h of headers) t += `<th>${renderInline(h)}</th>`;
      t += '</tr></thead><tbody>';
      for (const r of rows) {
        t += '<tr>';
        for (const c of r) t += `<td>${renderInline(c)}</td>`;
        t += '</tr>';
      }
      t += '</tbody></table>';
      out.push(t);
      continue;
    }

    // Lists
    if (/^[\s]*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ol>');
      continue;
    }

    // Paragraph (collect contiguous non-empty, non-special lines)
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^[\s]*[-*]\s+/.test(lines[i]) &&
      !/^[\s]*\d+\.\s+/.test(lines[i]) &&
      !(/\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const md = await readFile(inputPath, 'utf8');
const body = mdToHtml(md);
const title = basename(inputPath, extname(inputPath));

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: Letter; margin: 0.6in 0.7in; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #1a1a1a; font-size: 10.5pt; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 8pt 0; border-bottom: 2px solid #222; padding-bottom: 4pt; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt 0; color: #1a1a1a; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt 0; }
  h4 { font-size: 10.8pt; margin: 10pt 0 4pt 0; }
  p  { margin: 4pt 0; }
  ul, ol { margin: 4pt 0 6pt 0; padding-left: 20pt; }
  li { margin: 2pt 0; }
  hr { border: none; border-top: 1px solid #bbb; margin: 12pt 0; }
  blockquote { border-left: 3px solid #888; margin: 6pt 0; padding: 4pt 10pt; background: #f5f5f5;
               color: #222; font-style: italic; }
  table { border-collapse: collapse; margin: 6pt 0; width: 100%; font-size: 9.8pt; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  th { background: #eee; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; background: #f0f0f0;
         padding: 1pt 3pt; border-radius: 2pt; }
  a { color: #1a4fa3; text-decoration: none; }
  strong { color: #000; }
</style>
</head><body>
${body}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: outputPath, format: 'Letter', printBackground: true,
                 margin: { top: '0.6in', bottom: '0.6in', left: '0.7in', right: '0.7in' } });
await browser.close();
console.log(`Wrote: ${outputPath}`);
