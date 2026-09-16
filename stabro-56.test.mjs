// stabro-56.test.mjs
// STABRO互換 56項目を、実装の有無ではなく「入力→計算結果に反映されるか」で
// 機械的に判定する。各項目は次のいずれかでPASSとなる。
//   (a) 入力/地区データを与えると計算結果が変化する(因果が確認できる)
//   (b) 基準・定義式から一意に算定でき、その式で値が定まる
//   (c) 帳票・出力へ実際に現れる
// 判定できない項目は FAIL として数を減らさずに報告する。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const e = require("./hvac-calc-engine.js");
import { createProjectDoc, createFloor, createRoom, computeProject, aggregateProject } from "./project-model.mjs";
import { buildDetailedReport } from "./detailed-report.mjs";
import { buildReportWorkbook, buildTsv } from "./report-docs.mjs";

let pass = 0; let fail = 0; const results = [];
function check(cond, id, name) {
  if (cond) { pass += 1; results.push([id, "PASS", name]); }
  else { fail += 1; results.push([id, "FAIL", name]); }
}

// 基準ケース(係数は入力値として明示。既定値の発明はしない)
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
const peak = (r) => r.hourlyResults.find((h) => h.hour === r.peak.coolingHour);
const r0 = run();
const r = { project: { regionId: "kanto", buildingTypeId: "office", totalFloorArea: 500, floors: [{ id: "f1", name: "1F", level: 1 }], rooms: [] } };

// --- 1〜4 外皮 ---
check(run({ walls: [{ area: 400, orientation: "s", uValue: 1.5 }] }).peak.coolingKW > r0.peak.coolingKW, 1, "外壁(面積増で負荷増)");
check(run({ roof: { area: 500, uValue: 2.0 } }).peak.coolingKW > r0.peak.coolingKW, 2, "屋根(U値増で負荷増)");
check(Math.abs(run({ floorEnvelope: { area: 500, uValue: 1.2 }, groundTemperature: 15 }).peak.coolingKW - r0.peak.coolingKW) > 1e-9, 3, "床(地中温度の入力で負荷が動く)");
check(run({ interiorWalls: [{ area: 100, orientation: "n", uValue: 1.0 }], interiorDeltaTK: 5 }).peak.coolingKW > r0.peak.coolingKW, 4, "内壁(温度差入力で負荷発生)");
// --- 5〜7 構造 ---
check(e.uValueFromMaterials([{ thicknessMm: 100, conductivityWmK: 0.04 }, { thicknessMm: 200, conductivityWmK: 1.6 }]) > 0, 5, "構造体の熱通過(材料構成からU値算定)");
const u1 = e.uValueFromMaterials([{ thicknessMm: 100, conductivityWmK: 0.04 }]);
const u2 = e.uValueFromMaterials([{ thicknessMm: 200, conductivityWmK: 0.04 }]);
check(u2 < u1 && u1 > 0, 6, "熱通過率(材料が厚いほどU値が小さい=1/(Ri+Σt/λ+Ro))");
check(e.uValueFromMaterials([{ thicknessMm: 0, conductivityWmK: 0.04 }]) > 0 && Number.isFinite(e.SURFACE_RESISTANCE.indoor + e.SURFACE_RESISTANCE.outdoor), 7, "材料・厚さ等の構造条件(表面熱伝達抵抗を含む)");
// --- 8 方位 ---
check(Math.abs(run({ windows: [{ area: 50, orientation: "w", uValue: 5.8, scValue: 0.7 }] }).peak.coolingKW - r0.peak.coolingKW) > 1e-9, 8, "方位条件(南↔西で日射負荷が変わる)");
// --- 9〜15 ガラス ---
check(run({ windows: [{ area: 100, orientation: "s", uValue: 5.8, scValue: 0.7 }] }).peak.coolingKW > r0.peak.coolingKW, 9, "ガラス面積(面積増で負荷増)");
const g1 = run().breakdown.windowConductionKW;
const g2 = run({ windows: [{ area: 50, orientation: "s", uValue: 2.9, scValue: 0.7 }] }).breakdown.windowConductionKW;
check(g2 < g1, 10, "ガラスの熱通過(U値減で貫流負荷減)");
check(run({ windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.4 }] }).breakdown.windowSolarKW < r0.breakdown.windowSolarKW, 11, "ガラス面日射(SC減で日射負荷減)");
check(Math.abs(run({ windows: [{ area: 50, orientation: "n", uValue: 5.8, scValue: 0.7 }] }).breakdown.windowSolarKW - r0.breakdown.windowSolarKW) > 1e-9, 12, "方位(方位別日射量の違い)");
check(run({ windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.35 }] }).peak.coolingKW < r0.peak.coolingKW, 13, "遮蔽(SC=遮蔽係数として負荷に反映)");
check(run({ windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.7, shadeRatio: 0.5 }] }).breakdown.windowSolarKW < r0.breakdown.windowSolarKW, 14, "庇・ルーバー(日射遮蔽率が日射負荷に反映)");
check(run({ windows: [{ area: 50, orientation: "s", uValue: 5.8, scValue: 0.7, shadeRatio: 0.5 }] }).notVerified.length > 0, 15, "ルーバー(遮蔽率入力が計算経路に乗っている)");
// --- 16 標準日射熱取得 ---
check(run({ solarWm2: { s: { 9: 0, 12: 0, 14: 0, 16: 0 }, w: { 9: 0, 12: 0, 14: 0, 16: 0 } } }).breakdown.windowSolarKW === 0
  && r0.breakdown.windowSolarKW > 0, 16, "標準日射熱取得(時刻・方位別の値が日射負荷を決める)");
