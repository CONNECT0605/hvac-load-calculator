// stabro-aggregation.test.mjs
// 集計テスト: Room → System → Floor → Building が正しく積み上がることを検証する。
import { createRequire } from "node:module";
import { createProjectDoc, createFloor, createRoom, computeProject, aggregateProject, roomToLoadInput } from "./project-model.mjs";

const require = createRequire(import.meta.url);
const engine = require("./hvac-calc-engine.js");

let pass = 0; let fail = 0;
function check(cond, name) {
  if (cond) { pass += 1; console.log(`✅ PASS: ${name}`); }
  else { fail += 1; console.log(`❌ FAIL: ${name}`); }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function buildProject(systems) {
  const floors = [createFloor({ name: "1F", level: 1 }), createFloor({ name: "2F", level: 2 })];
  const rooms = [];
  systems.forEach((sys, i) => {
    rooms.push(createRoom({
      floorId: floors[i % 2].floorId,
      name: `${i + 1}号室`,
      usage: "office",
      floorArea: 100 + i * 10,
      occupancy: 10,
      systemId: sys,
    }));
  });
  return createProjectDoc({ projectName: "集計テスト", regionId: "kanto", buildingTypeId: "office", marginPct: 0, floors, rooms });
}

const projA = buildProject(["系統A", "系統A", "系統B"]);
const calcA = computeProject(projA, engine);
const aggA = aggregateProject(projA, calcA);

console.log("=== 集計(室→系統→階→建物)テスト ===");

check(aggA.byRoom.length === 3, "室別集計が全室分ある");
check(aggA.bySystem.length === 2, "系統別集計が系統数だけある");
check(aggA.byFloor.length === 2, "階別集計が階数だけある");
check(aggA.bySystem.find((s) => s.label === "系統A").roomCount === 2, "系統Aに2室が集約される");
check(aggA.bySystem.find((s) => s.label === "系統B").roomCount === 1, "系統Bに1室が集約される");

// 系統合計 = 建物合計
const sysSumCool = aggA.bySystem.reduce((a, s) => a + s.designLoadCoolingKW, 0);
check(close(sysSumCool, aggA.building.designLoadCoolingKW), "系統別冷房負荷の合計 = 建物全体");
const floorSumCool = aggA.byFloor.reduce((a, s) => a + s.designLoadCoolingKW, 0);
check(close(floorSumCool, aggA.building.designLoadCoolingKW), "階別冷房負荷の合計 = 建物全体");

// 室別の合計(有効室のみ)と一致
const roomSumCool = aggA.byRoom.filter((r) => r.status === "ok").reduce((a, r) => a + r.coolingKW, 0);
check(close(roomSumCool, aggA.building.designLoadCoolingKW), "室別(有効)冷房負荷の合計 = 建物全体");
check(close(aggA.building.designLoadCoolingKW, calcA.totals.designLoadCoolingKW), "建物集計 = computeProject の合算値(二重実装なし)");
check(close(aggA.building.venting === undefined ? aggA.building.ventilationM3h : 0, calcA.totals.ventilationM3h), "建物集計の換気量 = computeProject の合算値");
check(aggA.building.validRoomCount === 3, "建物集計の有効室数が正しい");
check(aggA.building.basis === (aggA.building.designLoadCoolingKW >= aggA.building.designLoadHeatingKW ? "cooling" : "heating"), "建物集計の冷暖房支配判定が正しい");
check(close(aggA.building.requiredCapacityKW, Math.max(aggA.building.designLoadCoolingKW, aggA.building.designLoadHeatingKW)), "建物の必要容量=冷暖房合算の大きい方");

// 系統構成の変更 → 系統集計が変化(因果テスト)
const projB = buildProject(["系統A", "系統B", "系統B"]);
const aggB = aggregateProject(projB, computeProject(projB, engine));
check(aggB.bySystem.find((s) => s.label === "系統A").roomCount === 1, "系統構成を変えると系統Aの室数が変わる");
check(aggB.bySystem.find((s) => s.label === "系統B").roomCount === 2, "系統構成を変えると系統Bの室数が変わる");
const aA = aggA.bySystem.find((s) => s.label === "系統A").designLoadCoolingKW;
const bA = aggB.bySystem.find((s) => s.label === "系統A").designLoadCoolingKW;
check(!close(aA, bA), "系統構成を変えると系統別負荷が変化する");
check(close(aggA.building.designLoadCoolingKW, aggB.building.designLoadCoolingKW), "系統の割り当てを変えても建物合計は不変");

// 階集計
const f1 = aggA.byFloor.find((f) => f.label === "1F");
const f2 = aggA.byFloor.find((f) => f.label === "2F");
check(f1 && f2 && f1.roomCount === 2 && f2.roomCount === 1, "階別に室が正しく分かれる");
check(!close(f1.designLoadCoolingKW, f2.designLoadCoolingKW), "階によって負荷が異なる");

// 階未設定・系統未設定の扱い
const projC = createProjectDoc({
  regionId: "kanto", buildingTypeId: "office",
  floors: [createFloor({ name: "1F", level: 1 })],
  rooms: [createRoom({ name: "未設定室", usage: "office", floorArea: 50, occupancy: 5 })],
});
const aggC = aggregateProject(projC, computeProject(projC, engine));
check(aggC.bySystem[0].label === "系統未設定", "系統未設定は「系統未設定」として集約される");
check(aggC.byFloor[0].label === "階未設定", "階未設定は「階未設定」として集約される");

// 計算不能室は0として混入しない
const projD = createProjectDoc({
  regionId: "kanto", buildingTypeId: "office",
  floors: [createFloor({ name: "1F", level: 1 })],
  rooms: [
    createRoom({ name: "正常室", usage: "office", floorArea: 100, occupancy: 10 }),
    createRoom({ name: "面積未入力室", usage: "office", floorArea: null, occupancy: 10 }),
  ],
});
const calcD = computeProject(projD, engine);
const aggD = aggregateProject(projD, calcD);
check(aggD.byRoom.length === 2, "計算不能室も室別一覧には載る(状態を隠さない)");
check(aggD.byRoom.some((r) => r.status !== "ok"), "計算不能室はstatus!=okとして記録される");
check(aggD.building.validRoomCount === 1, "計算不能室は有効室数に数えない");
check(close(aggD.building.designLoadCoolingKW, calcD.totals.designLoadCoolingKW), "計算不能室を0として合算に混入させない");
check(close(aggD.bySystem[0].roomCount, 1), "系統集計のroomCountは計算可能室のみ");

console.log(`\n=== 集計テスト 結果: ${pass}件成功 / ${fail}件失敗 ===`);
process.exit(fail === 0 ? 0 : 1);
