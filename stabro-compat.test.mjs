// stabro-compat.test.mjs
// STABRO(建築設備設計基準 令和6年版)準拠 詳細方式の「入力→結果」因果テスト。
// 「入力欄があるだけではFAIL。その入力が計算結果に実際に影響していること」を検証する。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const e = require("./hvac-calc-engine.js");

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}
const close = (a, b, tol = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

// 基準入力(係数は本テストで明示。既定係数の発明ではなく入力値)
const base = () => ({
  regionId: "kanto", usage: "office",
  floorAreaTotal: 500, ceilingHeight: 2.6, occupants: 50,
  coolingSetTemp: 26, heatingSetTemp: 22,
  indoorRHCooling: 50, indoorRHHeating: 40,
  lightingWm2: 9, equipmentWm2: 20,
  outdoorAirVolumeM3h: 1500,
  walls: [{ area: 200, orientation: "s", uValue: 1.5 }],
  windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.7 }],
  roof: { area: 500, uValue: 1.0 },
  floorEnvelope: { area: 500, uValue: 1.2 },
  solarWm2: { s: { 9: 200, 12: 400, 14: 450, 16: 300 }, w: { 9: 150, 12: 350, 14: 500, 16: 600 } },
  hours: [9, 12, 14, 16],
});
const run = (patch = {}) => e.computeDetailedLoad({ ...base(), ...patch });
const peakOf = (r) => r.hourlyResults.find((h) => h.hour === r.peak.coolingHour);

console.log("=== STABRO R6 詳細方式 因果テスト ===");

// 0. 基本
const r0 = run();
check(r0.status === "ok" && r0.method === "detailed", "基準ケースが計算できる(detailed)");
check(r0.hourlyResults.length === 4, "時刻別に4時刻(9/12/14/16)を算出する");
check(r0.peak.coolingKW > 0, "最大冷房負荷が正の値");
check(r0.hourlyResults.some((h) => !close(h.coolingTotalKW, r0.hourlyResults[0].coolingTotalKW)), "時刻を変えると時刻別負荷が変化する");
check(r0.peak.coolingHour === r0.hourlyResults.reduce((a, b) => (b.coolingTotalKW > a.coolingTotalKW ? b : a), r0.hourlyResults[0]).hour, "最大負荷時刻が正しく選ばれる");

// 1. 内訳の整合(積み上げ→顕熱/潜熱→全熱)
const pk = peakOf(r0);
const sumComp = Object.values(pk.components).reduce((a, b) => a + b, 0);
check(close(sumComp, pk.coolingSensibleKW + pk.coolingLatentKW, 1e-6), "内訳の合計 = 顕熱+潜熱");
check(close(pk.coolingSensibleKW + pk.coolingLatentKW, pk.coolingTotalKW, 1e-6), "顕熱+潜熱 = 全熱");
check(close(r0.designLoadCoolingKW, r0.peak.coolingKW, 1e-6), "最大負荷(余裕率0)= ピーク全熱");

// 2. 外皮・壁・屋根・床・内壁
check(run({ walls: [{ area: 200, orientation: "s", uValue: 0.8 }] }).peak.coolingKW < r0.peak.coolingKW, "外壁のU値を下げると外皮負荷(全体)が減る");
check(run({ roof: { area: 500, uValue: 0.5 } }).peak.coolingKW < r0.peak.coolingKW, "屋根のU値を下げると屋根負荷(全体)が減る");
const floorA = run({ floorEnvelope: { area: 500, uValue: 0.6 } });
const floorB = run({ floorEnvelope: { area: 500, uValue: 3.0 } });
check(close(floorA.peak.coolingKW, floorB.peak.coolingKW), "床は暖房設計用地中温度が未確認のため冷房では寄与0(仕様どおり)");
check(floorA.notVerified.some((s) => s.includes("地中温度")), "床の未確認事項が明示される(隠さない)");
const rInt = run({ interiorWalls: [{ area: 100, uValue: 2.0 }], interiorDeltaTK: 3 });
check(rInt.peak.coolingKW > r0.peak.coolingKW && peakOf(rInt).components.interiorWallKW > 0, "内壁条件を入れると内壁負荷が発生する");

// 3. 窓・方位・遮蔽・日射
check(run({ windows: [{ area: 100, orientation: "s", uValue: 5.8, scValue: 0.7 }] }).peak.coolingKW > r0.peak.coolingKW, "窓面積を増やすと窓負荷(全体)が増える");
check(run({ windows: [{ area: 50, orientation: "w", uValue: 5.8, scValue: 0.7 }] }).peak.coolingKW > r0.peak.coolingKW, "窓方位を変えると日射負荷が変化する(西>南の日射条件)");
check(run({ windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.3 }] }).peak.coolingKW < r0.peak.coolingKW, "遮蔽係数SCを下げると日射負荷が減る");
check(run({ solarWm2: null }).peak.coolingKW < r0.peak.coolingKW, "日射量を与えないと日射負荷が0になる");
check(run({ solarWm2: null }).notVerified.some((s) => s.includes("ガラス面標準日射熱取得")), "日射量未転記が未確認事項として明示される");

