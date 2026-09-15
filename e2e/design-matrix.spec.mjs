// デザインA/B/Cの機能等価性と回帰検証。
// 「最終デザインを差し替えても計算・入力・保存・出力が壊れていない」ことを
// 3案それぞれで実ブラウザ操作して確認する。
import { test, expect } from "@playwright/test";
import { readStore } from "./helpers.mjs";

const DESIGNS = ["A", "B", "C"];

test.describe("デザインA/B/C 機能等価性", () => {
  for (const d of DESIGNS) {
    test(`Design ${d}: 起動〜10工程〜計算〜結果〜保存〜帳票〜CSVが動作する`, async ({ page }) => {
      await page.route("**/api.open-meteo.com/**", (r) => r.abort()); // 外部APIは遮断(フォールバック経路)
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(`/?design=${d}`);
      await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();

      const editor = page.getByTestId("step-editor");
      const openPanel = async () => {
        const c = page.getByRole("button", { name: "全ステップ" });
        if ((await c.count()) > 0 && (await c.first().isVisible())) await c.first().click();
        const t = page.getByRole("button", { name: "ステップ一覧" });
        if ((await t.count()) > 0 && (await t.first().isVisible())) await t.first().click();
      };
      const goto = async (id) => {
        await openPanel();
        await page.getByTestId(`step-nav-${id}`).first().click();
        await page.waitForTimeout(250);
      };

      await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
      await page.waitForTimeout(600);

      // 1) 建物
      await editor.locator("input[type=text]").nth(0).fill(`比較_${d}`);
      await editor.locator("input[type=number]").nth(0).fill("500");

      // 2) 階を3つ
      await goto("floors");
      for (let i = 0; i < 2; i += 1) {
        await page.getByRole("button", { name: "階を追加" }).click();
        await page.waitForTimeout(150);
      }

      // 3) 室
      await goto("rooms");
      const secs = editor.locator("section");
      for (let i = 0; i < (await secs.count()); i += 1) {
        const sec = secs.nth(i);
        if ((await sec.locator("table tbody tr").count()) === 0) {
          await sec.getByRole("button", { name: "室を追加" }).first().click();
          await page.waitForTimeout(200);
        }
      }
      await goto("floors");
      await goto("rooms");
      const rows = editor.locator("table tbody tr");
      const n = await rows.count();
      for (let j = 0; j < n; j += 1) {
        const tr = rows.nth(j);
        await tr.locator("select").first().selectOption("office");
        await tr.locator("input[type=number]").nth(0).fill("150");
        await page.waitForTimeout(100);
      }
      expect(n).toBeGreaterThan(0);

      // 9-10) 計算 → 結果
      await goto("calc");
      const run = editor.getByRole("button", { name: "計算結果を表示" });
      await expect(run).toBeEnabled();
      await run.click();
      await page.waitForTimeout(600);
      const resultText = await editor.innerText();
      expect(resultText).toMatch(/kW/);

      // 保存
      await page.getByRole("button", { name: "案件を保存" }).first().click();
      await page.waitForTimeout(600);
      expect(await readStore(page)).toContain(`比較_${d}`);

      // レポート + CSV
      await page.getByRole("button", { name: "レポート" }).first().click();
      await page.waitForTimeout(600);
      const mainText = await page.locator("main").innerText();
      expect(mainText).toContain(`比較_${d}`);
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "CSV出力" }).click(),
      ]);
      const buf = (await import("node:fs")).readFileSync(await dl.path());
      expect(buf.subarray(0, 3).toString("hex")).toBe("efbbbf");
      expect(buf.toString("utf-8")).not.toMatch(/BTU|tonnage/i);

      expect(errors, `Design ${d} でJSエラー: ${errors.join(" / ")}`).toEqual([]);
    });

    test(`Design ${d}: PC/タブレット/スマホで横スクロールが出ない`, async ({ page }) => {
      await page.route("**/api.open-meteo.com/**", (r) => r.abort());
      for (const [w, h] of [[1440, 1000], [768, 1024], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`/?design=${d}`);
        await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(
          () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        );
        expect(overflow, `Design ${d} ${w}px で横スクロール ${overflow}px`).toBe(0);
      }
    });

    test(`Design ${d}: 未入力時は計算ボタンが押せず理由が出る`, async ({ page }) => {
      await page.route("**/api.open-meteo.com/**", (r) => r.abort());
      await page.goto(`/?design=${d}`);
      await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
      await page.waitForTimeout(500);
      const c = page.getByRole("button", { name: "全ステップ" });
      if ((await c.count()) > 0 && (await c.first().isVisible())) await c.first().click();
      const t = page.getByRole("button", { name: "ステップ一覧" });
      if ((await t.count()) > 0 && (await t.first().isVisible())) await t.first().click();
      await page.getByTestId("step-nav-calc").first().click();
      await page.waitForTimeout(400);
      await expect(page.getByTestId("step-editor").getByRole("button", { name: "計算結果を表示" })).toBeDisabled();
      expect(await page.getByTestId("step-editor").innerText()).toMatch(/⚠|必要|不足/);
    });
  }

  test("最終採用デザインは ?design 未指定時に表示される", async ({ page }) => {
    await page.route("**/api.open-meteo.com/**", (r) => r.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
    await page.waitForTimeout(600);
    // 通常利用ではデザイン切替UIを出さない
    await expect(page.getByText("デザイン比較")).toHaveCount(0);
    // 最終デザイン(B)の段階タブが出る
    await expect(page.getByRole("button", { name: /つくる/ })).toBeVisible();
  });
});

// 将来のCAD/BIM取り込みを壊さないことを確認する設計上の境界。
// データモデルは「図面解析で埋められる余地」を残しつつ、現行は手入力のみ。
test("CAD/BIM: 今回は未実装であり、図面アップロードUIが存在しない", async ({ page }) => {
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toMatch(/DXF|IFC|BIM取り込み/);
  await expect(page.getByText(/図面|BIM/i)).toHaveCount(0);
});

