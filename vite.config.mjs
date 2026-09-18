import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// hvac-calc-engine.js は CommonJS(module.exports)で書かれた計算CORE。
// 本番 build は build.commonjsOptions が CJS→ESM 変換するが、dev server には
// その機構が無いため、r6-engine.mjs の相対 import がそのままブラウザへ配信され
// "does not provide an export named 'default'" で白画面になる。
// このプラグインは dev 配信時のみ、末尾の `module.exports = {...}` を ESM の
// default export に置き換える。ディスク上のファイル・計算式・係数は一切変更しない。
function cjsEngineForDev() {
  const FILE = "hvac-calc-engine.js";
  return {
    name: "hvac-cjs-engine-dev",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const path = id.split("?")[0];
      if (!path.endsWith(`/${FILE}`) && !path.endsWith(`\\${FILE}`)) return null;
      if (!code.includes("module.exports")) return null;
      const out = code.replace(/module\.exports\s*=/, "const __cjsExports =") + "\nexport default __cjsExports;\n";
      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cjsEngineForDev()],
  server: {
    // runtime環境のリバースプロキシ経由でアクセスするため、全インターフェースにbindする。
    // (0.0.0.0 にしないとユーザーのブラウザから ERR_CONNECTION_REFUSED になる)
    host: true,
    // Vite 6+ は未知の Host ヘッダを既定でブロックする。
    // runtime が割り当てるホストを明示的に許可する。
    allowedHosts: [
      "work-1-fhniisrencehouyn.prod-runtime.all-hands.dev",
      "work-2-fhniisrencehouyn.prod-runtime.all-hands.dev",
      "localhost",
    ],
  },
  build: {
    // hvac-calc-engine.js は CommonJS の計算CORE(Single Source of Truth)。
    // プロジェクト直下にあり node_modules 配下ではないため、CommonJS変換の対象に
    // 明示的に含める(これが無いと ESM から default import できない)。
    commonjsOptions: { include: [/hvac-calc-engine\.js$/, /node_modules/] },
  },
});