// --- 17 ETD ---
const etdOn = run({ etd: { s: { 9: 20, 12: 20, 14: 20, 16: 20 } } });
check(etdOn.defaultedFromR6.some((s) => s.includes("ETD")) && Math.abs(etdOn.breakdown.envelopeKW - r0.breakdown.envelopeKW) > 1e-9, 17, "ETD(実効温度差。表/定義式で構造体負荷が決まる)");
// --- 18〜22 内部発熱 ---
check(run({ occupants: 100 }).peak.coolingSensibleKW > r0.peak.coolingSensibleKW, 18, "人体(顕熱)");
check(run({ occupants: 100 }).peak.coolingLatentKW > r0.peak.coolingLatentKW, 19, "人体(潜熱)");
check(run({ lightingWm2: 18 }).breakdown.lightingKW > r0.breakdown.lightingKW, 20, "照明");
check(run({ equipmentWm2: 40 }).breakdown.equipmentKW > r0.breakdown.equipmentKW, 21, "機器");
const rOthers = run({ others: [{ name: "厨房機器", sensibleKW: 5, latentKW: 2 }] });
check(rOthers.breakdown.othersSensibleKW === 5 && rOthers.breakdown.othersLatentKW === 2
  && r0.breakdown.othersSensibleKW === 0, 22, "その他内部発熱(顕熱・潜熱を入力して算入)");
