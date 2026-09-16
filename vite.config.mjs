import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // hvac-calc-engine.js は CommonJS の計算CORE(Single Source of Truth)。
    // プロジェクト直下にあり node_modules 配下ではないため、CommonJS変換の対象に
    // 明示的に含める(これが無いと ESM から default import できない)。
    commonjsOptions: { include: [/hvac-calc-engine\.js$/, /node_modules/] },
  },
});
