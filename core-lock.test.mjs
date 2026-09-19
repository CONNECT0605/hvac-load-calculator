// ============================================================================
// LOAD CORE の固定(リグレッション防止)テスト
// 目的: 計算CORE(hvac-calc-engine.js の SHARED-LOGIC)の数値を凍結し、
//       意図しない変更を機械的に検出する。
//
// このファイルの期待値は、CORE確定時点の実測値をそのまま記録したものです。
// 「正しい値」の主張ではなく、「変更されていないこと」の検出が目的です。
// 値を更新する場合は、計算式・係数の変更根拠を必ずコミットメッセージに残し、
// ここに記録された変更前 → 変更後 を明示してください。
// ============================================================================
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createProjectDoc, createFloor, createRoom, computeProject } from "./project-model.mjs";

const require = createRequire(import.meta.url);
const engine = require("./hvac-calc-engine.js");

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, label) {
  if (cond) { pass += 1; } else { fail += 1; failures.push(label); }
}
function eq(actual, expected, label, digits = 6) {
  const a = Number(actual).toFixed(digits);
  const e = Number(expected).toFixed(digits);
  check(a === e, `${label}: 期待 ${e} / 実際 ${a}`);
}

const BUILDING_TYPE_IDS = engine.BUILDING_TYPES.map((b) => b.id);
const REGION_IDS = engine.REGIONS.map((r) => r.id);

// --- 1) CORE ロック用の基準値(CORE確定時の実測値) -------------------------
// 単位負荷 100m²・30人・26/22℃・余裕0%・人体不算入
const UNIT_BASELINE = {
  "office/hokkaido": [12.9, 17.69, 17.69, 900],
  "office/tohoku": [14.62, 15.25, 15.25, 900],
  "office/kanto": [17.2, 12.2, 17.2, 900],
  "office/okinawa": [22.36, 4.27, 22.36, 900],
  "restaurant/kanto": [24.4, 17.4, 24.4, 900],
  "school/kanto": [10.5, 9.3, 10.5, 600],
  "residential/kyushu": [8.91, 5.25, 8.91, 600],
};
for (const [key, [cool, heat, req, vent]] of Object.entries(UNIT_BASELINE)) {
  const [bt, rg] = key.split("/");
  const r = engine.computeLoad({
    buildingTypeId: bt, regionId: rg, floorAreaTotal: 100, floors: 1,
    occupants: 30, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false,
  });
  check(r.status === "ok", `unit/${key} 計算成功`);
  eq(r.designLoadCoolingKW, cool, `unit/${key} 冷房`);
  eq(r.designLoadHeatingKW, heat, `unit/${key} 暖房`);
  eq(r.requiredCapacityKW, req, `unit/${key} 必要容量`);
  eq(r.ventilationM3h, vent, `unit/${key} 換気量`, 3);
}

// --- 2) 全用途×全地域が決定論的であること -------------------------------
let allOk = true;
for (const bt of BUILDING_TYPE_IDS) {
  for (const rg of REGION_IDS) {
    const input = {
      buildingTypeId: bt, regionId: rg, floorAreaTotal: 100, floors: 1,
      occupants: 30, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false,
    };
    const a = engine.computeAll(input);
    const b = engine.computeAll(input);
    if (JSON.stringify(a) !== JSON.stringify(b)) allOk = false;
  }
}
check(allOk, "全用途×全地域(8×8)が決定論的(同一入力→同一結果)");

