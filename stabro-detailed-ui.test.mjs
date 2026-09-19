// stabro-detailed-ui.test.mjs
// R6詳細方式の建物集計・帳票接続の検証。
// 目的: 「詳細方式の計算 → 建物集計 → 帳票 → CSV」が接続されていることを機械的に確認する。
// ここで検証するのは接続と整形であり、新しい係数・計算式の正当性は主張しない。
import { createRequire } from "node:module";
import { createProjectDoc, createFloor, createRoom } from "./project-model.mjs";
import { computeDetailedProject, toReportLoadResult, aggregateDetailedProject, buildEquipmentSchedule } from "./detailed-building.mjs";
import { buildDetailedReport } from "./detailed-report.mjs";
import { buildDetailedCsv } from "./export-csv.mjs";

const require = createRequire(import.meta.url);
const engine = require("./hvac-calc-engine.js");

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const f1 = createFloor({ name: "1F", level: 1 });
const f2 = createFloor({ name: "2F", level: 2 });
const project = createProjectDoc({
  projectName: "詳細接続テスト", regionId: "kanto", buildingTypeId: "office", marginPct: 0,
  floors: [f1, f2],
  rooms: [
    createRoom({ floorId: f1.floorId, name: "A", usage: "office", floorArea: 100, occupancy: 10, systemId: "系統1" }),
    createRoom({ floorId: f1.floorId, name: "B", usage: "office", floorArea: 100, occupancy: 10, systemId: "系統1" }),
    createRoom({ floorId: f2.floorId, name: "C", usage: "office", floorArea: 100, occupancy: 10, systemId: "系統2" }),
  ],
});

console.log("=== R6詳細方式 建物集計・帳票接続テスト ===");

const detailed = computeDetailedProject(project);
check(detailed.validRoomCount === 3, "詳細方式で3室すべてが計算可能");
check(detailed.hourly.length === engine.DETAILED_HOURS.length, "時刻別結果が時刻数だけある");

// 合算方式: 同一時刻の室別負荷を加算し、その最大値を採用する
const manualHourSum = engine.DETAILED_HOURS.map((hour, i) => {
  const sum = project.rooms.reduce((acc, room) => {
    const input = engine.roomToDetailedLoadInput(project, room);
    const l = engine.computeDetailedLoad(input);
    const h = l.hourlyResults.find((x) => x.hour === hour);
    return acc + h.coolingTotalKW;
  }, 0);
  return { hour, sum, reported: detailed.hourly[i].coolingTotalKW };
});
check(manualHourSum.every((r) => close(r.sum, r.reported)), "各時刻の建物負荷 = 室別負荷の同時刻合算");
const manualPeak = Math.max(...manualHourSum.map((r) => r.sum));
check(close(detailed.peak.coolingKW, manualPeak), "建物の最大冷房負荷 = 同時刻合算の最大値");
check(close(detailed.designLoadCoolingKW, manualPeak * 1.0), "余裕率0のとき設計用=最大負荷");
check(detailed.designLoadHeatingKW === null, "暖房設計外気温度が未確認のため暖房は未算定(null)");
check(detailed.requiredCapacityKW === detailed.designLoadCoolingKW, "暖房未算定時は冷房を選定基準とする");

// ビル全体の必要換気量は室別換気量の合算
const manualVent = project.rooms.reduce((acc, room) => {
  const l = engine.computeDetailedLoad(engine.roomToDetailedLoadInput(project, room));
  return acc + l.ventilationM3h;
}, 0);
check(close(detailed.ventilationM3h, manualVent), "建物の必要換気量 = 室別換気量の合算");

// 集計(室→系統→階→建物)
const aggregate = aggregateDetailedProject(project, detailed);
check(aggregate.byRoom.length === 3, "室別集計が全室分ある");
check(aggregate.bySystem.length === 2, "系統別集計が系統数だけある");
check(aggregate.byFloor.length === 2, "階別集計が階数だけある");
check(aggregate.bySystem.find((s) => s.label === "系統1").roomCount === 2, "系統1に2室が集約される");
check(aggregate.bySystem.find((s) => s.label === "系統2").roomCount === 1, "系統2に1室が集約される");
const sysSum = aggregate.bySystem.reduce((a, s) => a + s.designLoadCoolingKW, 0);
check(close(sysSum, aggregate.building.designLoadCoolingKW), "系統別冷房負荷の合計 = 建物全体");
const floorSum = aggregate.byFloor.reduce((a, f) => a + f.designLoadCoolingKW, 0);
check(close(floorSum, aggregate.building.designLoadCoolingKW), "階別冷房負荷の合計 = 建物全体");
check(close(aggregate.building.designLoadCoolingKW, detailed.designLoadCoolingKW), "建物集計の冷房負荷 = 詳細方式の設計用負荷");

