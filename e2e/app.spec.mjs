// HVAC負荷計算アプリ E2E(17ケース)
// 実際のブラウザ操作で、10工程・入力保持・計算・出力・レスポンシブを検証する。
import { test, expect } from "@playwright/test";
import {
  STEPS, buildProject, fillBuilding, gotoScreen, gotoHome, newProject, openStep,
  parseKws, readStore, runCalc, stepBody, stubWeather, STORAGE_KEY,
} from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await stubWeather(page); // 外部API非依存化(天気はスタブ)
  page.on("pageerror", (e) => {
    throw new Error(`pageerror: ${e.message}`);
  });
});

// 1
test("01 ホーム画面が表示され、主要な導線が揃っている", async ({ page }) => {
  await gotoHome(page);
  const main = page.locator("main");
  await expect(main.getByRole("button", { name: "新規案件", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "案件一覧", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "インポート", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "案件を保存" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ホーム" })).toBeVisible();
});

// 2
test("02 10ステップすべてが遷移でき、各画面が描画される", async ({ page }) => {
  await newProject(page);
  const seen = [];
  for (const s of STEPS) {
    await openStep(page, s.label);
    const text = await stepBody(page).innerText();
    expect(text.length, `step ${s.no} (${s.label}) が空`).toBeGreaterThan(0);
    seen.push(s.no);
  }
  expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// 3
test("03 前後の移動で全10工程を往復できる", async ({ page }) => {
  await newProject(page);
  // 10工程すべてに直接移動できる導線がある(デザインA/B/Cいずれも同じ契約)
  await expect(page.getByTestId(/^step-nav-/)).toHaveCount(10);

  // 実際に前後へ移動できる
  await openStep(page, "結果");
  await expect(stepBody(page)).toContainText("結果");
  await openStep(page, "建物");
  await expect(stepBody(page)).toContainText("建物");
  await openStep(page, "計算");
  await expect(stepBody(page)).toContainText("計算");
});

// 4
test("04 前工程へ戻っても入力値が保持される", async ({ page }) => {
  await newProject(page);
  await openStep(page, "建物");
  await fillBuilding(page, { name: "保持確認物件", area: 333 });
  await openStep(page, "室");
  await openStep(page, "建物");
  const body = stepBody(page);
  await expect(body.locator("input[type=text]").nth(0)).toHaveValue("保持確認物件");
  await expect(body.locator("input[type=number]").nth(0)).toHaveValue("333");
});

// 5
test("05 再度進んだ場合も入力値が保持される", async ({ page }) => {
  await newProject(page);
  await openStep(page, "室");
  await page.locator("main").getByRole("button", { name: "室を追加" }).first().click();
  const body = stepBody(page);
  const row = body.locator("table tbody tr").first();
  await row.locator("input[type=text]").first().fill("会議室A");
  await row.locator("input[type=number]").nth(0).fill("88");
  await openStep(page, "建物");
  await openStep(page, "室");
  const row2 = stepBody(page).locator("table tbody tr").first();
  await expect(row2.locator("input[type=text]").first()).toHaveValue("会議室A");
  await expect(row2.locator("input[type=number]").nth(0)).toHaveValue("88");
});

// 6
test("06 面積変更が計算結果(kW)に反映される", async ({ page }) => {
  await buildProject(page, { name: "計算反映", area: 300, usage: "office", roomArea: 100 });
  await openStep(page, "計算");
  await expect(page.getByRole("button", { name: "計算結果を表示" })).toBeEnabled();

  // 室面積を2倍にすると負荷も増える(単調性)
  await openStep(page, "室");
  await stepBody(page).locator("table tbody tr").first().locator("input[type=number]").nth(0).fill("200");
  await page.waitForTimeout(200);
  await runCalc(page);
  await openStep(page, "結果");
  const big = parseKws(await stepBody(page).innerText());
  expect(big.length).toBeGreaterThan(0);

  await openStep(page, "室");
  await stepBody(page).locator("table tbody tr").first().locator("input[type=number]").nth(0).fill("100");
  await page.waitForTimeout(200);
  await runCalc(page);
  await openStep(page, "結果");
  const small = parseKws(await stepBody(page).innerText());
  expect(Math.max(...big)).toBeGreaterThan(Math.max(...small));
});

// 7
test("07 結果画面に必要能力と機器選定が表示される", async ({ page }) => {
  await buildProject(page, { name: "結果確認", area: 300, usage: "office", roomArea: 300 });
  await runCalc(page);
  await openStep(page, "結果");
  const text = await stepBody(page).innerText();
  expect(text).toMatch(/kW/);
  expect(text).toContain("台");
  expect(parseKws(text).length).toBeGreaterThan(0);
});

// 8
test("08 未入力(室なし)では計算できず、理由が示される", async ({ page }) => {
  await newProject(page);
  await openStep(page, "計算");
  await expect(page.getByRole("button", { name: "計算結果を表示" })).toBeDisabled();
  const text = await stepBody(page).innerText();
  expect(text).toContain("⚠"); // 未充足の理由が列挙されている
  expect(text).toMatch(/室|面積/);
});

// 9
test("09 不正値(面積0/負)でもクラッシュせず、入力チェックに現れる", async ({ page }) => {
  await newProject(page);
  await openStep(page, "建物");
  await fillBuilding(page, { name: "不正値", area: 0 });
  await openStep(page, "室");
  const body = stepBody(page);
  const sections = body.locator("section");
  for (let i = 0; i < (await sections.count()); i += 1) {
    const sec = sections.nth(i);
    if ((await sec.locator("table tbody tr").count()) === 0) {
      await sec.getByRole("button", { name: "室を追加" }).first().click();
      await page.waitForTimeout(150);
    }
  }
  const row = body.locator("table tbody tr").first();
  await row.locator("select").first().selectOption("office");
  await row.locator("input[type=number]").nth(0).fill("-50");
  await page.waitForTimeout(300);
  await openStep(page, "計算");
  const text = await stepBody(page).innerText();
  expect(text).toContain("⚠"); // 面積不正が入力チェックに現れる
  expect(text).toMatch(/面積/);
  await expect(page.getByRole("button", { name: "計算結果を表示" })).toBeDisabled();
});

// 10
test("10 案件の保存 → 一覧 → 開く が機能する", async ({ page }) => {
  await buildProject(page, { name: "保存テスト物件", area: 200, roomArea: 100 });
  await gotoScreen(page, "案件を保存");
  await expect(page.getByText(/保存しました/)).toBeVisible();

  await gotoScreen(page, "案件一覧");
  await expect(page.locator("main")).toContainText("保存テスト物件");
  await page.getByRole("button", { name: "開く" }).first().click();
  await page.waitForTimeout(500);
  await gotoScreen(page, "案件一覧");
  await expect(page.locator("main")).toContainText("保存テスト物件");
});

// 11
test("11 案件の複製・削除が機能する", async ({ page }) => {
  await buildProject(page, { name: "複製テスト", area: 200, roomArea: 100 });
  await gotoScreen(page, "案件を保存");
  await gotoScreen(page, "案件一覧");
  const before = await page.getByRole("button", { name: "削除" }).count();
  await page.getByRole("button", { name: "複製" }).first().click();
  await page.waitForTimeout(600);
  await expect(page.getByRole("button", { name: "削除" })).toHaveCount(before + 1);
  await page.getByRole("button", { name: "削除" }).first().click();
  await page.waitForTimeout(600);
  await expect(page.getByRole("button", { name: "削除" })).toHaveCount(before);
});

// 12
test("12 JSON書き出し → インポートで往復できる(往復で値が一致)", async ({ page }) => {
  await buildProject(page, { name: "往復テスト", area: 250, usage: "office", roomArea: 250 });
  await gotoScreen(page, "案件を保存");
  await gotoScreen(page, "案件一覧");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出し" }).first().click(),
  ]);
  const path = await download.path();
  expect(download.suggestedFilename()).toContain("往復テスト");
  const raw = (await import("node:fs")).readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw);
  expect(parsed.project.inputs.totalFloorArea).toBe(250);

  // インポート(正しいラベルは「インポート」)
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "インポート" }).first().click();
  (await chooser).setFiles(path);
  await page.waitForTimeout(900);
  await expect(page.getByText(/インポートしました/)).toBeVisible();
  await openStep(page, "建物");
  await expect(stepBody(page).locator("input[type=number]").nth(0)).toHaveValue("250");
});

