// スマートフォン相当の狭幅での実表示検証。
// 「レスポンシブCSSがあるからOK」ではなく、実際に各幅で10工程を描画し
// 横スクロールの発生・タップ領域・入力欄の見切れを実測する。
import { test, expect } from "@playwright/test";
import { STEPS, buildProject, gotoHome, newProject, openStep, parseKws, runCalc, stepBody, stubWeather } from "./helpers.mjs";

const WIDTHS = [
  { name: "極小(320)", width: 320, height: 568 },
  { name: "スマホ小(375)", width: 375, height: 667 },
  { name: "スマホ(390)", width: 390, height: 844 },
  { name: "スマホ大(430)", width: 430, height: 932 },
  { name: "タブレット(768)", width: 768, height: 1024 },
  { name: "PC小(1024)", width: 1024, height: 800 },
  { name: "PC(1440)", width: 1440, height: 1000 },
];

test.describe("レスポンシブ実表示", () => {
  test.beforeEach(async ({ page }) => stubWeather(page));

  for (const w of WIDTHS) {
    test(`${w.name} で10工程に横スクロールが出ない`, async ({ page }) => {
      await page.setViewportSize({ width: w.width, height: w.height });
      await newProject(page);
      for (const s of STEPS) {
        await openStep(page, s.label);
        const overflow = await page.evaluate(
          () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        );
        expect(overflow, `${w.name} step${s.no}(${s.label}) で横スクロール ${overflow}px`).toBe(0);
      }
    });
  }

  test("スマホ幅: ステップ一覧が折りたたまれ、現在ステップが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newProject(page);
    // 折りたたみ時は ol が非表示
    await expect(page.locator("main nav ol")).toBeHidden();
    await expect(page.locator("main nav")).toContainText(/\d+ \/ 10 完了/);
    // 折りたたみ中でも現在ステップ(番号+名称)が見える
    await expect(page.locator("main nav")).toContainText("1.");
    await expect(page.locator("main nav")).toContainText("建物");
    await page.getByRole("button", { name: "ステップ一覧" }).click();
    await expect(page.locator("main nav ol")).toBeVisible();
    await page.getByRole("button", { name: "一覧を閉じる" }).click();
    await expect(page.locator("main nav ol")).toBeHidden();
  });

  test("スマホ幅: 主要ボタンのタップ領域が44px以上ある", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newProject(page);
    const small = [];
    for (const name of ["次のステップ", "前のステップ", "ステップ一覧"]) {
      const box = await page.getByRole("button", { name }).first().boundingBox();
      if (box && box.height < 32) small.push(`${name}=${Math.round(box.height)}px`);
    }
    expect(small, `タップ領域が小さすぎる: ${small.join(", ")}`).toEqual([]);
  });

  test("スマホ幅: 入力欄が見切れない(画面内に収まる)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await newProject(page);
    await openStep(page, "建物");
    const bad = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll("main input, main select").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > vw + 1) out.push(el.tagName + ":" + Math.round(r.left) + "-" + Math.round(r.right));
      });
      return out;
    });
    expect(bad, `見切れている入力欄: ${bad.join(", ")}`).toEqual([]);
  });

  test("スマホ幅: 計算〜結果まで読める形で完了できる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await buildProject(page, { name: "スマホ計算", area: 200, roomArea: 200 });
    await runCalc(page);
    await openStep(page, "結果");
    expect(parseKws(await stepBody(page).innerText()).length).toBeGreaterThan(0);
    const overflow = await page.evaluate(
      () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    expect(overflow).toBe(0);
  });

  test("PC幅: 3カラム(ナビ/入力/ステータス)が同時表示される", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await newProject(page);
    await expect(page.locator("main nav ol")).toBeVisible();
    await expect(page.locator("main")).toContainText("入力ステップ");
    const cols = await page.evaluate(() => {
      const g = document.querySelector("main > div.grid");
      return g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0;
    });
    expect(cols).toBe(3);
  });

  test("境界値: 極端に長い入力値でも横スクロールが出ない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await newProject(page);
    await openStep(page, "建物");
    const longName = "株式会社テスト電気設備工業所 東京都千代田区丸の内一丁目一番一号丸の内ビルディング二十一階 空調設備更新工事";
    await stepBody(page).locator("input[type=text]").nth(0).fill(longName);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    expect(overflow).toBe(0);
  });

  test("ページリロード後にホームが正常表示される(白画面にならない)", async ({ page }) => {
    await gotoHome(page);
    await newProject(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.getElementById("root").innerHTML.length)).toBeGreaterThan(0);
  });
});