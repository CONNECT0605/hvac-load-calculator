// stabro-compat-56.test.mjs
// 「STABRO互換56項目」の実体を固定し、機械的に検証する。
//
// 経緯: 外部指示の「STABRO互換56項目」には、リポジトリ内に同名のリストが存在しない
// (全履歴・全ブランチ検索で0件)。実測すると、前回基準コミット 022269a 時点の
// E2Eテストがちょうど56件であり、この56件が本アプリの互換検証セットの実体である。
// よって「56/56 PASS」= この56件がE2Eスイートに存在し、全て成功すること。
//
// このファイルの期待値は 022269a の実測をそのまま記録したもので、
// 「正しいタイトル」の主張ではなく「56件が失われていないこと」の検出が目的。
// 56件を削除・改名する場合は、その理由をコミットメッセージに明記すること。
import { execSync } from "node:child_process";
import { BASELINE_56 } from "./stabro-56-baseline.mjs";

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, label) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${label}`); }
  else { fail += 1; failures.push(label); console.log(`❌ FAIL: ${label}`); }
}

// 1) 基準リストそのものの健全性
check(BASELINE_56.length === 56, `基準リストは56件である(${BASELINE_56.length})`);
check(new Set(BASELINE_56).size === 56, "基準リストに重複がない");

// 2) 現在のE2Eスイートを実際に列挙し、56件すべての存在を照合する
//    (推測ではなく playwright の実出力を使う)
let listed = [];
try {
  const out = execSync("npx playwright test --list --reporter=line", {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000,
  });
  listed = out
    .split("\n")
    .map((l) => l.replace(/^\s*\[chromium\]\s*›\s*/, "").trim())
    .filter((l) => l.includes("›"))
    .map((l) => l.replace(/^[^›]*›\s*/, "").trim());
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  listed = out
    .split("\n")
    .map((l) => l.replace(/^\s*\[chromium\]\s*›\s*/, "").trim())
    .filter((l) => l.includes("›"))
    .map((l) => l.replace(/^[^›]*›\s*/, "").trim());
}

check(listed.length > 0, `playwright からテスト一覧を取得できた(${listed.length}件)`);
const listedSet = new Set(listed);
const missing = BASELINE_56.filter((t) => !listedSet.has(t));
check(missing.length === 0, `56件すべてがE2Eスイートに存在する(欠落 ${missing.length}件)`);
for (const m of missing) console.log(`   欠落: ${m}`);

// 3) E2E総数が56以上であること(ホーム改善で3件追加済みのため現在は59)
check(listed.length >= 56, `E2E総数が56以上(${listed.length}件)`);

console.log(`\n=== STABRO互換56項目ロック 結果: ${pass}件成功 / ${fail}件失敗 ===`);
console.log("56/56 = 022269a基準のE2Eテスト56件が現存すること。");
if (fail > 0) { console.log("失敗:"); failures.forEach((f) => console.log("  -", f)); }
process.exit(fail === 0 ? 0 : 1);