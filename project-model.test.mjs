import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  computeProject,
  createFloor,
  createProjectDoc,
  createRoom,
  getStepStatus,
  normalizeProjectDoc,
  roomAreaTotal,
  roomToLoadInput,
  roomVolume,
} from "./project-model.mjs";

const require = createRequire(import.meta.url);
const engine = require("./hvac-calc-engine.js");

const floor = createFloor({ name: "1F", level: 1 });
const project = createProjectDoc({
  projectName: "テスト案件",
  buildingTypeId: "restaurant",
  regionId: "kanto",
  totalFloorArea: 300,
  floors: [floor],
});
project.rooms = [
  createRoom({ floorId: floor.floorId, name: "客席", usage: "restaurant", floorArea: 100, occupancy: 30 }),
  createRoom({ floorId: floor.floorId, name: "事務室", usage: "office", floorArea: 50, occupancy: 5 }),
];

// 1. アダプターは engine.js の roomToLegacyLoadInput と同じ入力を作る(翻訳のみ)
const room = project.rooms[0];
const engineProject = engine.createProject({ regionId: project.regionId, floors: project.floors.length, marginPct: project.marginPct });
const engineRoom = engine.createRoom({
  roomName: room.name,
  usage: room.usage,
  floorArea: room.floorArea,
  ceilingHeight: room.ceilingHeight,
  occupancy: room.occupancy,
  indoorTemperature: { cooling: room.indoorTemperature.cooling, heating: room.indoorTemperature.heating },
});
assert.deepEqual(roomToLoadInput(project, room), engine.roomToLegacyLoadInput(engineProject, engineRoom));

// 2. 計算結果は既存エンジンの computeAll と完全一致(新しい計算式を含まない証明)
const calc = computeProject(project, engine);
for (const entry of calc.rooms) {
  const expected = engine.computeAll(roomToLoadInput(project, entry.room));
  assert.deepEqual(entry.loadResult, expected.loadResult);
  assert.deepEqual(entry.equipmentResult, expected.equipmentResult);
}

// 3. 建物合計は室別結果の単純合算
const expectedCooling = calc.rooms.reduce((s, r) => s + r.loadResult.designLoadCoolingKW, 0);
assert.equal(calc.totals.designLoadCoolingKW, expectedCooling);
assert.equal(calc.totals.requiredCapacityKW, Math.max(calc.totals.designLoadCoolingKW, calc.totals.designLoadHeatingKW));
assert.equal(calc.totals.validRoomCount, 2);
assert.equal(calc.buildingSelection.status, "ok");
assert.ok(calc.buildingSelection.recommended.installedKW >= calc.totals.requiredCapacityKW);

// 4. 基準ケース(飲食店・100m²・30人・関東)の既存数値が室単位でも維持される
const base = engine.computeAll({
  buildingTypeId: "restaurant", regionId: "kanto", floorAreaTotal: 100, floors: 1,
  occupants: 30, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false,
});
assert.equal(base.loadResult.designLoadCoolingKW.toFixed(1), calc.rooms[0].loadResult.designLoadCoolingKW.toFixed(1));
assert.equal(calc.rooms[0].loadResult.designLoadCoolingKW.toFixed(1), "24.4");

// 5. 面積未入力の室は既存エンジンの invalid 判定がそのまま伝播する
const broken = createProjectDoc({ totalFloorArea: 100, floors: [floor] });
broken.rooms = [createRoom({ floorId: floor.floorId, name: "未入力室", usage: "office", floorArea: null })];
const brokenCalc = computeProject(broken, engine);
assert.equal(brokenCalc.rooms[0].loadResult.status, "invalid");
assert.equal(brokenCalc.totals.validRoomCount, 0);
assert.ok(brokenCalc.warnings.some((w) => w.includes("未入力室")));

// 6. 補助関数
assert.equal(roomAreaTotal(project), 150);
assert.equal(roomVolume(project.rooms[0]), 260);
assert.equal(roomVolume(createRoom({ floorArea: null })), null);

// 7. ステップ進捗
const status = getStepStatus(project, calc);
assert.equal(status.building.done, true);
assert.equal(status.rooms.done, true);
assert.equal(status.occupancy.done, true);
assert.equal(status.envelope.done, false);
assert.equal(status.result.done, true);
const emptyProject = createProjectDoc();
const emptyStatus = getStepStatus(emptyProject, null);
assert.equal(emptyStatus.rooms.done, false);
assert.equal(emptyStatus.calc.done, false);

// 8. 正規化(旧スキーマ・壊れたデータ)
const normalized = normalizeProjectDoc({ projectName: "旧案件", floorArea: 200, rooms: [{ name: "室1", floorArea: 30 }] });
assert.equal(normalized.totalFloorArea, 200);
assert.equal(normalized.rooms.length, 1);
assert.equal(normalized.rooms[0].floorId, normalized.floors[0].floorId);
assert.equal(normalizeProjectDoc(null).rooms.length, 0);

// 9. 未指定温度は undefined として渡し、既存エンジンの既定値にそのまま委ねる
const noTemp = createRoom({ floorId: floor.floorId, name: "温度未指定", usage: "office", floorArea: 40, occupancy: 4, indoorTemperature: { cooling: null, heating: null } });
const noTempInput = roomToLoadInput(project, noTemp);
assert.equal(noTempInput.coolingSetTemp, undefined);
assert.equal(noTempInput.heatingSetTemp, undefined);
assert.equal(engine.computeLoad(noTempInput).tempFactorCooling, 1);

console.log("project-model: PASS");
