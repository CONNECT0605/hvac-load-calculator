// UI/UXの品質を実測で固定する回帰テスト。
// 「見た目を良くした」は主観なので、認知負荷に関わる客観指標だけを検証する。
//  - コントラスト比(WCAG AA): 補助文字を薄くしすぎると読めなくなる
//  - タップ領域: スマホでの押しやすさ
//  - 現在地と次の操作の明示: 初見でも次に何をすべきか分かるか
//  - 横スクロール0 / JSエラー0
// 計算・入力項目・業務フローには一切触れない。
import { test, expect } from "@playwright/test";
import { buildProject, gotoHome, newProject, openStep, runCalc, stepBody, stubWeather } from "./helpers.mjs";

// 相対輝度からWCAGコントラスト比を求める(ブラウザ内で実行)。
const CONTRAST_PROBE = () => {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      n = n.parentElement;
    }
    return "rgb(255,255,255)";
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const out = [];
  document.querySelectorAll("main *").forEach((el) => {
    if (!el.textContent || el.children.length > 0) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    const fs = parseFloat(cs.fontSize);
    if (fs < 10) return;
    out.push({
      text: el.textContent.trim().slice(0, 20),
      size: fs,
      ratio: +ratio(cs.color, bgOf(el)).toFixed(2),
      // 18px以上は「大きな文字」としてAA基準が3:1に緩和される
      required: fs >= 18 ? 3 : 4.5,
    });
  });
  return out;
};

test.describe("UI品質(実測)", () => {
  test.beforeEach(async ({ page }) => stubWeather(page));

  test("本文・注記のコントラスト比がWCAG AAを満たす(薄すぎる文字を作らない)", async ({ page }) => {
    await newProject(page);
    const rows = await page.evaluate(CONTRAST_PROBE);
    expect(rows.length).toBeGreaterThan(20);
    const bad = rows.filter((r) => r.ratio < r.required);
    expect(bad, `コントラスト不足: ${bad.map((b) => `${b.text}=${b.ratio}(要${b.required})`).join(", ")}`).toEqual([]);
  });

  test("計算結果・帳票画面でもコントラスト比がWCAG AAを満たす", async ({ page }) => {
    await buildProject(page, { name: "コントラスト確認", area: 300, roomArea: 150 });
    await runCalc(page);
    await openStep(page, "結果");
    const rows = await page.evaluate(CONTRAST_PROBE);
    const bad = rows.filter((r) => r.ratio < r.required);
    expect(bad, `結果画面のコントラスト不足: ${bad.map((b) => `${b.text}=${b.ratio}`).join(", ")}`).toEqual([]);
  });

  test("スマホ幅で操作要素のタップ領域が確保されている", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newProject(page);
    const small = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("main button").forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.height < 32) {
          out.push(`${b.innerText.trim().slice(0, 14)}=${Math.round(r.height)}px`);
        }
      });
      return out;
    });
    expect(small, `タップ領域が32px未満: ${small.join(", ")}`).toEqual([]);
  });

  test("現在地(工程番号)と次の操作が画面に出ている", async ({ page }) => {
    await newProject(page);
    const text = await page.locator("main").innerText();
    // 工程番号(現在地)
    expect(text).toMatch(/1\s*\/\s*10/);
    // 次の操作が名称つきで示される(初見でも行き先が分かる)
    expect(text).toMatch(/次へ/);
    // 不足・要確認の件数が常に見える
    expect(text).toMatch(/不足|要確認/);
  });

  test("工程を進めると現在地表示が追従する", async ({ page }) => {
    await newProject(page);
    await openStep(page, "外気/換気");
    const text = await page.locator("main").innerText();
    expect(text).toMatch(/7\s*\/\s*10/);
  });

  test("10工程すべてで横スクロールが出ない(320px)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await newProject(page);
    for (const label of ["建物", "階", "室", "室内条件", "人員", "照明/機器", "外気/換気", "外皮/", "計算", "結果"]) {
      await openStep(page, label);
      const overflow = await page.evaluate(
        () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      );
      expect(overflow, `${label} で横スクロール ${overflow}px`).toBe(0);
    }
  });

  test("キーボード操作でフォーカスが可視化される", async ({ page }) => {
    await newProject(page);
    await page.keyboard.press("Tab");
    const outlined = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle };
    });
    expect(outlined).not.toBeNull();
    expect(outlined.outlineStyle).not.toBe("none");
    expect(parseFloat(outlined.outlineWidth)).toBeGreaterThan(0);
  });

  test("ホーム画面が主要4値と次の操作を1画面に収めて示す", async ({ page }) => {
    await gotoHome(page);
    const text = await page.locator("main").innerText();
    for (const label of ["編集中の案件", "冷房", "暖房", "保存済み案件"]) {
      expect(text).toContain(label);
    }
    await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();
  });

  test("帳票画面の数値が等幅tabularで桁揃えされる", async ({ page }) => {
    await buildProject(page, { name: "桁揃え確認", area: 300, roomArea: 150 });
    await runCalc(page);
    await page.getByRole("button", { name: "レポート" }).first().click();
    await page.waitForTimeout(400);
    const numerics = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("main .tnum").forEach((el) => {
        const cs = getComputedStyle(el);
        out.push(cs.fontVariantNumeric);
      });
      return out;
    });
    expect(numerics.length).toBeGreaterThan(0);
    expect(numerics.every((v) => v.includes("tabular-nums"))).toBe(true);
  });

  test("入力中の画面にJSエラーが出ない", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await buildProject(page, { name: "エラー確認", area: 200, roomArea: 200 });
    await runCalc(page);
    expect(await stepBody(page).innerText()).toMatch(/kW/);
    expect(errors).toEqual([]);
  });
});