// 系統未設定は「系統未設定」として集約され、除外されない
const noSys = createProjectDoc({
  regionId: "kanto", buildingTypeId: "office",
  floors: [f1],
  rooms: [createRoom({ floorId: f1.floorId, name: "X", usage: "office", floorArea: 50, occupancy: 5 })],
});
const noSysAgg = aggregateDetailedProject(noSys, computeDetailedProject(noSys));
check(noSysAgg.bySystem.length === 1 && noSysAgg.bySystem[0].label === "系統未設定", "系統未設定の室も「系統未設定」として集計される");

// 帳票接続
const reportInput = toReportLoadResult(detailed);
const schedule = buildEquipmentSchedule(detailed, aggregate);
const report = buildDetailedReport({
  project,
  loadResult: reportInput,
  aggregate,
  rooms: project.rooms,
  floors: project.floors,
  regions: engine.REGIONS,
  buildingTypes: engine.BUILDING_TYPES,
  equipmentSchedule: schedule,
});
check(report.title === "熱負荷計算書(R6詳細方式)", "帳票タイトルがR6詳細方式");
check(report.coolingItems.length === 8, "帳票の冷房負荷項目が8項目");
check(report.heatingItems.length === 5, "帳票の暖房負荷項目が5項目");
check(report.hourly.length === engine.DETAILED_HOURS.length, "帳票の時刻別一覧が時刻数だけある");
check(report.aggregateSystems.length === 2, "帳票の系統集計が2系統");
check(report.aggregateFloors.length === 2, "帳票の階集計が2階");
check(report.aggregateRooms.length === 3, "帳票の室別集計が3室");
check(report.coefficientSources.length > 0, "帳票に係数の出典が記録される");
check(report.notVerified.length > 0, "帳票に未確認事項が明示される(値を創作しない)");
check(report.defaultedFromR6.length > 0, "帳票に基準値補完が記録される");

// チェックリスト出力(マトリクス§4-17)
check(Array.isArray(report.checklist) && report.checklist.length > 0, "チェックリストが出力される");
check(report.checklist.every((row) => row.length === 4), "チェックリストの各行が4列(区分・項目・状態・補足)");
check(report.checklist.some((row) => row[1].includes("負荷項目 1.")), "チェックリストに負荷項目が列挙される");
check(report.checklist.some((row) => row[2] === "未実装"), "未実装項目がチェックリストで未実装と明示される");
check(report.checklist.some((row) => row[2] === "要確認"), "未確認事項がチェックリストで要確認と明示される");
check(report.checklist.some((row) => row[1] === "推測値・ダミー値の混入" && row[2] === "0件"), "推測値・ダミー値0件が明示される");
check(report.checklist.some((row) => row[1] === "室 → 系統 → 階 → 建物" && row[2] === "実装済"), "集計の実装状態が明示される");
check(report.checklist.some((row) => row[1] === "SI単位(kW・m²・m³/h・℃・%)" && row[2] === "実装済"), "SI単位の実装状態が明示される");

// CSV接続(マトリクス§4-18)
const csv = buildDetailedCsv(report);
check(csv.startsWith("\ufeff"), "詳細方式CSVがBOM付きUTF-8");
check((csv.match(/\r\n/g) || []).length > 10, "詳細方式CSVに複数行ある");
check(csv.includes("系統集計"), "詳細方式CSVに系統集計が含まれる");
check(csv.includes("チェックリスト"), "詳細方式CSVにチェックリストが含まれる");
check(csv.includes("係数の出典"), "詳細方式CSVに係数の出典が含まれる");
check(csv.includes("未確認"), "詳細方式CSVに未確認事項が含まれる");
// 「BTU/tonnageは未使用」という宣言文は除き、実際に値の単位として使われていないことを確認する。
const csvLines = csv.split("\r\n").filter((line) => !line.includes("は未使用"));
check(!csvLines.some((line) => /\d+\s*(BTU|tonnage)/i.test(line)), "詳細方式CSVでヤード・ポンド単位が値として使われない");
check(csv.includes("建築設備設計基準"), "詳細方式CSVに基準の出典が含まれる");

// 計算不能室は集計に混入しない(status!=="ok"を0扱いしない)
const withInvalid = createProjectDoc({
  regionId: "kanto", buildingTypeId: "office",
  floors: [f1],
  rooms: [
    createRoom({ floorId: f1.floorId, name: "有効", usage: "office", floorArea: 100, occupancy: 10 }),
    createRoom({ floorId: f1.floorId, name: "面積未入力", usage: "office", floorArea: null, occupancy: 0 }),
  ],
});
const invDetailed = computeDetailedProject(withInvalid);
const invAgg = aggregateDetailedProject(withInvalid, invDetailed);
check(invDetailed.validRoomCount === 1, "面積未入力の室は計算不能として除外される");
check(invAgg.byRoom.length === 2, "室別集計には計算不能室も状態付きで残る");
check(invAgg.bySystem.every((s) => s.validRoomCount === 1), "系統集計には計算不能室の負荷が混入しない");