// 13
test("13 レポート(帳票)が表示され、CSV出力できる", async ({ page }) => {
  await buildProject(page, { name: "帳票テスト", area: 300, roomArea: 300 });
  await runCalc(page);
  await gotoScreen(page, "レポート");
  const main = page.locator("main");
  await expect(main).toContainText("帳票テスト");
  await expect(main).toContainText("kW");

  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV出力" }).click(),
  ]);
  const buf = (await import("node:fs")).readFileSync(await dl.path());
  expect(buf.subarray(0, 3).toString("hex")).toBe("efbbbf"); // BOM付UTF-8
  const csv = buf.toString("utf-8");
  expect(csv).toMatch(/kW/);
  expect(csv).not.toMatch(/BTU|tonnage/i);
});

// 14
test("14 印刷/PDF で帳票DOMが出力対象になり、操作系が除外される", async ({ page }) => {
  await buildProject(page, { name: "印刷テスト", area: 300, roomArea: 300 });
  await runCalc(page);
  await gotoScreen(page, "レポート");
  await expect(page.getByRole("button", { name: "印刷 / PDF" })).toBeVisible();

  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.length).toBeGreaterThan(2000);

  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);
  const displays = await page.evaluate(() =>
    [...document.querySelectorAll(".no-print")].map((el) => getComputedStyle(el).display),
  );
  expect(displays.every((d) => d === "none")).toBe(true);
  expect((await page.evaluate(() => document.body.innerText.length))).toBeGreaterThan(100);
  await page.emulateMedia({ media: "screen" });
});

