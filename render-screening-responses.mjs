#!/usr/bin/env node
// Generic screening-response markdown to PDF renderer via Playwright (no external md library)
// Usage: node render-screening-responses.mjs <input.md> <output.pdf>

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

const [,, inputMd, outputPdf] = process.argv;
if (!inputMd || !outputPdf) {
  console.error('Usage: node render-screening-responses.mjs <input.md> <output.pdf>');
  process.exit(1);
}

const md = await readFile(resolve(inputMd), 'utf-8');

function mdToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let inList = false;
  let inCheckList = false;

  const closeList = () => {
    if (inCheckList) { out.push('</ul>'); inCheckList = false; }
    if (inList) { out.push('</ul>'); inList = false; }
  };

  const escape = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw;

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push('<hr>');
      continue;
    }

    // Headings
    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      closeList();
      const level = hm[1].length;
      out.push(`<h${level}>${inline(escape(hm[2]))}</h${level}>`);
      continue;
    }

    // Checkbox list items
    const cm = line.match(/^- \[([ x])\] (.+)/);
    if (cm) {
      if (!inCheckList) { closeList(); out.push('<ul class="checklist">'); inCheckList = true; }
      const checked = cm[1] === 'x' ? ' checked' : '';
      out.push(`<li><input type="checkbox"${checked} disabled> ${inline(escape(cm[2]))}</li>`);
      continue;
    }

    // Regular list items
    const lm = line.match(/^- (.+)/);
    if (lm) {
      if (!inList) { closeList(); out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(escape(lm[1]))}</li>`);
      continue;
    }

    // Blockquote
    const bm = line.match(/^> (.+)/);
    if (bm) {
      closeList();
      out.push(`<blockquote>${inline(escape(bm[1]))}</blockquote>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      out.push('');
      continue;
    }

    // Paragraph
    closeList();
    out.push(`<p>${inline(escape(line))}</p>`);
  }

  closeList();
  return out.join('\n');
}

const body = mdToHtml(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1a1a1a;
    padding: 32px 40px;
    max-width: 900px;
    margin: 0 auto;
  }
  h1 { font-size: 18pt; margin-bottom: 2px; color: #0d1117; }
  h2 { font-size: 13pt; margin-top: 22px; margin-bottom: 4px; color: #1a56db; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
  h3 { font-size: 11.5pt; margin-top: 16px; margin-bottom: 4px; color: #374151; }
  h4 { font-size: 10.5pt; margin-top: 12px; margin-bottom: 3px; color: #6b7280; font-style: italic; }
  p { margin-top: 6px; margin-bottom: 2px; }
  ul { margin: 6px 0 6px 20px; }
  li { margin-bottom: 3px; }
  ul.checklist { list-style: none; margin-left: 4px; }
  ul.checklist li { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 5px; }
  ul.checklist input[type="checkbox"] { margin-top: 3px; flex-shrink: 0; }
  blockquote {
    border-left: 3px solid #93c5fd;
    background: #eff6ff;
    padding: 8px 14px;
    margin: 8px 0;
    border-radius: 0 4px 4px 0;
    font-style: italic;
    color: #1e40af;
  }
  code {
    background: #f3f4f6;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9.5pt;
    font-family: 'Menlo', 'Courier New', monospace;
  }
  strong { font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
  a { color: #1a56db; text-decoration: none; }
</style>
</head>
<body>
${body}
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });

await page.pdf({
  path: resolve(outputPdf),
  format: 'Letter',
  margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
  printBackground: true,
});

await browser.close();
console.log(`PDF saved: ${outputPdf}`);