// ============================================================================
// 機器選定・機器表の接続(既存 selectEquipment()/EQUIPMENT_DB をそのまま使う)
// ここでは「新しい選定ロジックを足していないこと」と「既存の選定と一致すること」を確認する。
// ============================================================================
const expectedSelection = engine.selectEquipment({
  status: "ok",
  requiredCapacityKW: detailed.requiredCapacityKW,
  floors: project.floors.length,
  basis: detailed.basis,
});
check(detailed.equipmentSelection.status === "ok", "詳細方式の必要能力が既存selectEquipmentへ渡り選定できる");
check(detailed.equipmentSelection.recommended.size === expectedSelection.recommended.size, "詳細方式の選定クラス = 既存selectEquipmentの選定クラス(同一必要能力)");
check(detailed.equipmentSelection.recommended.count === expectedSelection.recommended.count, "詳細方式の選定台数 = 既存selectEquipmentの選定台数(同一必要能力)");
check(close(detailed.equipmentSelection.recommended.installedKW, expectedSelection.recommended.installedKW), "設置合計容量が既存選定と一致する");
check(detailed.equipmentSelection.selectionReasonText === expectedSelection.selectionReasonText, "選定理由文が既存selectEquipmentの出力そのまま");

check(schedule.status === "ok", "機器表が生成される");
check(schedule.recommended.scope === "建物全体", "機器表の建物全体行がある");
check(close(schedule.recommended.requiredCapacityKW, detailed.requiredCapacityKW), "機器表の必要能力 = 詳細方式の必要能力");
check(schedule.recommended.count === Math.max(1, Math.ceil(detailed.requiredCapacityKW / schedule.recommended.size)), "機器表の台数 = 必要能力÷容量クラスの切り上げ(既存ロジック)");
check(schedule.systemRows.length === aggregate.bySystem.filter((s) => s.validRoomCount > 0).length, "系統別の機器表が計算可能な系統数だけある");
check(schedule.systemRows.every((s) => s.size === null || engine.PACKAGE_SIZES.some((p) => p.kw === s.size)), "系統別の推奨クラスは既存PACKAGE_SIZESの値のみ");
check(schedule.recommended.selectionType === "formal", "既存EQUIPMENT_DBに実在型式があるクラスはformalと明示される");
check(schedule.modelRows.length === engine.EQUIPMENT_DB[schedule.recommended.size].length, "実在型式候補がEQUIPMENT_DBの件数と一致する");
check(schedule.modelRows.every((m) => m.maker && m.model), "実在型式候補にメーカー・型式が入る(創作していない)");

// 帳票・CSVへの機器表の接続
check(report.equipment.status === "ok", "帳票に機器選定セクションが入る");
check(report.equipment.summary.some(([k]) => k === "推奨容量クラス"), "帳票の機器選定に推奨容量クラスがある");
check(report.equipment.systemRows.length === schedule.systemRows.length, "帳票の系統別機器表が機器表と一致する");
check(report.equipment.modelRows.length === schedule.modelRows.length, "帳票の実在型式候補が機器表と一致する");
check(report.checklist.some((row) => row[1] === "必要能力 → 機器選定 → 機器表" && row[2] === "実装済"), "チェックリストで機器選定→機器表が実装済と明示される");

const csvWithEquipment = buildDetailedCsv(report);
check(csvWithEquipment.includes("機器選定"), "機器表CSVに機器選定が含まれる");
check(csvWithEquipment.includes("機器表(系統別)"), "機器表CSVに系統別の機器表が含まれる");
check(csvWithEquipment.includes("機器表(実在型式)"), "機器表CSVに実在型式候補が含まれる");
check(csvWithEquipment.includes(expectedSelection.recommended.code), "機器表CSVに選定クラスの号機が含まれる");

// 必要能力が算出できない場合は機器表を作らず、理由を返す(空欄にしない)
const noLoad = buildEquipmentSchedule({ equipmentSelection: { status: "invalid", reason: "テスト理由" } }, { bySystem: [] });
check(noLoad.status === "invalid" && noLoad.reason === "テスト理由", "必要能力が無い場合は機器表を作らず理由を返す");
const noLoadReport = buildDetailedReport({
  project, loadResult: reportInput, aggregate, rooms: project.rooms, floors: project.floors,
  regions: engine.REGIONS, buildingTypes: engine.BUILDING_TYPES, equipmentSchedule: noLoad,
});
check(noLoadReport.equipment.status === "invalid" && noLoadReport.equipment.reason === "テスト理由", "機器表が無い帳票は理由を明示する");
check(noLoadReport.checklist.some((row) => row[1] === "必要能力 → 機器選定 → 機器表" && row[2] === "未実装"), "選定できない場合はチェックリストで未実装と明示される");

console.log(`\n=== 詳細方式 建物集計・帳票接続テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
if (fail > 0) process.exit(1);
