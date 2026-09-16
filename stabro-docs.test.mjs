// stabro-docs.test.mjs
// 18帳票(表紙・熱負荷計算書・熱負荷集計表・設計条件9・チェックリスト6)が
// 既存の詳細レポートと集計の値だけから構成されることを検証する。
import { createRequire } from "node:module";
import { createProjectDoc, createFloor, createRoom, computeProject, aggregateProject } from "./project-model.mjs";
import { buildDetailedReport } from "./detailed-report.mjs";
import { buildReportWorkbook, buildTsv } from "./report-docs.mjs";

const require = createRequire(import.meta.url);
const e = require("./hvac-calc-engine.js");

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}

const floors = [createFloor({ name: "1F", level: 1 }), createFloor({ name: "2F", level: 2 })];
const rooms = [
  createRoom({ floorId: floors[0].floorId, name: "事務室A", systemId: "sys-1", floorArea: 300, occupancy: 30, usage: "office" }),
  createRoom({ floorId: floors[1].floorId, name: "会議室B", systemId: "sys-1", floorArea: 200, occupancy: 20, usage: "office" }),
];
const project = createProjectDoc({ projectName: "帳票テスト", regionId: "kanto", buildingTypeId: "office", marginPct: 10, floors, rooms });
const calc = computeProject(project, e);
const aggregate = aggregateProject(project, calc);
const firstRoom = project.rooms[0];
const detailedLoad = e.computeRoomDetailedLoad(project, firstRoom);
const regions = [{ id: "kanto", label: "関東" }, { id: "hokkaido", label: "北海道" }];
const buildingTypes = [{ id: "office", label: "事務室" }, { id: "meeting", label: "会議室" }];
const detailed = buildDetailedReport({
  project, loadResult: detailedLoad, aggregate, roomResults: aggregate.byRoom,
  rooms: project.rooms, floors: project.floors, regions, buildingTypes,
});
const wb = buildReportWorkbook({ detailed, aggregate, project, regions, buildingTypes });

check(wb.sheetOrder.length === 18, "帳票は18帳票で構成される");
check(wb.sheetOrder[0] === "表紙" && wb.sheetOrder[1] === "熱負荷計算書" && wb.sheetOrder[2] === "熱負荷集計表", "先頭が表紙・熱負荷計算書・熱負荷集計表");
check(wb.sheetOrder.filter((s) => s.startsWith("設計条件")).length === 9, "設計条件は9帳票");
check(wb.sheetOrder.filter((s) => s.startsWith("チェックリスト")).length === 6, "チェックリストは6帳票");
check(Object.values(wb.sheets).every((rows) => Array.isArray(rows) && rows.length > 0), "すべての帳票に内容がある(空の帳票が無い)");
check(wb.sheets["表紙"].some(([, v]) => v === "帳票テスト"), "表紙に案件名が出る");
check(JSON.stringify(wb.sheets["熱負荷計算書"]).includes("事務室A"), "熱負荷計算書に室名が出る");
check(wb.sheets["熱負荷集計表"].some((row) => row[0] === "系統" && row[1] === "sys-1"), "熱負荷集計表に系統集計が出る");
check(wb.sheets["熱負荷集計表"].some((row) => row[0] === "建物"), "熱負荷集計表に建物合計が出る");
check(wb.sheets["設計条件1 室内条件"].some(([, v]) => v === 26), "設計条件1に冷房室内温度が入る");
check(wb.sheets["設計条件2 屋外条件"].some(([k]) => k.includes("時刻別")), "設計条件2に時刻別の外気条件が入る");
check(wb.sheets["設計条件4 開口部(ガラス面)"].some(([k]) => k.includes("遮蔽係数")), "設計条件4に遮蔽係数が入る");
check(wb.sheets["設計条件6 換気・外気"].some(([k, v]) => k === "外気量(m³/h)" && Number(v) > 0), "設計条件6に外気量が入る");
check(wb.sheets["設計条件9 ダクト・配管・空気漏洩"].some(([k]) => k === "合計(kW)"), "設計条件9に合計がある");
check(wb.sheets["チェックリスト1 入力の網羅"].length >= 2, "チェックリスト1に未入力の網羅状況が出る");
check(wb.sheets["チェックリスト4 負荷項目の網羅"].filter(([k]) => k.startsWith("冷房項目")).length === 8, "チェックリスト4に冷房8項目が出る");
check(wb.sheets["チェックリスト4 負荷項目の網羅"].filter(([k]) => k.startsWith("暖房項目")).length === 5, "チェックリスト4に暖房5項目が出る");
const tsv = buildTsv(wb);
check(tsv.includes("# 表紙") && tsv.includes("# チェックリスト6"), "TSVに全帳票の見出しが出る");
check(tsv.split("\r\n").length > 60, "TSVの行数が帳票の内容に見合う");
check(!tsv.includes("NaN") && !tsv.includes("undefined"), "TSVに NaN / undefined が混入しない");
// 帳票の数値が詳細レポートと一致する(帳票側で再計算していない)
const peakRow = wb.sheets["チェックリスト5 内外の整合(顕熱+潜熱=全熱)"].find(([k]) => k === "冷房 全熱(kW)");
check(peakRow && Math.abs(Number(peakRow[1]) - parseFloat(String(detailed.breakdown[detailed.breakdown.length - 1][1]).replace(/[^0-9.+-]/g,""))) < 0.02, "チェックリスト5の全熱が詳細レポートの全熱合計と一致する");
// 集計キーの取り違え(coolingKW / designLoadCoolingKW)で室の合計だけ0になる回帰を検出する
const c6 = Object.fromEntries(wb.sheets["チェックリスト6 集計の整合(室→系統→階→建物)"]);
const coolingTotals = ["室の合計 冷房(kW)", "系統の合計 冷房(kW)", "階の合計 冷房(kW)", "建物 冷房(kW)"].map((k) => Number(c6[k]));
check(coolingTotals.every((v) => v > 0), `チェックリスト6の冷房合計が全階層で0でない(実際 ${coolingTotals.join("/")})`);
check(new Set(coolingTotals).size === 1, `チェックリスト6の室→系統→階→建物が一致する(実際 ${coolingTotals.join("/")})`);
// 出典の各行に "―" のプレースホルダが露出しない
const c3 = wb.sheets["チェックリスト3 係数の出典"].filter(([k]) => k.startsWith("出典"));
check(c3.length > 0 && c3.every(([, v]) => !String(v).includes("―")), "チェックリスト3の出典に「―」が露出しない");

console.log(`\n=== 帳票出力テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
if (fail) process.exitCode = 1;