/**
 * Serves the pre-built malware-demo HTML and captures a full-page screenshot
 * for the README. Uses the system Microsoft Edge (Playwright "channel" API) on
 * Windows to avoid downloading Chromium; otherwise use `npx playwright install chromium`.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const htmlPath = path.join(root, '.tmp', 'malware-report.html');
const outPng = path.join(root, 'docs', 'images', 'report-example.png');

if (!fs.existsSync(htmlPath)) {
  console.error('Missing', htmlPath);
  console.error('Run: node dist/cli.js run tests/fixtures/malware-demo -o .tmp/malware-report.html');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPng), { recursive: true });
const html = fs.readFileSync(htmlPath, 'utf-8');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/malware')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
});
const { port } = server.address();
const url = `http://127.0.0.1:${port}/malware-report.html`;

const launchOptions =
  process.platform === 'win32'
    ? { headless: true, channel: 'msedge' }
    : { headless: true };

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await new Promise((r) => setTimeout(r, 4500));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
server.close();

console.log('Wrote', outPng);
