// hvac-calc-engine.test.js (v3対応版)
// STEP7で指定された全項目を網羅する自動テスト。
const assert = require("assert");
const { computeAll, computeLoad, selectEquipment, EQUIPMENT_DB, PACKAGE_SIZES } = require("./hvac-calc-engine.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ PASS: ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${e.message}`);
  }
}

const baseInput = {
  buildingTypeId: "restaurant",
  regionId: "kanto",
  floorAreaTotal: 100,
  floors: 5,
  occupants: 30,
  coolingSetTemp: 26,
  heatingSetTemp: 22,
  marginPct: 0,
  includeOccupantLoad: false,
};

// ---------------------------------------------------------------------------
console.log("\n=== 1. 同一入力→同一結果(決定性) ===");
test("同じ入力を2回計算すると完全に同じ結果になる", () => {
  const r1 = computeAll(baseInput);
  const r2 = computeAll(baseInput);
  assert.deepStrictEqual(r1, r2, "2回の計算結果が一致しません");
});

// ---------------------------------------------------------------------------
console.log("\n=== 2. 面積・寸法バリエーション(2m2, 10m2, 100m2) ===");
test("面積2m2で計算できる(異常に小さいが計算は継続)", () => {
  const { loadResult } = computeAll({ ...baseInput, floorAreaTotal: 2 });
  assert.strictEqual(loadResult.status, "ok");
  assert.ok(loadResult.roughLoadCoolingKW > 0);
});
test("面積10m2で計算できる", () => {
  const { loadResult } = computeAll({ ...baseInput, floorAreaTotal: 10 });
  assert.strictEqual(loadResult.status, "ok");
});
test("面積100m2の概算負荷(冷房)が既知の値(24.4kW)と一致する", () => {
  const { loadResult } = computeAll(baseInput);
  // 100 * 244(飲食店coolingWm2) * 1.0(kanto) * 1.0(温度補正26℃) / 1000 = 24.4
  assert.ok(Math.abs(loadResult.roughLoadCoolingKW - 24.4) < 0.001, `期待値24.4、実際${loadResult.roughLoadCoolingKW}`);
});
test("面積が大きいほど概算負荷が大きくなる(単調性)", () => {
  const r2 = computeAll({ ...baseInput, floorAreaTotal: 2 }).loadResult.roughLoadCoolingKW;
  const r10 = computeAll({ ...baseInput, floorAreaTotal: 10 }).loadResult.roughLoadCoolingKW;
  const r100 = computeAll({ ...baseInput, floorAreaTotal: 100 }).loadResult.roughLoadCoolingKW;
  assert.ok(r2 < r10 && r10 < r100, "面積に対して負荷が単調増加していません");
});

// ---------------------------------------------------------------------------
console.log("\n=== 3. 階数と対象階の区別(簡易モードでは階数は負荷計算に不使用) ===");
test("階数を1→5→50に変えても概算負荷・設計用必要負荷は変化しない", () => {
  const a = computeAll({ ...baseInput, floors: 1 }).loadResult;
  const b = computeAll({ ...baseInput, floors: 5 }).loadResult;
  const c = computeAll({ ...baseInput, floors: 50 }).loadResult;
  assert.strictEqual(a.roughLoadCoolingKW, b.roughLoadCoolingKW);
  assert.strictEqual(b.roughLoadCoolingKW, c.roughLoadCoolingKW);
  assert.strictEqual(a.designLoadCoolingKW, c.designLoadCoolingKW);
});
test("階数は機種の階別配分(perFloor)にのみ影響する", () => {
  const eq5 = computeAll({ ...baseInput, floors: 5 }).equipmentResult;
  const eq10 = computeAll({ ...baseInput, floors: 10 }).equipmentResult;
  assert.notStrictEqual(eq5.recommended.perFloor, eq10.recommended.perFloor, "階数を変えてもperFloorが変わっていません");
  assert.strictEqual(eq5.recommended.count, eq10.recommended.count, "階数を変えると台数まで変わってしまっています(バグ)");
});
test("「1フロア100m2×5階」という意図で合計500m2を入力した場合、500m2として1回だけ計算される(2重計算にならない)", () => {
  const r = computeAll({ ...baseInput, floorAreaTotal: 500, floors: 5 }).loadResult;
  // 500m2を1回使うだけなので、100m2ケースのちょうど5倍になるはず(500x5=2500のような誤った掛け算になっていないことを確認)
  const r100 = computeAll({ ...baseInput, floorAreaTotal: 100, floors: 1 }).loadResult;
  assert.ok(Math.abs(r.roughLoadCoolingKW - r100.roughLoadCoolingKW * 5) < 0.001,
    `500m2の負荷(${r.roughLoadCoolingKW})が100m2の5倍(${r100.roughLoadCoolingKW * 5})と一致しません`);
});
test("「対象階のみ100m2」(floors=1)は「延床100m2・5階」(floors=5)と同じ負荷になる(面積が同じなら階数によらない)", () => {
  const targetFloorOnly = computeAll({ ...baseInput, floorAreaTotal: 100, floors: 1 }).loadResult;
  const fiveFloors = computeAll({ ...baseInput, floorAreaTotal: 100, floors: 5 }).loadResult;
  assert.strictEqual(targetFloorOnly.roughLoadCoolingKW, fiveFloors.roughLoadCoolingKW);
});

