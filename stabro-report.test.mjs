// stabro-report.test.mjs
// レポート出力テスト: R6詳細方式の熱負荷計算書が公的基準の項目・順序で出力されることを検証する。
import { createRequire } from "node:module";
import { computeProject, aggregateProject, createProjectDoc, createFloor, createRoom } from "./project-model.mjs";
import { buildDetailedReport } from "./detailed-report.mjs";

const require = createRequire(import.meta.url);
const engine = require("./hvac-calc-engine.js");

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}

const f1 = createFloor({ name: "1F", level: 1 });
const f2 = createFloor({ name: "2F", level: 2 });
const project = createProjectDoc({
  projectName: "レポートテスト", client: "テスト施主", siteAddress: "東京都",
  regionId: "kanto", buildingTypeId: "office", totalFloorArea: 300, marginPct: 10,
  floors: [f1, f2],
  rooms: [
    createRoom({ floorId: f1.floorId, name: "事務室A", usage: "office", floorArea: 200, occupancy: 20, systemId: "系統1" }),
    createRoom({ floorId: f1.floorId, name: "会議室B", usage: "school", floorArea: 60, occupancy: 8, systemId: "系統1" }),
    createRoom({ floorId: f2.floorId, name: "事務室C", usage: "office", floorArea: 150, occupancy: 15, systemId: "系統2" }),
  ],
});

const calc = computeProject(project, engine);
const aggregate = aggregateProject(project, calc);
const loadInput = engine.roomToDetailedLoadInput(project, project.rooms[0]);
const loadResult = engine.computeDetailedLoad({ ...loadInput, heatingOutdoorDB: 0 });
const report = buildDetailedReport({
  project, loadResult, aggregate, rooms: project.rooms, floors: project.floors,
  regions: engine.REGIONS, buildingTypes: engine.BUILDING_TYPES,
});

console.log("=== R6詳細方式 レポート出力テスト ===");

// 設計条件
check(report.title === "熱負荷計算書(R6詳細方式)", "帳票タイトルがR6詳細方式の熱負荷計算書");
check(report.conditions.some(([k]) => k === "設計地区"), "設計条件に設計地区がある");
check(report.conditions.some(([k]) => k === "設計外気温度(冷房)"), "設計条件に設計外気温度(冷房)がある");
check(report.conditions.some(([k]) => k === "冷房室内温度" && String(k)), "設計条件に冷房室内温度がある");
check(report.conditions.some(([k, v]) => k === "施主・顧客名" && v === "テスト施主"), "設計条件に施主名が反映される");

// 負荷詳細(公的基準の順序・個数)
check(report.coolingItems.length === 8, "冷房の負荷詳細が8項目(公的基準の個数)");
check(report.heatingItems.length === 5, "暖房の負荷詳細が5項目(公的基準の個数)");
check(report.coolingItems[0][1] === "構造体負荷(顕熱)", "負荷詳細の第1項が構造体負荷(公的基準の順序)");
check(report.coolingItems[1][1] === "ガラス面負荷(顕熱)", "負荷詳細の第2項がガラス面負荷");
check(report.coolingItems[3][1] === "人体負荷(潜熱及び顕熱)", "負荷詳細の第4項が人体負荷");
check(report.coolingItems[6][1] === "外気負荷(潜熱及び顕熱)", "負荷詳細の第7項が外気負荷");
check(report.coolingItems.every((row) => row[2] === "実装済" || row[2] === "一部実装" || row[2] === "未実装"), "各項目に実装状態が付く");
check(report.coolingItems[7][2] === "未実装", "未実装項目(ダクト等)は未実装と明示される");
check(report.coolingItems[3][3].includes("顕熱") && report.coolingItems[3][3].includes("潜熱"), "人体負荷は顕熱と潜熱に分けて出力される");

// 最大負荷一覧
check(report.maximums.length === 7, "最大負荷一覧が7項目");
check(report.maximums.some(([k]) => k === "冷房 最大顕熱"), "最大負荷一覧に最大顕熱がある");
check(report.maximums.some(([k]) => k === "冷房 最大潜熱"), "最大負荷一覧に最大潜熱がある");
check(report.maximums.some(([k]) => k === "冷房 最大全熱"), "最大負荷一覧に最大全熱がある");
check(report.maximums.every((row) => row.length === 3), "最大負荷一覧に時刻列がある");
check(report.maximums.some(([k, v, t]) => k === "冷房 最大全熱" && /時/.test(t)), "最大負荷時刻が出力される");

// 内訳
check(report.breakdown.length === 15, "負荷内訳が15行(12項目+顕熱/潜熱/全熱)");
check(report.breakdown.some(([k]) => k === "窓 日射負荷"), "内訳に日射負荷がある");
check(report.breakdown.some(([k]) => k === "すきま風負荷(潜熱)"), "内訳にすきま風潜熱がある");
check(report.heatingBreakdown.length === 6, "暖房内訳が6行(5項目+全熱合計)");
check(report.heatingBreakdown.every(([k]) => /^[^a-zA-Z]*$/.test(k)), "暖房内訳の見出しが日本語(英字キーを露出しない)");
check(report.heatingBreakdown.some(([k]) => k === "構造体負荷"), "暖房内訳に構造体負荷がある");
check(report.heatingBreakdown.some(([k]) => k === "暖房 全熱合計"), "暖房内訳に全熱合計がある");

// 時刻別
check(report.hourly.length === 4, "時刻別一覧が4時刻");
check(report.hourly[0][0] === "9 時", "時刻別の時刻表記が正しい");
check(report.hourly.every((r) => r.length === 6), "時刻別に外気温・顕熱・潜熱・全熱・暖房がある");

// 集計
check(report.aggregateRooms.length === 3, "室別集計が3室");
check(report.aggregateSystems.length === 2, "系統集計が2系統");
check(report.aggregateFloors.length === 2, "階集計が2階");
check(report.aggregateBuilding.length === 1, "建物集計がある");
check(report.aggregateBuilding[0][1] === "3 室", "建物集計の室数が正しい");
check(/kW/.test(report.aggregateBuilding[0][3]), "建物集計に冷房負荷がある");

// 出典・未確認
check(report.source.url.includes("mlit.go.jp"), "帳票に公的基準の出典URLが入る");
check(report.source.page !== undefined, "帳票に公的基準のページ番号が入る");
check(report.coefficientSources.length >= 4, "係数の出典が複数記録される");
check(Array.isArray(report.notVerified) && report.notVerified.length > 0, "未確認事項が帳票に明示される(隠さない)");
check(Array.isArray(report.defaultedFromR6), "基準値で補完した項目が帳票に記録される");
check(report.ventilation.some(([k]) => k === "すきま風量"), "換気・すきま風の欄がある");

console.log(`\n=== レポート出力テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
process.exit(fail === 0 ? 0 : 1);