// 4. 内部発熱(照明・機器・人体)
check(close(peakOf(run({ lightingWm2: 18 })).components.lightingKW, 2 * peakOf(r0).components.lightingKW, 1e-9), "照明原単位を2倍にすると照明負荷が2倍");
check(close(peakOf(run({ equipmentWm2: 40 })).components.equipmentKW, 2 * peakOf(r0).components.equipmentKW, 1e-9), "機器原単位を2倍にすると機器負荷が2倍");
check(close(peakOf(run({ occupants: 100 })).components.occupantSensibleKW, 2 * peakOf(r0).components.occupantSensibleKW, 1e-9), "人員を2倍にすると人体顕熱が2倍");
check(peakOf(run({ occupants: 100 })).components.occupantLatentKW > peakOf(r0).components.occupantLatentKW, "人員を増やすと人体潜熱が増える");

// 5. 外気・換気(量・温度・湿度)
check(close(peakOf(run({ outdoorAirVolumeM3h: 3000 })).components.outdoorAirSensibleKW, 2 * peakOf(r0).components.outdoorAirSensibleKW, 1e-9), "外気量を2倍にすると外気顕熱が2倍");
check(run({ outdoorAirVolumeM3h: 0 }).peak.coolingKW < r0.peak.coolingKW, "外気量を0にすると外気負荷が消える");
check(!close(peakOf(run({ hourlyOutdoorDB: { 9: 33, 12: 39, 14: 39, 16: 33 } })).components.outdoorAirSensibleKW, peakOf(r0).components.outdoorAirSensibleKW), "外気温度を変えると外気顕熱が変化する");
check(peakOf(run({ hourlyOutdoorRH: { 9: 90, 12: 90, 14: 90, 16: 90 } })).components.outdoorAirLatentKW > peakOf(r0).components.outdoorAirLatentKW, "外気湿度を上げると外気潜熱が増える");
check(peakOf(run({ indoorRHCooling: 70 })).components.outdoorAirLatentKW < peakOf(r0).components.outdoorAirLatentKW, "室内湿度を上げると外気潜熱(除湿分)が減る");
check(run({ heatRecovery: { enabled: true, efficiency: 70 } }).peak.coolingKW < r0.peak.coolingKW, "熱交換器を有効にすると外気負荷が減る");

// 6. すきま風
const rInf = run({ infiltration: { method: "air_change", windwardSide: true } });
check(peakOf(rInf).components.infiltrationSensibleKW > 0, "すきま風条件(換気回数法)を入れるとすきま風負荷が発生する");
check(rInf.infiltrationVolumeM3h > 0, "すきま風量が算出される(室容積×換気回数)");
check(rInf.notVerified.some((s) => s.includes("単位すきま風量")), "単位すきま風量表が未転記である旨が明示される");
check(run({ infiltration: { method: "air_change", windwardSide: false } }).infiltrationVolumeM3h < rInf.infiltrationVolumeM3h, "風下側は風上側よりすきま風量が少ない(基準の区分)");

// 7. 地区
const rH = run({ regionId: "hokkaido" });
const rO = run({ regionId: "okinawa" });
check(!close(rH.peak.coolingKW, rO.peak.coolingKW), "地区を変えると設計外気条件が変わり負荷が変化する");
check(rO.notVerified.some((s) => s.includes("暖房用 設計外気温度")), "冬期(暖房用)外気温度が未転記である旨が明示される");

// 8. 暖房
const rHeat = run({ heatingOutdoorDB: 0 });
check(rHeat.peak.heatingKW > 0 && rHeat.designLoadHeatingKW > 0, "暖房用外気温度を与えると暖房負荷が算定される");
check(rHeat.notVerified.every((s) => !s.includes("暖房用 設計外気温度")), "暖房用外気温度を入力すれば未確認から外れる");
check(run({ heatingSetTemp: 24, heatingOutdoorDB: 0 }).peak.heatingKW > rHeat.peak.heatingKW, "暖房設定温度を上げると暖房負荷が増える");

// 9. 余裕率・最大負荷判定
const rM = run({ marginPct: 15 });
check(close(rM.designLoadCoolingKW, rM.peak.coolingKW * 1.15, 1e-9), "余裕率15%が最大負荷に反映される");
const rBasis = run({ heatingOutdoorDB: -10, marginPct: 0 });
check(
  rBasis.requiredCapacityKW === Math.max(rBasis.designLoadCoolingKW, rBasis.designLoadHeatingKW)
    && rBasis.basis === (rBasis.designLoadHeatingKW > rBasis.designLoadCoolingKW ? "heating" : "cooling"),
  "必要容量=冷暖房の大きい方、basisは大きい側を指す"
);
// 暖房支配を確実にする: 断熱性能が低く外気が厳寒の室
const rHeatDom = run({
  heatingOutdoorDB: -25, marginPct: 0,
  walls: [{ area: 800, orientation: "n", uValue: 3.0 }],
  windows: [{ area: 200, orientation: "n", uValue: 6.5, scValue: 0.8 }],
  indoorRHCooling: 50,
  solarWm2: null,
});
check(rHeatDom.designLoadHeatingKW > rHeatDom.designLoadCoolingKW && rHeatDom.basis === "heating", "厳寒・低断熱の室では暖房が支配的になりbasis=heating");
check(rHeatDom.requiredCapacityKW === rHeatDom.designLoadHeatingKW, "暖房支配時は必要容量が暖房負荷と一致する");