// ---------------------------------------------------------------------------
console.log("\n=== 4. 用途変更 ===");
test("建物用途によって原単位が切り替わり、負荷が変化する", () => {
  const office = computeAll({ ...baseInput, buildingTypeId: "office" }).loadResult;
  const restaurant = computeAll({ ...baseInput, buildingTypeId: "restaurant" }).loadResult;
  assert.notStrictEqual(office.roughLoadCoolingKW, restaurant.roughLoadCoolingKW);
  // 飲食店(244W/m2)はオフィス(172W/m2)より原単位が高いため負荷も大きいはず
  assert.ok(restaurant.roughLoadCoolingKW > office.roughLoadCoolingKW);
});

// ---------------------------------------------------------------------------
console.log("\n=== 5. 人体発熱の二重計上がないこと ===");
test("includeOccupantLoad=false(既定)の場合、設計用必要負荷は概算負荷と完全に一致する(人体負荷が紛れ込んでいない)", () => {
  const r = computeAll({ ...baseInput, includeOccupantLoad: false, marginPct: 0 }).loadResult;
  assert.strictEqual(r.designLoadCoolingKW, r.roughLoadCoolingKW,
    "includeOccupantLoad=falseなのに設計用必要負荷が概算負荷と一致しません(二重計上の疑い)");
});
test("occupantsを0→30→100に変えても、includeOccupantLoad=falseなら設計用必要負荷は一切変化しない", () => {
  const a = computeAll({ ...baseInput, occupants: 0, includeOccupantLoad: false }).loadResult;
  const b = computeAll({ ...baseInput, occupants: 30, includeOccupantLoad: false }).loadResult;
  const c = computeAll({ ...baseInput, occupants: 100, includeOccupantLoad: false }).loadResult;
  assert.strictEqual(a.designLoadCoolingKW, b.designLoadCoolingKW);
  assert.strictEqual(b.designLoadCoolingKW, c.designLoadCoolingKW);
});
test("includeOccupantLoad=trueの場合のみ、人体負荷が設計用必要負荷に加算される", () => {
  const off = computeAll({ ...baseInput, includeOccupantLoad: false }).loadResult;
  const on = computeAll({ ...baseInput, includeOccupantLoad: true }).loadResult;
  const expectedOn = off.roughLoadCoolingKW + off.occupantSensibleKW + off.occupantLatentKW;
  assert.ok(Math.abs(on.designLoadCoolingKW - expectedOn) < 0.0001);
  assert.ok(on.designLoadCoolingKW > off.designLoadCoolingKW, "trueにしても負荷が増えていません");
});
test("人体負荷は暖房の設計用必要負荷には(includeOccupantLoadの値によらず)一切加算されない", () => {
  const on = computeAll({ ...baseInput, includeOccupantLoad: true }).loadResult;
  assert.strictEqual(on.designLoadHeatingKW, on.roughLoadHeatingKW, "暖房に人体負荷が混入しています");
});

