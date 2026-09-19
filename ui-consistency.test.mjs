// ui-consistency.test.mjs
// UI文言と計算エンジンの実装範囲が一致していることを機械的に検証する。
// 目的: 「詳細方式は未実装」等の旧文言が、実装済みの詳細方式の説明として
// 再混入することを防ぐ(実装と文言の乖離を回帰として検出する)。
import { readFileSync } from "node:fs";
import { ESTIMATE_NOTICES } from "./report-data.mjs";

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}

const stepScreens = readFileSync(new URL("./step-screens.jsx", import.meta.url), "utf8");
const engineSource = readFileSync(new URL("./hvac-calc-engine.js", import.meta.url), "utf8");
const noticesText = ESTIMATE_NOTICES.join("\n");

// 詳細方式は engine の computeDetailedLoad() として実装済み。
check(/function computeDetailedLoad/.test(engineSource), "詳細方式 computeDetailedLoad() が engine に実装されている");

// 実装済みの詳細負荷項目(公的基準の項目)が明示されている。
for (const label of ["構造体負荷", "ガラス面負荷", "照明負荷", "人体負荷", "すきま風負荷", "外気負荷"]) {
  check(engineSource.includes(label), `engine に「${label}」の項目定義がある(実装範囲の明示)`);
}

// 表示文言が「詳細方式は未実装」と主張していないこと(実装との矛盾を禁止)。
const staleClaims = [
  "詳細計算(詳細方式)は未実装",
  "詳細方式(B)未実装",
  "詳細計算は未実装",
];
for (const claim of staleClaims) {
  check(!noticesText.includes(claim), `このツールについて に旧文言「${claim}」が残っていない`);
  check(!stepScreens.includes(claim), `入力画面に旧文言「${claim}」が残っていない`);
}

// 概算値に積み上げていないことと、詳細帳票で扱うことが両方明示されていること。
check(noticesText.includes("詳細帳票"), "このツールについて が詳細帳票の役割を明示している");
check(noticesText.includes("積み上げていません"), "このツールについて が概算値の適用範囲を明示している");

// 未実装として残る項目(ダクト・配管・空気漏洩・送風機・ポンプ・間欠空調)を隠さない。
check(noticesText.includes("未実装"), "残存する未実装項目を明示している");
for (const item of ["ダクト", "空気漏洩", "送風機", "間欠空調"]) {
  check(noticesText.includes(item), `未実装項目「${item}」が明示されている`);
}

// 外皮・窓の入力画面が、詳細帳票で積み上げる旨を案内していること。
const envelopeBlock = stepScreens.slice(stepScreens.indexOf("function EnvelopeStep"));
check(envelopeBlock.slice(0, 800).includes("詳細方式の熱負荷計算書"), "外皮/窓画面が詳細帳票での算入を案内している");
const internalBlock = stepScreens.slice(stepScreens.indexOf("function InternalHeatStep"));
check(internalBlock.slice(0, 800).includes("詳細方式の熱負荷計算書"), "照明/機器画面が詳細帳票での算入を案内している");
const outdoorBlock = stepScreens.slice(stepScreens.indexOf("function OutdoorAirStep"));
check(outdoorBlock.slice(0, 800).includes("詳細方式の帳票"), "外気/換気画面が詳細帳票での算入を案内している");

console.log(`\n=== UI文言と実装の整合テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
process.exit(fail === 0 ? 0 : 1);
