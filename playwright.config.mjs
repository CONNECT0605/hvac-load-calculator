import { defineConfig } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 天気(Open-Meteo)は外部依存のため、E2Eでは実APIを叩かず遮断して
    // フォールバック表示を検証対象にする(テストのネットワーク非依存化)。
    offline: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});