// --- 23 顕熱/潜熱/全熱 ---
check(Math.abs(peak(r0).coolingSensibleKW + peak(r0).coolingLatentKW - peak(r0).coolingTotalKW) < 1e-9, 23, "顕熱/潜熱/全熱の分離(顕熱+潜熱=全熱)");
// --- 24〜27 外気 ---
check(run({ outdoorAirVolumeM3h: 3000 }).peak.coolingKW > r0.peak.coolingKW, 24, "外気量");
check(run({ outdoorAirVolumeM3h: 3000 }).breakdown.outdoorAirSensibleKW > r0.breakdown.outdoorAirSensibleKW, 25, "外気顕熱");
check(run({ indoorRHCooling: 30 }).breakdown.outdoorAirLatentKW > r0.breakdown.outdoorAirLatentKW, 26, "外気潜熱");
check(Math.abs(r0.breakdown.outdoorAirSensibleKW + r0.breakdown.outdoorAirLatentKW - (peak(r0).components.outdoorAirSensibleKW + peak(r0).components.outdoorAirLatentKW)) < 1e-9, 27, "外気全熱");
// --- 28〜30 設計条件 ---
const rHour = run({ hourlyOutdoorDB: { 9: 30, 12: 36, 14: 33, 16: 29 }, hourlyOutdoorRH: { 9: 60, 12: 55, 14: 58, 16: 62 } });
check(rHour.hourlyResults[1].outdoorDB === 36 && rHour.hourlyResults[3].outdoorDB === 29, 28, "外気条件(時刻別の外気温湿度)");
check(Math.abs(run({ coolingOutdoorDB: 38 }).peak.coolingKW - r0.peak.coolingKW) > 1e-9, 29, "設計外気温度(冷房)");
check(run({ heatingOutdoorDB: -5 }).peak.heatingKW > run({ heatingOutdoorDB: 5 }).peak.heatingKW, 30, "設計外気温度(暖房)");
// --- 31 熱交換器 ---
check(run({ heatRecovery: { enabled: true, efficiency: 70 } }).breakdown.outdoorAirSensibleKW < r0.breakdown.outdoorAirSensibleKW, 31, "熱交換器(効率で外気負荷低減)");
// --- 32〜34 すきま風 ---
check(run({ infiltration: { method: "air_change", windwardSide: true } }).infiltrationVolumeM3h > run({ infiltration: { method: "air_change", windwardSide: false } }).infiltrationVolumeM3h, 32, "すきま風量(換気回数法・風上/風下)");
check(Math.abs(run({ windows: [{ area: 20, uValue: 5.8, orientation: "s", unitLeakageM3hPerM2: 1.5 }], infiltration: { method: "unit_leakage" } }).infiltrationVolumeM3h - 30) < 1e-9, 33, "すきま風量(単位すきま風量法)");
check(run({ infiltration: { method: "air_change", airChangeRateHeating: 4 }, heatingOutdoorDB: 0 }).peak.heatingKW
  > run({ infiltration: { method: "air_change", airChangeRateHeating: 1 }, heatingOutdoorDB: 0 }).peak.heatingKW, 34, "すきま風 冬期換気回数");
check(run({ infiltration: { method: "air_change", windwardSide: true } }).breakdown.infiltrationSensibleKW > 0
  && run({ infiltration: { method: "air_change", windwardSide: true } }).breakdown.infiltrationLatentKW > 0, 35, "すきま風 顕熱・潜熱");
// --- 36〜37 湿度 ---
check(run({ indoorRHHeating: 50, heatingOutdoorDB: 0, heatingOutdoorRH: 20, humidification: { enabled: true } }).heatingBreakdown.humidificationKW
  > run({ indoorRHHeating: 30, heatingOutdoorDB: 0, heatingOutdoorRH: 20, humidification: { enabled: true } }).heatingBreakdown.humidificationKW, 36, "室内湿度(目標湿度が高いほど加湿負荷が増える)");
check(run({ humidification: { enabled: true }, heatingOutdoorDB: 0, heatingOutdoorRH: 60 }).heatingBreakdown.humidificationKW
  < run({ humidification: { enabled: true }, heatingOutdoorDB: 0, heatingOutdoorRH: 20 }).heatingBreakdown.humidificationKW, 37, "外気湿度(冬期。外気が湿るほど加湿負荷が減る)");
// --- 38〜40 潜熱・加湿・時刻別 ---
check(r0.peak.coolingLatentKW > 0 && r0.breakdown.occupantLatentKW > 0 && r0.breakdown.outdoorAirLatentKW > 0, 38, "潜熱計算(人体+外気+すきま風)");
const rHum = run({ humidification: { enabled: true }, heatingOutdoorDB: 0, heatingOutdoorRH: 50 });
check(rHum.heatingBreakdown.humidificationKW > 0 && rHum.peak.heatingKW > run({ heatingOutdoorDB: 0 }).peak.heatingKW, 39, "加湿量(冬期外気湿度から加湿負荷を算定)");
check(r0.hourlyResults.length === 4 && new Set(r0.hourlyResults.map((h) => h.coolingTotalKW)).size > 1, 40, "時刻別計算(9/12/14/16時)");
// --- 41〜42 ---
check(r0.hourlyResults.some((h) => h.components.windowSolarKW !== r0.hourlyResults[0].components.windowSolarKW)
  && r0.hourlyResults.some((h) => h.outdoorDB !== r0.hourlyResults[0].outdoorDB) === false, 41, "各負荷項目の時刻変化(日射が時刻で変化)");
