import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.P00_ADMIN_BASE || "https://hhy-admin.orbexa.cc";
const output = process.env.P00_INTERACTION_REPORT || "/tmp/hhy-p00-admin-interactions.json";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const steps = [];

async function waitForFrame() {
  await page.locator("iframe.reference-frame").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => [...document.querySelectorAll("iframe.reference-frame")].some((frame) => frame.contentDocument?.readyState === "complete"));
  const frame = page.frames().find((candidate) => candidate.url().includes("/reference/"));
  if (!frame) throw new Error("reference frame did not load");
  return frame;
}

async function go(url) {
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) throw new Error(`navigation failed: ${url}`);
  return waitForFrame();
}

let frame = await go(`${base}/?page=auth&state=DEFAULT`);
await frame.locator("input[name=account]").fill("qa-admin@example.invalid");
await frame.locator("input[name=password]").fill("P00-test-only");
await frame.getByRole("button", { name: "登录管理后台" }).click();
await page.waitForFunction(() => new URLSearchParams(location.search).get("page") === "captcha");
frame = await waitForFrame();
steps.push("auth-input-and-login-transition");

await frame.getByRole("button", { name: "换一张" }).click();
await frame.getByRole("button", { name: "关闭安全验证" }).click();
await page.waitForFunction(() => new URLSearchParams(location.search).get("page") === "auth");
steps.push("captcha-refresh-and-return");

frame = await go(`${base}/?page=self&state=DEFAULT`);
await frame.locator("[data-action=sessions]").first().click();
await page.waitForFunction(() => new URLSearchParams(location.search).get("drawer") === "sessions");
frame = await waitForFrame();
await frame.getByRole("button", { name: "关闭" }).click();
await page.waitForFunction(() => !new URLSearchParams(location.search).has("drawer"));
steps.push("session-drawer-open-and-close");

frame = await go(`${base}/?page=self&state=DEFAULT`);
await frame.locator("[data-action=password]").first().click();
await page.waitForFunction(() => new URLSearchParams(location.search).get("drawer") === "password");
frame = await waitForFrame();
const passwordFields = frame.locator(".hhy-drawer input[type=password]");
await passwordFields.nth(0).fill("current-test");
await passwordFields.nth(1).fill("next-test");
await passwordFields.nth(2).fill("next-test");
await frame.getByRole("button", { name: "取消" }).click();
await page.waitForFunction(() => !new URLSearchParams(location.search).has("drawer"));
steps.push("password-input-and-cancel");

frame = await go(`${base}/?page=self&state=DEFAULT`);
const beforeScroll = await page.evaluate(() => window.scrollY);
await page.mouse.wheel(0, 160);
const afterScroll = await page.evaluate(() => window.scrollY);
const dimensions = await frame.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
steps.push("scroll-attempt");

await fs.writeFile(output, JSON.stringify({ passed: true, steps, scroll: { before: beforeScroll, after: afterScroll, dimensions } }, null, 2));
await browser.close();