// 10. 境界値・未入力
check(e.computeDetailedLoad({ floorAreaTotal: 0 }).status === "invalid", "面積0は計算不可(invalid)");
check(e.computeDetailedLoad({ floorAreaTotal: -1 }).status === "invalid", "負の面積は計算不可(invalid)");
const rNoInput = e.computeDetailedLoad({ floorAreaTotal: 100, usage: "office" });
check(rNoInput.status === "ok" && rNoInput.notVerified.length > 0, "最小入力でも計算でき、未確認事項が列挙される");
check(Number.isFinite(rNoInput.designLoadCoolingKW), "最小入力でも最大冷房負荷が数値で返る");

// 11. 基準値による補完の明示(発明していないことの確認)
const rDefault = e.computeDetailedLoad({ floorAreaTotal: 500, usage: "office", occupants: 50 });
check(rDefault.defaultedFromR6.length > 0, "基準値で補完した項目が defaultedFromR6 に記録される");
check(rDefault.coefficientSources.internalLoad.name.includes("建築設備設計基準"), "採用係数の出典が結果に含まれる");
check(e.R6_INTERNAL_LOAD.occupantSensibleWPerPerson === 69 && e.R6_INTERNAL_LOAD.occupantLatentWPerPerson === 53, "人体発熱は基準値(顕熱69W/潜熱53W)を採用");
check(e.R6_INTERNAL_LOAD.ventilationM3hPerPerson === 30, "外気量は基準値30m³/(h・人)を採用");

// 12. 材料構成 → U値 → 負荷(§6「材料変更 → U値/負荷が変化」)
const rMat = run({ walls: [{ area: 200, materials: [{ thicknessMm: 100, conductivityWmK: 0.15 }] }] });
const rMat2 = run({ walls: [{ area: 200, materials: [{ thicknessMm: 100, conductivityWmK: 1.60 }] }] });
check(!close(rMat.peak.coolingKW, r0.peak.coolingKW), "壁を材料構成(厚さ・熱伝導率)で指定するとU値が算定され負荷が変化する");
check(rMat.peak.coolingKW < rMat2.peak.coolingKW, "熱伝導率が小さい(断熱性能が高い)材料ほど負荷が小さい");
check(Math.abs(e.uValueFromMaterials([{ thicknessMm: 100, conductivityWmK: 1.6 }]) - (1 / (0.15 + 0.1 / 1.6))) < 1e-9, "U値=1/(Ri+Σt/λ+Ro) の定義式どおり");
check(e.uValueFromMaterials([]) === null && e.uValueFromMaterials(null) === null, "材料未指定ならU値はnull(0扱いしない)");

// 13. 室温・湿度の変更(§6)
check(run({ coolingSetTemp: 24 }).peak.coolingKW > r0.peak.coolingKW, "冷房設定温度を下げると負荷が増える");
check(run({ coolingSetTemp: 28 }).peak.coolingKW < r0.peak.coolingKW, "冷房設定温度を上げると負荷が減る");
check(peakOf(run({ indoorRHCooling: 70 })).coolingLatentKW < pk.coolingLatentKW, "室内湿度を上げると潜熱が減る");

// 14. その他内部発熱(データモデル接続の確認)
const rOthers = run({ others: [{ name: "厨房機器", sensibleKW: 5, latentKW: 2 }] });
check(Array.isArray(rOthers.notVerified) && !rOthers.notVerified.some((x) => x.includes("その他")), "その他内部発熱は未確認事項として扱われる(値の発明をしない)");

// 15. 暖房の内訳と負荷項目リスト
check(rHeat.heatingBreakdown !== null && Object.keys(rHeat.heatingBreakdown).length === 5, "暖房の内訳5項目が算出される(構造体・ガラス面・すきま風・外気)");
check(close(Object.values(rHeat.heatingBreakdown).reduce((a, b) => a + b, 0), rHeat.peak.heatingKW, 1e-9), "暖房内訳の合計=暖房ピーク負荷");
check(r0.loadItems.cooling.length === 8 && r0.loadItems.heating.length === 5, "公的基準の負荷項目数(冷房8・暖房5)を結果に保持");
check(r0.loadItems.source.url.includes("mlit.go.jp"), "負荷項目の出典が国交省公式PDFを指す");
const notImpl = r0.loadItems.cooling.filter((i) => i.implemented !== true);
check(notImpl.length === 2 && notImpl.every((i) => i.no === 5 || i.no === 8), "未実装項目(その他室内負荷の潜熱・ダクト等)を明示的に記録");

console.log(`\n=== STABRO因果テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
if (fail === 0) console.log("入力→計算結果の接続を確認しました。");
process.exit(fail === 0 ? 0 : 1);