// 15
test("15 天気: API正常時は予報、失敗時はフォールバック表示(白画面にならない)", async ({ page }) => {
  // 正常系
  await gotoHome(page);
  await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
  await openStep(page, "建物");
  const okPanel = page.getByText("現場周辺の天気予報");
  await expect(okPanel).toBeVisible();
  await expect(page.getByText(/9\/15\(火\)/)).toBeVisible();
  await expect(page.getByText(/Open-Meteo/)).toBeVisible();

  // 失敗系(別コンテキストでAPI遮断)
  const ctx2 = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx2.newPage();
  await p2.route("**/api.open-meteo.com/**", (r) => r.abort());
  await p2.goto("/");
  await p2.getByRole("button", { name: "新規案件", exact: true }).first().click();
  const cT = p2.getByRole("button", { name: "全ステップ" });
  if ((await cT.count()) > 0 && (await cT.first().isVisible())) await cT.first().click();
  const toggle = p2.getByRole("button", { name: "ステップ一覧" });
  if ((await toggle.count()) > 0 && (await toggle.first().isVisible())) await toggle.first().click();
  await p2.getByTestId("step-nav-building").first().click();
  await p2.waitForTimeout(1500);
  await expect(p2.getByText(/天気予報を取得できませんでした/)).toBeVisible();
  await expect(p2.getByText(/計算結果には影響しません/)).toBeVisible();
  expect(await p2.evaluate(() => document.getElementById("root").innerHTML.length)).toBeGreaterThan(0);
  await ctx2.close();
});

// 16
test("16 リロードしても保存済み案件が失われない(保存の永続性)", async ({ page }) => {
  await buildProject(page, { name: "永続テスト物件", area: 222, roomArea: 100 });
  await gotoScreen(page, "案件を保存");
  const raw = await readStore(page);
  expect(raw).toContain("永続テスト物件");

  await page.reload();
  await gotoHome(page);
  await gotoScreen(page, "案件一覧");
  await expect(page.locator("main")).toContainText("永続テスト物件");
  await page.getByRole("button", { name: "開く" }).first().click();
  await openStep(page, "建物");
  await expect(stepBody(page).locator("input[type=number]").nth(0)).toHaveValue("222");
});

// 17
test("17 保存データ破損・未知IDでも起動し、計算を継続できる", async ({ page }) => {
  await gotoHome(page);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, "{ 壊れたJSON"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("root").innerHTML.length)).toBeGreaterThan(0);

  // 未知IDを持つ旧データ
  const legacy = JSON.stringify([
    {
      schemaVersion: 1, projectId: "p-legacy", projectName: "旧データ案件",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      inputs: {
        schemaVersion: 2, projectId: null, projectName: "旧データ案件", client: "", siteAddress: "",
        buildingTypeId: "__OLD__", regionId: "__OLD__", totalFloorArea: 100, airConditionedArea: null,
        operatingHours: null, marginPct: 0, targetFloorId: null,
        floors: [{ floorId: "f1", name: "1F", level: 1, note: "" }],
        rooms: [{
          roomId: "r1", floorId: "f1", name: "室1", usage: "__OLD__", floorArea: 100, ceilingHeight: 2.7,
          indoorTemperature: { cooling: 26, heating: 22 }, indoorHumidity: { cooling: null, heating: null },
          operatingHours: { start: null, end: null }, occupancy: null,
          internalHeat: { lightingWm2: null, equipmentWm2: null, others: [] },
          outdoorAir: { volumeM3h: null, ventilationType: null, heatRecovery: { enabled: false, efficiency: null }, infiltration: { sashTightness: null, hasExternalDoor: null } },
          envelope: { walls: [], ceiling: { area: null, uValue: null }, windows: [] },
        }],
        note: "",
      },
    },
  ]);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, legacy]);
  await page.reload();
  await gotoHome(page);
  await gotoScreen(page, "案件一覧");
  await page.getByRole("button", { name: "開く" }).first().click();
  await page.waitForTimeout(600);
  await expect(page.getByText(/既定値に置き換えました/)).toBeVisible();
  await runCalc(page);
  await openStep(page, "結果");
  expect(parseKws(await stepBody(page).innerText()).length).toBeGreaterThan(0);
});