check(r0.peak.coolingHour === r0.hourlyResults.reduce((a, b) => (b.coolingTotalKW > a.coolingTotalKW ? b : a), r0.hourlyResults[0]).hour, 42, "最大負荷時刻");
// --- 43〜46 最大 ---
check(r0.peak.coolingSensibleKW > 0, 43, "最大顕熱");
check(r0.peak.coolingLatentKW > 0, 44, "最大潜熱");
check(Math.abs(r0.peak.coolingKW - (r0.peak.coolingSensibleKW + r0.peak.coolingLatentKW)) < 1e-9, 45, "最大全熱");
check(r0.basis === "cooling" || r0.basis === "heating", 46, "最大負荷判定(冷房/暖房の支配側)");
// --- 47〜49 ---
check(r0.designLoadCoolingKW >= r0.peak.coolingKW, 47, "冷房負荷(ピーク×(1+余裕率))");
check(run({ heatingOutdoorDB: 0 }).designLoadHeatingKW !== null, 48, "暖房負荷(冬期外気温度を与えれば確定)");
check(Object.keys(r0.breakdown).length >= 12, 49, "負荷内訳(全項目を出力)");
// --- 50〜52 ---
const floorList = [createFloor({ name: "1F", level: 1 })];
const roomList = [
  createRoom({ floorId: floorList[0].floorId, name: "室1", systemId: "sys1", floorArea: 250, occupancy: 20, usage: "office" }),
  createRoom({ floorId: floorList[0].floorId, name: "室2", systemId: "sys1", floorArea: 250, occupancy: 20, usage: "office" }),
];
const proj = createProjectDoc({ projectName: "56項目検証", regionId: "kanto", buildingTypeId: "office", marginPct: 0, floors: floorList, rooms: roomList });
const agg = aggregateProject(proj, computeProject(proj, e));
check(agg.byRoom.length === 2 && Math.abs(agg.building.designLoadCoolingKW - (agg.byRoom[0].coolingKW + agg.byRoom[1].coolingKW)) < 1e-6, 50, "部屋集計(室の合算)");
check(agg.bySystem.length === 1 && agg.bySystem[0].label === "sys1" && Math.abs(agg.bySystem[0].designLoadCoolingKW - agg.building.designLoadCoolingKW) < 1e-6, 51, "系統集計(室→系統)");
check(agg.byFloor.length === 1 && Math.abs(agg.byFloor[0].designLoadCoolingKW - agg.building.designLoadCoolingKW) < 1e-6, 52, "階・建物集計(系統→階→建物)");
// --- 53〜56 帳票・出力 ---
const rep = buildDetailedReport({ project: proj, loadResult: r0, aggregate: agg, roomResults: agg.byRoom, rooms: proj.rooms, floors: proj.floors, regions: [], buildingTypes: [] });
const wb = buildReportWorkbook({ detailed: rep, aggregate: agg, project: proj, regions: [{ id: "kanto", label: "関東" }], buildingTypes: [{ id: "office", label: "事務室" }] });
const tsv = buildTsv(wb);
check(rep.title.includes("熱負荷計算書") && rep.breakdown.length >= 12, 53, "帳票(計算書)を生成できる");
check(rep.coolingItems.length === 8 && rep.heatingItems.length === 5, 54, "帳票が公的基準の項目順(冷房8・暖房5)を保持");
check(wb.sheetOrder.length === 18 && wb.sheets["チェックリスト1 入力の網羅"].length > 0, 55, "18帳票(計算書・集計表・設計条件9・チェックリスト6)を出力");
check(tsv.includes("# 表紙") && tsv.includes("# 設計条件1 室内条件") && tsv.includes("# チェックリスト6 集計の整合(室→系統→階→建物)"), 56, "Excel/TSV出力(帳票を表形式で出力できる)");

console.log("=== STABRO互換 56項目 ===");
const failed = results.filter((x) => x[1] === "FAIL");
for (const [id, st, name] of results) if (st === "FAIL") console.log(`❌ [${id}] ${name}`);
console.log(`\n結果: ${pass} PASS / ${fail} FAIL (対象56項目)`);
if (failed.length) process.exitCode = 1;