// --- 3) 条件分岐の凍結 ------------------------------------------------
const c1 = engine.computeLoad({ buildingTypeId: "restaurant", regionId: "kanto", floorAreaTotal: 200, floors: 2, occupants: 40, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
const c1m = engine.computeLoad({ buildingTypeId: "restaurant", regionId: "kanto", floorAreaTotal: 200, floors: 2, occupants: 40, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 15, includeOccupantLoad: false });
eq(c1m.designLoadCoolingKW, c1.designLoadCoolingKW * 1.15, "余裕率15%は冷房負荷に比例(×1.15)");

const c1occ = engine.computeLoad({ buildingTypeId: "restaurant", regionId: "kanto", floorAreaTotal: 200, floors: 2, occupants: 40, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: true });
eq(c1occ.designLoadCoolingKW, c1.designLoadCoolingKW + (40 * 60 + 40 * 50) / 1000, "人体加算ONで冷房に顕熱+潜熱(60/50W)が加算される");
eq(c1occ.designLoadHeatingKW, c1.designLoadHeatingKW, "人体加算ONでも暖房負荷は変化しない");

const warm = engine.computeLoad({ buildingTypeId: "office", regionId: "kanto", floorAreaTotal: 100, floors: 1, occupants: 10, coolingSetTemp: 28, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
const cool = engine.computeLoad({ buildingTypeId: "office", regionId: "kanto", floorAreaTotal: 100, floors: 1, occupants: 10, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
check(warm.designLoadCoolingKW < cool.designLoadCoolingKW, "冷房設定温度を上げると冷房負荷が減る(単調性)");

const f1 = engine.computeLoad({ buildingTypeId: "office", regionId: "kanto", floorAreaTotal: 100, floors: 1, occupants: 10, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
const f5 = engine.computeLoad({ buildingTypeId: "office", regionId: "kanto", floorAreaTotal: 100, floors: 5, occupants: 10, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
eq(f5.designLoadCoolingKW, f1.designLoadCoolingKW, "階数は負荷計算に影響しない(面積のみ)");

// --- 4) 案件集計(複数室・複数階)の凍結 -------------------------------
function goldenProject() {
  const proj = createProjectDoc({
    projectName: "GOLDEN", buildingTypeId: "office", regionId: "kanto", floorAreaTotal: 600,
    floors: [createFloor({ name: "1F", level: 1 }), createFloor({ name: "2F", level: 2 })],
  });
  proj.rooms = [
    createRoom({ floorId: proj.floors[0].floorId, name: "1F-事務室", usage: "office", floorArea: 200, occupancy: 20 }),
    createRoom({ floorId: proj.floors[0].floorId, name: "1F-会議室", usage: "office", floorArea: 100, occupancy: 30 }),
    createRoom({ floorId: proj.floors[1].floorId, name: "2F-店舗", usage: "retail", floorArea: 300, occupancy: 60 }),
  ];
  return computeProject(proj, { computeLoad: engine.computeLoad, selectEquipment: engine.selectEquipment });
}
const g1 = goldenProject();
eq(g1.totals.floorArea, 600, "案件集計: 室面積合計");
eq(g1.totals.designLoadCoolingKW, g1.rooms.reduce((a, r) => a + r.loadResult.designLoadCoolingKW, 0), "案件集計: 冷房は室の単純合算");
eq(g1.totals.designLoadHeatingKW, g1.rooms.reduce((a, r) => a + r.loadResult.designLoadHeatingKW, 0), "案件集計: 暖房は室の単純合算");
eq(g1.totals.requiredCapacityKW, Math.max(g1.totals.designLoadCoolingKW, g1.totals.designLoadHeatingKW), "案件集計: 必要容量は冷房/暖房の大きい方");

// --- 5) 機器選定の凍結 ------------------------------------------------
const sel = engine.selectEquipment({ status: "ok", requiredCapacityKW: 34.4, floors: 1, basis: "cooling" });
check(sel.status === "ok", "機器選定が成功する");
check(sel.recommended.installedKW >= 34.4, "推奨機器の設置容量は必要容量以上");
eq(sel.recommended.surplusPct, ((sel.recommended.installedKW - 34.4) / 34.4) * 100, "余裕率の定義");
check(["formal", "provisional"].includes(sel.recommended.selectionType), "選定区分がformal/provisionalのいずれか");

// --- 6) CORE全体のハッシュ(意図しない変更の検出) ----------------------
const rows = [];
for (const bt of BUILDING_TYPE_IDS) {
  for (const rg of REGION_IDS) {
    const r = engine.computeLoad({ buildingTypeId: bt, regionId: rg, floorAreaTotal: 100, floors: 1, occupants: 30, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false });
    rows.push(`${bt}/${rg}|${r.designLoadCoolingKW.toFixed(6)}|${r.designLoadHeatingKW.toFixed(6)}|${r.requiredCapacityKW.toFixed(6)}|${r.ventilationM3h.toFixed(6)}`);
  }
}
const hash = createHash("sha256").update(rows.join("\n")).digest("hex");
const EXPECTED_HASH = process.env.UPDATE_CORE_LOCK ? hash : "827a1d30c7f576b84087492f86d45bb0cfcbaf8d5329591a73c42a60cd869384";
check(hash === EXPECTED_HASH, `COREハッシュが一致する(8用途×8地域=64ケース)\n    期待 ${EXPECTED_HASH}\n    実際 ${hash}`);

// --- R6詳細方式(積み上げ)の固定 ---------------------------------------
// 既存のSHARED-LOGICとは別に、新設した computeDetailedLoad の数値も凍結する。
const detailedCase = {
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
  heatingOutdoorDB: 0,
};
const d = engine.computeDetailedLoad(detailedCase);
const detailedRows = [];
function collect(obj, path) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") detailedRows.push(`${path}.${k}=${v.toFixed(6)}`);
    else if (v && typeof v === "object" && !Array.isArray(v)) collect(v, `${path}.${k}`);
  }
}
collect(d, "detailed");
const detailedHash = createHash("sha256").update(detailedRows.join("\n")).digest("hex");
const EXPECTED_DETAILED_HASH = process.env.UPDATE_CORE_LOCK
  ? detailedHash
  : "c1a8aa169aa4d567b961c6f0e8f624e5d97f91ad28ee7fbff3fb1bfe72355fba";

check(detailedRows.length >= 28, `R6詳細方式の出力に十分な数値がある(実際 ${detailedRows.length}項目)`);
check(d.heatingBreakdown !== null, "R6詳細方式: 暖房の内訳も算出される");
check(d.loadItems.cooling.length === 8 && d.loadItems.heating.length === 5, "R6詳細方式: 公的基準の負荷項目数(冷房8・暖房5)を保持");
check(detailedHash === EXPECTED_DETAILED_HASH, `R6詳細方式のハッシュが一致する\n    期待 ${EXPECTED_DETAILED_HASH}\n    実際 ${detailedHash}`);
check(d.peak.coolingHour === 14, "R6詳細方式: 最大冷房負荷時刻が凍結されている(14時=日射ピーク)");
check(Math.abs(d.designLoadCoolingKW - d.peak.coolingKW) < 1e-9, "R6詳細方式: 余裕率0のとき設計用=ピーク");
check(Math.abs(d.hourlyResults.reduce((a, h) => a + h.coolingSensibleKW + h.coolingLatentKW - h.coolingTotalKW, 0)) < 1e-9, "R6詳細方式: 全時刻で顕熱+潜熱=全熱");

// --- 結果出力 ---------------------------------------------------------
console.log("=== LOAD CORE ロック(リグレッション防止) ===");
if (fail > 0) {
  console.log("失敗した検査:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log(`\n結果: ${pass}件成功 / ${fail}件失敗`);
if (fail > 0) {
  console.log("\n⚠ COREの数値が変化しています。計算式・係数を変更した場合は、");
  console.log("  変更根拠と 変更前 → 変更後 を明示したうえで EXPECTED_HASH を更新してください。");
  process.exit(1);
}
console.log("LOAD CORE は固定されています(数値の変化なし)。");