// ---------------------------------------------------------------------------
console.log("\n=== 6. 概算負荷と設計用必要負荷の区別 ===");
test("marginPct>0の場合、設計用必要負荷は概算負荷より大きくなり、両者は明確に異なる値として区別できる", () => {
  const r = computeAll({ ...baseInput, marginPct: 10 }).loadResult;
  assert.ok(r.designLoadCoolingKW > r.roughLoadCoolingKW);
  assert.ok(Math.abs(r.designLoadCoolingKW - r.roughLoadCoolingKW * 1.1) < 0.0001);
});
test("marginPct=0かつincludeOccupantLoad=falseの場合のみ、概算負荷=設計用必要負荷となる", () => {
  const r = computeAll({ ...baseInput, marginPct: 0, includeOccupantLoad: false }).loadResult;
  assert.strictEqual(r.roughLoadCoolingKW, r.designLoadCoolingKW);
});

// ---------------------------------------------------------------------------
console.log("\n=== 7. 必要能力と機器容量の区別 ===");
test("設置合計容量(installedKW)は必要容量(requiredCapacityKW)以上である(不足がない)", () => {
  const { loadResult, equipmentResult } = computeAll(baseInput);
  assert.ok(equipmentResult.recommended.installedKW >= loadResult.requiredCapacityKW);
});
test("必要容量と設置合計容量は一般に一致しない(区別できる)が、完全一致ケースでは一致する", () => {
  const { loadResult, equipmentResult } = computeAll(baseInput);
  assert.notStrictEqual(loadResult.requiredCapacityKW, equipmentResult.recommended.installedKW,
    "通常ケースなのに必要容量と設置容量が一致しています(丸められすぎ)");
});

// ---------------------------------------------------------------------------
console.log("\n=== 8. 必要能力を満たす最小構成 ===");
test("推奨機種はブルートフォースで求めた最小余裕率と一致する(アルゴリズムの正しさ)", () => {
  const { loadResult, equipmentResult } = computeAll(baseInput);
  const required = loadResult.requiredCapacityKW;
  let bruteForceBest = null;
  for (const p of PACKAGE_SIZES) {
    const count = Math.ceil(required / p.kw);
    const installed = count * p.kw;
    const surplus = ((installed - required) / required) * 100;
    if (bruteForceBest === null || surplus < bruteForceBest.surplus) {
      bruteForceBest = { kw: p.kw, count, surplus };
    }
  }
  assert.strictEqual(equipmentResult.recommended.size, bruteForceBest.kw,
    `推奨${equipmentResult.recommended.size}kW、ブルートフォース最小${bruteForceBest.kw}kW`);
  assert.strictEqual(equipmentResult.recommended.count, bruteForceBest.count);
});
test("必要容量ちょうどの場合、最小構成の余裕率は0%になる(0除算なし)", () => {
  const exactArea = 8000 / 244; // 飲食店・関東・occupants0・margin0で8.0kWちょうどになる面積
  const { loadResult, equipmentResult } = computeAll({
    ...baseInput, floorAreaTotal: exactArea, occupants: 0, includeOccupantLoad: false,
  });
  assert.ok(Math.abs(loadResult.requiredCapacityKW - 8.0) < 0.0001);
  const opt80 = equipmentResult.candidates.find((c) => c.size === 8.0);
  assert.ok(Math.abs(opt80.surplusPct - 0) < 0.0001, `余裕率が0%ではありません: ${opt80.surplusPct}`);
  assert.ok(Number.isFinite(opt80.surplusPct), "surplusPctがNaN/Infinityです");
});

