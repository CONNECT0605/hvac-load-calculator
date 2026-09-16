// E2E 共通ヘルパー。UIの日本語ラベルに依存するため、ラベル変更時はここだけ直せばよい。
import { expect } from "@playwright/test";

export const STEPS = [
  { no: 1, id: "building", label: "建物" },
  { no: 2, id: "floors", label: "階" },
  { no: 3, id: "rooms", label: "室" },
  { no: 4, id: "conditions", label: "室内条件" },
  { no: 5, id: "occupancy", label: "人員" },
  { no: 6, id: "internal", label: "照明/機器" },
  { no: 7, id: "outdoorair", label: "外気/換気" },
  { no: 8, id: "envelope", label: "外皮/" },
  { no: 9, id: "calc", label: "計算" },
  { no: 10, id: "result", label: "結果" },
];

export const OK_FORECAST = {
  daily: {
    time: ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"],
    weather_code: [0, 3, 61, 2, 95],
    temperature_2m_max: [28.1, 26.4, 24.0, 27.3, 25.5],
    temperature_2m_min: [21.0, 20.2, 19.1, 20.8, 19.9],
    precipitation_probability_max: [10, 30, 80, 20, 60],
  },
};

export async function gotoHome(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();
}

export async function newProject(page) {
  await gotoHome(page);
  await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
  await expect(page.getByTestId("step-editor")).toBeVisible();
}

// ?design=A|B|C を付けて特定デザインで開く(比較・回帰検証用)。
export async function newProjectAs(page, design) {
  await page.goto(`/?design=${design}`);
  await expect(page.getByRole("button", { name: "新規案件", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "新規案件", exact: true }).first().click();
  await expect(page.getByTestId("step-editor")).toBeVisible();
}

export const STEP_IDS = {
  building: "建物", floors: "階", rooms: "室", conditions: "室内条件", occupancy: "人員",
  internal: "照明/機器", outdoorair: "外気/換気", envelope: "外皮/", calc: "計算", result: "結果",
};

// A/B/C いずれのデザインでも同じ手順でステップを開けるようにする。
// 各デザインのナビは data-testid="step-nav-<id>" で同じ契約を満たす。
export async function openStep(page, label) {
  const id = Object.keys(STEP_IDS).find((k) => STEP_IDS[k] === label);
  if (!id) throw new Error(`未知のステップ: ${label}`);

  // Design C: 画面下バーの「全ステップ」を開く
  const cToggle = page.getByRole("button", { name: "全ステップ" });
  if ((await cToggle.count()) > 0 && (await cToggle.first().isVisible())) {
    await cToggle.first().click();
    await page.waitForTimeout(150);
  }
  // Design A(モバイル): 折りたたみナビを開く
  const toggle = page.getByRole("button", { name: "ステップ一覧" });
  if ((await toggle.count()) > 0 && (await toggle.first().isVisible())) {
    await toggle.first().click();
    await page.waitForTimeout(150);
  }
  await page.getByTestId(`step-nav-${id}`).first().click();
  await page.waitForTimeout(250);
}

// A/B/C いずれのレイアウトでも現在のステップ本体を指す。
export function stepBody(page) {
  return page.getByTestId("step-editor");
}

export async function fillBuilding(page, { name, client, area } = {}) {
  const body = stepBody(page);
  if (name !== undefined) await body.locator("input[type=text]").nth(0).fill(name);
  if (client !== undefined) await body.locator("input[type=text]").nth(1).fill(client);
  if (area !== undefined) await body.locator("input[type=number]").nth(0).fill(String(area));
}

// 室を1件以上もつ案件を作る(計算実行の前提条件)。
export async function buildProject(page, { name = "E2E案件", area = 300, usage = "office", roomArea = 150, floors = 1 } = {}) {
  await newProject(page);
  await openStep(page, "建物");
  await fillBuilding(page, { name, area });

  await openStep(page, "階");
  for (let i = 1; i < floors; i += 1) {
    await page.getByRole("button", { name: "階を追加" }).click();
    await page.waitForTimeout(150);
  }

  await openStep(page, "室");
  const body = stepBody(page);
  const sections = body.locator("section");
  for (let i = 0; i < (await sections.count()); i += 1) {
    const sec = sections.nth(i);
    if ((await sec.locator("table tbody tr").count()) === 0) {
      await sec.getByRole("button", { name: "室を追加" }).first().click();
      await page.waitForTimeout(200);
    }
  }
  const rows = body.locator("table tbody tr");
  for (let j = 0; j < (await rows.count()); j += 1) {
    const tr = rows.nth(j);
    await tr.locator("select").first().selectOption(usage);
    await tr.locator("input[type=number]").nth(0).fill(String(roomArea));
    await page.waitForTimeout(120);
  }
  return { name, area, usage, roomArea, floors };
}

export async function runCalc(page) {
  await openStep(page, "計算");
  const btn = page.getByRole("button", { name: "計算結果を表示" });
  await expect(btn).toBeEnabled();
  await btn.click();
  await page.waitForTimeout(400);
}

export async function gotoScreen(page, name) {
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForTimeout(400);
}

// localStorage の保存領域キー(project-storage.mjs と一致させる)
export const STORAGE_KEY = "hvac-load-calculator.projects.v1";

export async function readStore(page) {
  return page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
}

export function parseKws(text) {
  return [...text.matchAll(/([\d.]+)\s*kW/g)].map((m) => Number(m[1]));
}

// 天気API(Open-Meteo)は外部依存のため、E2Eではスタブして結果を固定する。
export async function stubWeather(page, { fail = false } = {}) {
  await page.route("**/api.open-meteo.com/**", (route) => {
    if (fail) return route.abort();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(OK_FORECAST),
    });
  });
}