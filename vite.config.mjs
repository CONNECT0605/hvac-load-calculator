import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // hvac-calc-engine.js は Node の CommonJS(module.exports)で書かれた計算CORE。
    // エンジン本体には手を入れず、ビルド時に CommonJS として読み込む。
    commonjsOptions: { include: [/hvac-calc-engine\.js$/, /node_modules/] },
  },
});

