// R6詳細方式の18帳票がレポート画面で表示され、TSV出力できることを確認する。
import { test, expect } from "@playwright/test";
import { buildProject, runCalc, gotoScreen, stubWeather, stepBody, openStep } from "./helpers.mjs";

test.describe("R6詳細方式 帳票(18帳票)", () => {
  test("レポート画面に18帳票が表示される", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    await stubWeather(page);
    await buildProject(page, { name: "帳票E2E", area: 500, roomArea: 250 });
    await runCalc(page);
    await gotoScreen(page, "レポート");

    const section = page.getByText("R6詳細方式 帳票(18帳票)");
    await expect(section).toBeVisible();

    // 18帳票の見出しがすべて出る
    for (const name of ["表紙", "熱負荷計算書", "熱負荷集計表"]) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    for (let i = 1; i <= 9; i += 1) {
      await expect(page.getByText(new RegExp(`^設計条件${i} `)).first()).toBeVisible();
    }
    for (let i = 1; i <= 6; i += 1) {
      await expect(page.getByText(new RegExp(`^チェックリスト${i} `)).first()).toBeVisible();
    }

    // 未入力・未確認が隠されずに出る
    await expect(page.getByText(/必須入力の未入力件数/)).toBeVisible();
    // 冷房8項目・暖房5項目が帳票に出る
    await expect(page.getByText("冷房項目8", { exact: true })).toBeVisible();
    await expect(page.getByText("暖房項目5", { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("帳票(TSV/Excel)を出力できる", async ({ page }) => {
    await stubWeather(page);
    await buildProject(page, { name: "帳票TSV", area: 400, roomArea: 200 });
    await runCalc(page);
    await gotoScreen(page, "レポート");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "帳票(TSV/Excel)" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("R6.tsv");
    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) text += chunk.toString("utf8");
    expect(text).toContain("# 表紙");
    expect(text).toContain("# 設計条件1 室内条件");
    expect(text).toContain("# チェックリスト6");
    expect(text).not.toContain("NaN");
  });

  test("既存のCSV出力は壊れていない", async ({ page }) => {
    await stubWeather(page);
    await buildProject(page, { name: "CSV回帰", area: 300, roomArea: 150 });
    await runCalc(page);
    await gotoScreen(page, "レポート");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV出力" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".csv");
  });

  test("10ステップすべてを遷移できる", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    await stubWeather(page);
    await buildProject(page, { name: "全ステップ", area: 300, roomArea: 150 });
    for (const label of ["建物", "階", "室", "室内条件", "人員", "照明/機器", "外気/換気", "外皮/", "計算", "結果"]) {
      await openStep(page, label);
      await expect(stepBody(page)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});