import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.error('usage: node fetch-jd.mjs <url>'); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const title = await page.title();
  const finalUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const applyBtn = await page.evaluate(() => {
    const m = document.body.innerText.match(/\b(Apply|Applied|This job is no longer|no longer available|page not found|404)\b/i);
    return m ? m[0] : null;
  });
  console.log('=== TITLE ===\n' + title);
  console.log('=== FINAL_URL ===\n' + finalUrl);
  console.log('=== APPLY_STATE ===\n' + (applyBtn || '(none found)'));
  console.log('=== BODY (first 8000 chars) ===');
  console.log(bodyText.slice(0, 8000));
  console.log('=== BODY_LENGTH ===\n' + bodyText.length);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await browser.close();
}
