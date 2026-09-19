// 計算結果→レポート→CSV→保存/読込の全接続を実ブラウザで検証する(検証専用)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import { buildProject, runCalc, gotoScreen, openStep, stepBody } from "./e2e/helpers.mjs";

const URL = process.argv[2];
const br = await chromium.launch();
const ctx = await br.newContext({
  viewport: { width: 1440, height: 1000 }, locale: "ja-JP",
  acceptDownloads: true, timezoneId: "Asia/Tokyo", baseURL: URL,
});
const page = await ctx.newPage();
const cErr = [], pErr = [];
page.on("console", (m) => { if (m.type() === "error") cErr.push(m.text()); });
page.on("pageerror", (e) => pErr.push(e.message));

await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
console.log("タイトル:", await page.title());

await buildProject(page, { name: "接続確認案件", area: 300, roomArea: 150, floors: 1 });
await runCalc(page);
await page.waitForTimeout(2500);

// 1) 計算結果(ステップ「結果」) — runCalc 後はワークスペース画面にいる
await openStep(page, "結果");
await page.waitForTimeout(1200);
const resTxt = await stepBody(page).innerText();
const kwMatch = resTxt.match(/([0-9]+\.[0-9]+)\s*kW/);
const calcKW = kwMatch ? kwMatch[1] : null;
console.log("計算結果 kW:", calcKW);
console.log("  結果に必要能力:", /必要/.test(resTxt), "/ 台数表記:", resTxt.includes("台"));

// 2) レポート(帳票)
await gotoScreen(page, "レポート");
await page.waitForTimeout(1500);
const repTxt = await page.locator("main").innerText();
const repKW = (repTxt.match(/([0-9]+\.[0-9]+)\s*kW/) || [])[1] ?? null;
console.log("レポート kW:", repKW, "/ 計算結果と一致:", calcKW === repKW);

// 3) CSV出力
const csvBtn = page.getByRole("button", { name: /CSV/ });
let csvRows = 0, csvOk = false;
if (await csvBtn.count()) {
  const dl = (await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }).catch(() => null),
    csvBtn.first().click(),
  ]))[0];
  if (dl) {
    const c = fs.readFileSync(await dl.path(), "utf8");
    csvRows = c.trim().split("\n").length;
    csvOk = c.includes("kW") || c.includes(",");
  }
}
console.log("CSV: 行数=", csvRows, "/ 取得=", csvOk);

// 4) 保存(正しい導線: 「案件を保存」画面)
await gotoScreen(page, "案件を保存");
await page.waitForTimeout(1000);
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("hvac-load-calculator.projects.v1");
  try { return JSON.parse(raw).length; } catch { return raw ? 1 : 0; }
});
console.log("保存後 localStorage 案件数:", stored);

// 5) リロード → 案件一覧 → 開く → 結果を再確認(復元)
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await gotoScreen(page, "案件一覧");
await page.waitForTimeout(800);
const listTxt = await page.locator("main").innerText();
console.log("一覧に案件名:", listTxt.includes("接続確認案件"));
const openBtn = page.getByRole("button", { name: "開く" }).first();
if (await openBtn.count()) {
  await openBtn.click();
  await page.waitForTimeout(1500);
  const opened = await page.locator("main").innerText();
  console.log("開いた直後の画面に案件名:", opened.includes("接続確認案件"));
  await openStep(page, "結果");
  await page.waitForTimeout(1200);
  const restored = await stepBody(page).innerText();
  const rKW = (restored.match(/([0-9]+\.[0-9]+)\s*kW/) || [])[1] ?? null;
  console.log("復元後の計算結果 kW:", rKW, "/ 計算時と一致:", calcKW === rKW);
} else {
  console.log("「開く」ボタンが見つからない");
}

console.log("\nConsole Error:", cErr.length, "/ Runtime Error:", pErr.length);
cErr.slice(0, 3).forEach((e) => console.log("  -", e.slice(0, 160)));
pErr.slice(0, 3).forEach((e) => console.log("  -", e.slice(0, 160)));
await page.screenshot({ path: "/tmp/flow.png", fullPage: true });
await br.close();
console.log("\n今開いているURL:", URL);