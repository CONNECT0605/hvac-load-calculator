// hvac-calc-engine.sync-check.js
// engine.js と jsx に埋め込まれた計算ロジック(SHARED-LOGIC-START〜END)が
// 一字一句同一であることを機械的に検証する。
// 使い方: node hvac-calc-engine.sync-check.js
// 終了コード0=一致、1=不一致(修正が必要)

const fs = require("fs");
const { execSync } = require("child_process");

function extractSharedBlock(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const startMarker = "// ===SHARED-LOGIC-START===";
  const endMarker = "// ===SHARED-LOGIC-END===";
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`${filePath}: SHARED-LOGICマーカーが見つかりません`);
  }
  return content.slice(startIdx, endIdx + endMarker.length);
}

const engineBlock = extractSharedBlock("./hvac-calc-engine.js");
const jsxBlock = extractSharedBlock("./hvac-load-calculator.jsx");

if (engineBlock === jsxBlock) {
  console.log("✅ 一致: hvac-calc-engine.js と hvac-load-calculator.jsx の計算ロジックは同一です。");
  console.log(`   行数: ${engineBlock.split("\n").length}行`);
  process.exit(0);
} else {
  console.log("❌ 不一致: engine.js と jsx の計算ロジックが乖離しています。修正が必要です。");
  fs.writeFileSync("/tmp/engine-block.txt", engineBlock);
  fs.writeFileSync("/tmp/jsx-block.txt", jsxBlock);
  try {
    execSync("diff /tmp/engine-block.txt /tmp/jsx-block.txt", { stdio: "inherit" });
  } catch (e) {
    // diff exits non-zero when there are differences; output already printed via stdio:inherit
  }
  process.exit(1);
}
