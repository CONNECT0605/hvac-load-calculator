// verify-56.mjs
// 「STABRO互換56項目」(= 022269a基準のE2Eテスト56件)が全てPASSしたことを、
// Playwrightの実行結果から機械的に判定する。
//
// 使い方:
//   npx playwright test --reporter=json > /tmp/e2e.json 2>/dev/null
//   node verify-56.mjs /tmp/e2e.json
//
// 終了コード 0 = 56/56 PASS、1 = 未達(欠落/FAILを列挙)
import fs from "node:fs";
import { BASELINE_56 } from "./stabro-56-baseline.mjs";

const reportPath = process.argv[2] ?? "/tmp/e2e.json";
if (!fs.existsSync(reportPath)) {
  console.error(`レポートが見つかりません: ${reportPath}`);
  console.error("先に npx playwright test --reporter=json > /tmp/e2e.json を実行してください。");
  process.exit(2);
}

const rep = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const status = new Map(); // フルタイトル("describe › test") -> "passed" / その他
function walk(node, prefix) {
  const title = typeof node.title === "string" ? node.title : "";
  // ファイル名は階層に含めない。describe とテスト名のみを積む。
  const isFile = typeof node.file === "string" && node.file === title;
  const chain = isFile ? prefix : [...prefix, title];
  const isSpec = Array.isArray(node.tests) && node.tests.length > 0 && !node.specs;
  if (isSpec) {
    const last = node.tests[0].results?.[node.tests[0].results.length - 1];
    status.set(chain.filter(Boolean).join(" › "), node.ok ? "passed" : (last?.status ?? "failed"));
  }
  for (const s of node.specs ?? []) walk(s, chain);
  for (const su of node.suites ?? []) walk(su, chain);
}
for (const su of rep.suites ?? []) walk(su, []);

const titles = [...status.keys()];
let pass = 0;
const missing = [];
const failed = [];
for (const b of BASELINE_56) {
  const hit = titles.find((t) => t === b || t.endsWith(b) || b.endsWith(t));
  if (!hit) { missing.push(b); continue; }
  if (status.get(hit) === "passed") pass += 1;
  else failed.push(`${b} => ${status.get(hit)}`);
}

console.log(`基準56件: PASS=${pass} FAIL=${failed.length} 未検出=${missing.length}`);
missing.forEach((m) => console.log("  未検出:", m));
failed.forEach((f) => console.log("  FAIL:", f));
if (pass === 56) {
  console.log("\n=== 56/56 PASS ===");
  process.exit(0);
}
console.log("\n=== 56/56 未達 ===");
process.exit(1);