// ---------------------------------------------------------------------------
console.log("\n=== 9. 実在機器と仮選定機器の区別 ===");
test("5.6kWクラスは実在機器データがあり selectionType='formal' になる", () => {
  const r = computeAll({ ...baseInput, floorAreaTotal: 5.6 * 1000 / 244 / 1.15, occupants: 0 });
  // 単純に容量5.6kWの候補を直接調べる
  const cand = r.equipmentResult.candidates.find((c) => c.size === 5.6);
  assert.strictEqual(cand.selectionType, "formal");
  assert.ok(cand.realModels.length === 5, `5.6kWクラスの実在型式は5件のはずが${cand.realModels.length}件`);
});
test("8.0kWクラスは実在機器データがあり selectionType='formal' になる", () => {
  const r = computeAll(baseInput);
  const cand = r.equipmentResult.candidates.find((c) => c.size === 8.0);
  assert.strictEqual(cand.selectionType, "formal");
  assert.strictEqual(cand.realModels.length, 5);
});
test("7.1kW/11.2kW/14.0kW/16.0kW/22.4kWクラスは実在機器データがなく selectionType='provisional' になる", () => {
  const r = computeAll(baseInput);
  for (const size of [7.1, 11.2, 14.0, 16.0, 22.4]) {
    const cand = r.equipmentResult.candidates.find((c) => c.size === size);
    assert.strictEqual(cand.selectionType, "provisional", `${size}kWがprovisionalになっていません`);
    assert.strictEqual(cand.realModels.length, 0);
  }
});
test("EQUIPMENT_DBに登録されている全モデルにmaker/model/source(name,url,confirmedDate)が揃っている(追跡可能性)", () => {
  for (const kw of Object.keys(EQUIPMENT_DB)) {
    for (const m of EQUIPMENT_DB[kw]) {
      assert.ok(m.maker, "makerが空です");
      assert.ok(m.model, "modelが空です");
      assert.ok(m.source && m.source.name, "source.nameが空です");
      assert.ok(m.source && m.source.url, "source.urlが空です");
      assert.ok(m.source && m.source.confirmedDate, "source.confirmedDateが空です");
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\n=== 10. 異常入力(未入力・0・極端な値) ===");
test("面積0の場合はstatus='invalid'になり、0として計算されない", () => {
  const r = computeAll({ ...baseInput, floorAreaTotal: 0 });
  assert.strictEqual(r.loadResult.status, "invalid");
});
test("面積未入力(空文字)の場合もstatus='invalid'になる", () => {
  const r = computeAll({ ...baseInput, floorAreaTotal: "" });
  assert.strictEqual(r.loadResult.status, "invalid");
});
test("在室人数0は有効な入力として扱われ、エラーにならず警告のみ表示される", () => {
  const r = computeAll({ ...baseInput, occupants: 0 });
  assert.strictEqual(r.loadResult.status, "ok");
  assert.ok(r.loadResult.warnings.length > 0);
  assert.strictEqual(r.loadResult.ventilationM3h, 0);
});
test("極端に大きい面積(100,000m2)でも計算はクラッシュせず警告付きで完了する", () => {
  const r = computeAll({ ...baseInput, floorAreaTotal: 100000 });
  assert.strictEqual(r.loadResult.status, "ok");
  assert.ok(r.loadResult.warnings.length > 0);
  assert.ok(Number.isFinite(r.equipmentResult.recommended.installedKW));
});
test("温度設定がNaN(空欄相当)の場合、既定値にフォールバックしクラッシュしない", () => {
  const r = computeAll({ ...baseInput, coolingSetTemp: NaN, heatingSetTemp: NaN });
  assert.strictEqual(r.loadResult.status, "ok");
  assert.strictEqual(r.loadResult.tempFactorCooling, 1);
  assert.strictEqual(r.loadResult.tempFactorHeating, 1);
});
test("在室人数が負の値の場合、0にクランプされる(マイナスの換気量にならない)", () => {
  const r = computeAll({ ...baseInput, occupants: -50 });
  assert.strictEqual(r.loadResult.ventilationM3h, 0);
});
test("marginPctが負の値の場合、0にクランプされる(負の余裕=負荷削減は許可しない)", () => {
  const r = computeAll({ ...baseInput, marginPct: -20 });
  assert.strictEqual(r.loadResult.marginPct, 0);
});

// ---------------------------------------------------------------------------
// (既存31件はここまで。中間集計はせず、下記の追加テストへそのまま継続する)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【追加 2026-09-02】244W/m²暫定値隔離・計算方式識別構造の追加テスト
// 既存31件はそのまま維持し、以下は追加分。
// ---------------------------------------------------------------------------
console.log("\n=== 11. 244W/m²等の暫定値識別構造 ===");
test("BUILDING_TYPESの全用途・全原単位がvalue/unit/status/source/confirmedDate/noteを持つ", () => {
  const { BUILDING_TYPES } = require("./hvac-calc-engine.js");
  for (const bt of BUILDING_TYPES) {
    for (const key of ["coolingWm2", "heatingWm2"]) {
      const m = bt[key];
      assert.ok(typeof m === "object" && m !== null, `${bt.id}.${key}がオブジェクトではありません`);
      assert.ok("value" in m, `${bt.id}.${key}.valueがありません`);
      assert.ok("unit" in m, `${bt.id}.${key}.unitがありません`);
      assert.ok("status" in m, `${bt.id}.${key}.statusがありません`);
      assert.ok("source" in m, `${bt.id}.${key}.sourceがありません`);
      assert.ok("confirmedDate" in m, `${bt.id}.${key}.confirmedDateがありません`);
      assert.ok("note" in m, `${bt.id}.${key}.noteがありません`);
    }
  }
});
test("飲食店の冷房原単位は244W/m²のままで、status='provisional'(正式根拠未確認)である", () => {
  const { BUILDING_TYPES } = require("./hvac-calc-engine.js");
  const restaurant = BUILDING_TYPES.find((b) => b.id === "restaurant");
  assert.strictEqual(restaurant.coolingWm2.value, 244, "244W/m²の数値そのものが変更されています(禁止事項)");
  assert.strictEqual(restaurant.coolingWm2.status, "provisional");
  assert.strictEqual(restaurant.coolingWm2.confirmedDate, null, "原本未確認にもかかわらずconfirmedDateが入っています");
});
test("statusがverified(正式確認済み)の用途は現時点で1件も存在しない(誰も勝手に確定扱いにしていない)", () => {
  const { BUILDING_TYPES } = require("./hvac-calc-engine.js");
  for (const bt of BUILDING_TYPES) {
    assert.notStrictEqual(bt.coolingWm2.status, "verified");
    assert.notStrictEqual(bt.heatingWm2.status, "verified");
  }
});

console.log("\n=== 12. 計算方式識別構造(calculationMethod / loadComponents) ===");
test("includeOccupantLoad=falseの場合、calculationMethod='unit_load'になる", () => {
  const { loadResult } = computeAll({ ...baseInput, includeOccupantLoad: false });
  assert.strictEqual(loadResult.calculationMethod, "unit_load");
});
test("includeOccupantLoad=trueの場合、calculationMethod='unit_load_with_occupant_addon'になる(ハイブリッドである事実を隠さない)", () => {
  const { loadResult } = computeAll({ ...baseInput, includeOccupantLoad: true });
  assert.strictEqual(loadResult.calculationMethod, "unit_load_with_occupant_addon");
});
test("loadComponents.areaBasedCoefficient.includedは常にtrue(現状は原単位方式のみのため)", () => {
  const { loadResult } = computeAll(baseInput);
  assert.strictEqual(loadResult.loadComponents.areaBasedCoefficient.included, true);
});
test("loadComponents.envelope/windowSolar/lighting/equipmentHeat/infiltrationは、詳細方式(B)が未実装のため全てincluded=falseである", () => {
  const { loadResult } = computeAll(baseInput);
  for (const key of ["envelope", "windowSolar", "lighting", "equipmentHeat", "infiltration"]) {
    assert.strictEqual(loadResult.loadComponents[key].included, false, `${key}がincluded=falseではありません(未実装のはずが実装されている?)`);
  }
});
test("loadComponents.outdoorAir.includedはfalse(換気量は算出しているが熱量化・加算はしていないため)", () => {
  const { loadResult } = computeAll(baseInput);
  assert.strictEqual(loadResult.loadComponents.outdoorAir.included, false);
});

console.log("\n=== 13. 二重計上防止の確認 ===");
test("includeOccupantLoad=falseの間、loadComponents.occupantSensibleLatent.coolingKWは常に0(算出はするが加算していないことの証明)", () => {
  const { loadResult } = computeAll({ ...baseInput, includeOccupantLoad: false, occupants: 100 });
  assert.strictEqual(loadResult.loadComponents.occupantSensibleLatent.included, false);
  assert.strictEqual(loadResult.loadComponents.occupantSensibleLatent.coolingKW, 0);
  // occupants=100でも人体負荷そのもの(参考値)は算出されているが、設計用必要負荷には反映されていないことを再確認
  assert.ok(loadResult.occupantSensibleKW > 0, "参考値としての人体顕熱が算出されていません");
  assert.strictEqual(loadResult.designLoadCoolingKW, loadResult.roughLoadCoolingKW, "occupants=100なのに概算負荷と設計用必要負荷が一致しません(意図せず加算されている疑い)");
});
test("同一の負荷項目(人体負荷)が2箇所以上で二重に加算されていない(構造チェック)", () => {
  const { loadResult } = computeAll({ ...baseInput, includeOccupantLoad: true });
  const expectedCooling = loadResult.roughLoadCoolingKW + loadResult.occupantSensibleKW + loadResult.occupantLatentKW;
  // マージン0%のケースで、設計用必要負荷が「概算負荷+人体負荷」のちょうど1回分と一致することを確認(2倍等になっていない)
  assert.ok(Math.abs(loadResult.designLoadCoolingKW - expectedCooling) < 0.0001,
    `設計用必要負荷が期待値と一致しません(二重計上の疑い): 期待${expectedCooling}, 実際${loadResult.designLoadCoolingKW}`);
});

console.log("\n=== 14. 既存計算結果への非影響(回帰テスト) ===");
test("基準ケース(飲食店/100m2/30人/関東/26-22℃/margin0/occupant addon off)の数値が、構造変更前と完全に一致する(24.4kW/17.4kW)", () => {
  const { loadResult, equipmentResult } = computeAll(baseInput);
  assert.strictEqual(loadResult.roughLoadCoolingKW, 24.4, `冷房概算負荷が変化しています: ${loadResult.roughLoadCoolingKW}`);
  assert.strictEqual(loadResult.roughLoadHeatingKW, 17.4, `暖房概算負荷が変化しています: ${loadResult.roughLoadHeatingKW}`);
  assert.strictEqual(loadResult.designLoadCoolingKW, 24.4);
  assert.strictEqual(equipmentResult.recommended.size, 5.6);
  assert.strictEqual(equipmentResult.recommended.count, 5);
});

// ---------------------------------------------------------------------------
// (既存42件はここまで。中間集計はせず、下記の第1段階データモデルテストへ継続する)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 【追加 2026-09-04】第1段階:Project/Roomデータモデル + アダプター層のテスト
// 既存のcomputeLoad/selectEquipment/computeAllの計算式・係数は一切変更していない。
// ---------------------------------------------------------------------------
const {
  createProject, addRoomToProject, createRoom,
  createEnvelope, createWindow, createInternalHeat, createOutdoorAirInfiltration,
  roomToLegacyLoadInput, computeRoomLoad,
} = require("./hvac-calc-engine.js");

console.log("\n=== 15. Projectを作成できる ===");
test("createProject()で物件を作成でき、既定値(floors=1, marginPct=0, rooms=[])を持つ", () => {
  const project = createProject({ projectName: "テスト物件", regionId: "kanto" });
  assert.strictEqual(project.projectName, "テスト物件");
  assert.strictEqual(project.regionId, "kanto");
  assert.strictEqual(project.floors, 1);
  assert.strictEqual(project.marginPct, 0);
  assert.deepStrictEqual(project.rooms, []);
});

console.log("\n=== 16. 複数Roomを登録できる ===");
test("addRoomToProjectで複数の室を1つのProjectに登録できる", () => {
  const project = createProject({ regionId: "kanto" });
  const room1 = createRoom({ roomId: "r1", roomName: "1階客席", usage: "restaurant", floorArea: 60 });
  const room2 = createRoom({ roomId: "r2", roomName: "2階客席", usage: "restaurant", floorArea: 40 });
  addRoomToProject(project, room1);
  addRoomToProject(project, room2);
  assert.strictEqual(project.rooms.length, 2);
  assert.strictEqual(project.rooms[0].roomId, "r1");
  assert.strictEqual(project.rooms[1].roomId, "r2");
});
test("Room.volumeはfloorArea×ceilingHeightで自動計算される(幾何定義のみ、新しい係数ではない)", () => {
  const room = createRoom({ floorArea: 100, ceilingHeight: 2.6 });
  assert.strictEqual(room.volume, 260);
});
test("ceilingHeight未指定の場合、volumeはnullのまま(勝手に標準値を補完しない)", () => {
  const room = createRoom({ floorArea: 100 });
  assert.strictEqual(room.volume, null);
});

console.log("\n=== 17. RoomごとにEnvelopeを持てる ===");
test("Roomは既定でEnvelopeを持ち、数値係数(uValue等)はすべてnullである(根拠のない値を補完していない)", () => {
  const room = createRoom({ floorArea: 100 });
  assert.ok(room.envelope);
  assert.deepStrictEqual(room.envelope.wall, []);
  assert.strictEqual(room.envelope.roof.uValue, null);
  assert.strictEqual(room.envelope.floor.uValue, null);
});
test("Envelopeに壁面情報を明示的に渡せる(構造のみ、係数の妥当性は問わない)", () => {
  const envelope = createEnvelope({ wall: [{ area: 20, orientation: "south", uValue: null }] });
  assert.strictEqual(envelope.wall.length, 1);
  assert.strictEqual(envelope.wall[0].orientation, "south");
});

console.log("\n=== 18. RoomごとにWindowを持てる ===");
test("Roomは既定でwindows=[](空配列)を持ち、Window追加は配列pushで行える", () => {
  const room = createRoom({ floorArea: 100 });
  assert.deepStrictEqual(room.windows, []);
  room.windows.push(createWindow({ area: 10, orientation: "south" }));
  assert.strictEqual(room.windows.length, 1);
  assert.strictEqual(room.windows[0].area, 10);
});
test("Windowの熱的特性・日射特性は既定でnull(根拠のない係数を発明していない)", () => {
  const w = createWindow({ area: 10 });
  assert.strictEqual(w.thermalProperty.uValue, null);
  assert.strictEqual(w.solarProperty.scValue, null);
  assert.strictEqual(w.solarProperty.etaValue, null);
});

console.log("\n=== 19. RoomごとにInternalHeatを持てる ===");
test("Roomは既定でInternalHeatを持ち、人体発熱は既存OCCUPANT_HEAT(60W/50W)をそのまま引き継ぐ(新規係数ではない)", () => {
  const { OCCUPANT_HEAT } = require("./hvac-calc-engine.js");
  const room = createRoom({ floorArea: 100 });
  assert.strictEqual(room.internalHeat.occupantSensibleWPerPerson, OCCUPANT_HEAT.sensibleWPerPerson);
  assert.strictEqual(room.internalHeat.occupantLatentWPerPerson, OCCUPANT_HEAT.latentWPerPerson);
});
test("照明・機器発熱・その他内部発熱は既定でnull/空配列(根拠となる原単位が存在しないため)", () => {
  const room = createRoom({ floorArea: 100 });
  assert.strictEqual(room.internalHeat.lightingWm2, null);
  assert.strictEqual(room.internalHeat.equipmentWm2, null);
  assert.deepStrictEqual(room.internalHeat.otherInternalHeat, []);
});

console.log("\n=== 20. RoomごとにOutdoorAirを持てる ===");
test("Roomは既定でOutdoorAirInfiltrationを持ち、外気温湿度・熱交換効率は既定でnull", () => {
  const room = createRoom({ floorArea: 100 });
  assert.strictEqual(room.outdoorAir.outdoorTemperature.cooling, null);
  assert.strictEqual(room.outdoorAir.outdoorTemperature.heating, null);
  assert.strictEqual(room.outdoorAir.heatRecovery.efficiency, null);
  assert.strictEqual(room.outdoorAir.infiltration.sashTightness, null);
});

console.log("\n=== 21. 新モデル→アダプター→既存計算ロジックへの接続 ===");
test("roomToLegacyLoadInputは既存computeLoad()が期待するキー名にRoom/Projectの値を変換する(計算は行わない、翻訳のみ)", () => {
  const project = createProject({ regionId: "kanto", floors: 5, marginPct: 0 });
  const room = createRoom({
    usage: "restaurant", floorArea: 100, occupancy: 30,
    indoorTemperature: { cooling: 26, heating: 22 },
  });
  const legacyInput = roomToLegacyLoadInput(project, room);
  assert.strictEqual(legacyInput.buildingTypeId, "restaurant");
  assert.strictEqual(legacyInput.regionId, "kanto");
  assert.strictEqual(legacyInput.floorAreaTotal, 100);
  assert.strictEqual(legacyInput.floors, 5);
  assert.strictEqual(legacyInput.occupants, 30);
  assert.strictEqual(legacyInput.coolingSetTemp, 26);
  assert.strictEqual(legacyInput.heatingSetTemp, 22);
  assert.strictEqual(legacyInput.marginPct, 0);
  assert.strictEqual(legacyInput.includeOccupantLoad, false);
});
test("computeRoomLoad(project, room)の結果が、既存computeAll()を同等の入力で直接呼んだ結果と完全に一致する(新しい計算式を含んでいないことの証明)", () => {
  const project = createProject({ regionId: "kanto", floors: 5, marginPct: 0 });
  const room = createRoom({
    usage: "restaurant", floorArea: 100, occupancy: 30,
    indoorTemperature: { cooling: 26, heating: 22 },
  });
  const viaAdapter = computeRoomLoad(project, room);
  const viaDirect = computeAll({
    buildingTypeId: "restaurant", regionId: "kanto", floorAreaTotal: 100, floors: 5,
    occupants: 30, coolingSetTemp: 26, heatingSetTemp: 22, marginPct: 0, includeOccupantLoad: false,
  });
  assert.deepStrictEqual(viaAdapter, viaDirect, "アダプター経由の結果が既存直接呼び出しと一致しません(新計算ロジック混入の疑い)");
});
test("computeRoomLoad経由でも基準ケースの数値(24.4kW/17.4kW/5.6kW×5台)が既存と完全に一致する(回帰確認)", () => {
  const project = createProject({ regionId: "kanto", floors: 5, marginPct: 0 });
  const room = createRoom({
    usage: "restaurant", floorArea: 100, occupancy: 30,
    indoorTemperature: { cooling: 26, heating: 22 },
  });
  const { loadResult, equipmentResult } = computeRoomLoad(project, room);
  assert.strictEqual(loadResult.roughLoadCoolingKW, 24.4);
  assert.strictEqual(loadResult.roughLoadHeatingKW, 17.4);
  assert.strictEqual(equipmentResult.recommended.size, 5.6);
  assert.strictEqual(equipmentResult.recommended.count, 5);
});
test("温度未指定のRoomでも、アダプターは値をそのまま渡し、既存computeLoad側の既定フォールバック(26/22℃)がそのまま機能する(アダプター側で数値を書いていないことの確認)", () => {
  const project = createProject({ regionId: "kanto" });
  const room = createRoom({ usage: "restaurant", floorArea: 100, occupancy: 30 }); // 温度未指定
  const { loadResult } = computeRoomLoad(project, room);
  assert.strictEqual(loadResult.tempFactorCooling, 1); // 既存の既定フォールバック26℃相当
  assert.strictEqual(loadResult.tempFactorHeating, 1); // 既存の既定フォールバック22℃相当
});

// ---------------------------------------------------------------------------

const finalPassed = passed;
const finalFailed = failed;
console.log(`\n=== 追加テスト分を含む最終結果: ${finalPassed}件成功 / ${finalFailed}件失敗 ===`);
if (finalFailed > 0) {
  console.log("\n失敗したテスト:");
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log("すべてのテストに成功しました。");
  process.exit(0);
}
