import { chromium } from "playwright";
import fs from "node:fs/promises";

const base = process.env.P00_ADMIN_BASE || "https://hhy-admin.orbexa.cc";
const outputDir = process.env.P00_SCREENSHOT_DIR || "/tmp/hhy-p00-admin-screens";
const states = {
  auth: { pageId: "ADMIN-AUTH-001", ids: ["DEFAULT", "SUBMITTING", "LOGIN_FAILED", "RATE_LIMITED", "ACCOUNT_LOCKED", "SUCCESS"] },
  captcha: { pageId: "ADMIN-SEC-001", ids: ["LOADING", "DEFAULT", "VERIFYING", "WRONG", "EXPIRED", "RATE_LIMITED", "SUCCESS"] },
  self: { pageId: "ADMIN-SELF-001", ids: ["DEFAULT", "EDIT_PASSWORD", "SESSION_LIST", "SUBMITTING", "SUCCESS", "ERROR"] },
};

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const referencePage = await context.newPage();
const report = [];

for (const [section, definition] of Object.entries(states)) {
  for (const state of definition.ids) {
    const name = `${definition.pageId}__${state}`;
    const url = `${base}/?page=${section}&state=${state}`;
    const response = await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    await page.locator("iframe.reference-frame").waitFor({ state: "visible", timeout: 10000 });
    const frame = page.frames().find((candidate) => candidate.url().includes("/reference/"));
    if (!frame) throw new Error(`reference frame did not load for ${name}`);
    await frame.waitForSelector("body", { state: "visible", timeout: 10000 });
    const metrics = await page.evaluate(() => ({
      outerWidth: document.documentElement.scrollWidth,
      outerHeight: document.documentElement.scrollHeight,
      frameWidth: document.querySelector("iframe.reference-frame")?.getBoundingClientRect().width ?? 0,
      frameHeight: document.querySelector("iframe.reference-frame")?.getBoundingClientRect().height ?? 0,
    }));
    const innerMetrics = await frame.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: false });
    await referencePage.goto(`${base}/reference/${name}.html`, { waitUntil: "networkidle" });
    await referencePage.screenshot({ path: `${outputDir}/${name}.reference.png`, fullPage: false });
    report.push({ name, url, status: response?.status() ?? null, text: (await frame.locator("body").innerText()).slice(0, 160), metrics, innerMetrics });
  }
}

await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
