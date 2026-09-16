// project-model.mjs
// 案件(Project)/階(Floor)/室(Room)の階層データモデルとステップ進捗判定。
//
// 【重要な設計原則】
// 1. このファイルは計算式を一切持たない。負荷計算は必ず hvac-calc-engine.js の
//    SHARED-LOGIC(computeLoad / selectEquipment)に委譲する。
//    computeProject() は計算関数を引数で受け取る(依存性注入)ため、
//    engine.js とも jsx 埋め込み版とも同一の結果になる。
// 2. 室→既存computeLoad入力への変換(roomToLoadInput)は、engine.js の
//    roomToLegacyLoadInput() と同一の対応関係のみを行う「翻訳」であり、
//    新しい係数・新しい計算式を一切追加しない(project-model.test.mjs で
//    engine.js 本体との一致を機械的に検証している)。
// 3. 根拠が確認できていない数値(照明・機器原単位、U値、日射取得率等)は
//    既定値を発明せず null のままとする。

export const PROJECT_SCHEMA_VERSION = 2;

// 天井高の既定値2.6mは professional-spec-data-model-v1.md §B-2「天井高さ:任意(標準値2.6m等)」に基づく。
// 室容積 = 面積 × 天井高 は幾何学的定義であり、新しい計算式ではない。
export const DEFAULT_CEILING_HEIGHT = 2.6;
// 室内設定温度の既定値は既存エンジン computeLoad() のフォールバック値(26℃/22℃)と同一。
export const DEFAULT_COOLING_TEMP = 26;
export const DEFAULT_HEATING_TEMP = 22;
// 案件の既定用途・地域区分。既存エンジン側の既定と同じ値を使う(新しい既定値は作らない)。
export const DEFAULT_BUILDING_TYPE_ID = "office";
export const DEFAULT_REGION_ID = "kanto";

export const ORIENTATIONS = [
  { id: "n", label: "北" },
  { id: "ne", label: "北東" },
  { id: "e", label: "東" },
  { id: "se", label: "南東" },
  { id: "s", label: "南" },
  { id: "sw", label: "南西" },
  { id: "w", label: "西" },
  { id: "nw", label: "北西" },
];

export const GLASS_TYPES = [
  { id: "", label: "未選択" },
  { id: "single", label: "単板ガラス" },
  { id: "double", label: "複層ガラス" },
  { id: "lowE", label: "Low-E複層ガラス" },
];

export const SHADING_TYPES = [
  { id: "", label: "未選択" },
  { id: "none", label: "遮蔽なし" },
  { id: "eaves", label: "庇" },
  { id: "blind", label: "ブラインド" },
  { id: "louver", label: "ルーバー" },
];

export const VENTILATION_TYPES = [
  { id: "", label: "未選択" },
  { id: "type1", label: "第1種換気" },
  { id: "type2", label: "第2種換気" },
  { id: "type3", label: "第3種換気" },
];

export const STEPS = [
  { id: "building", no: 1, label: "建物", note: "案件・建物用途・地域・延床面積" },
  { id: "floors", no: 2, label: "階", note: "階構成の登録" },
  { id: "rooms", no: 3, label: "室", note: "室名・室用途・面積・天井高" },
  { id: "conditions", no: 4, label: "室内条件", note: "室内温度・湿度・運転時間" },
  { id: "occupancy", no: 5, label: "人員", note: "在室人数" },
  { id: "internal", no: 6, label: "照明/機器", note: "内部発熱(参考入力)" },
  { id: "outdoorair", no: 7, label: "外気/換気", note: "外気量・換気方式・熱交換" },
  { id: "envelope", no: 8, label: "外皮/窓", note: "外皮・開口部(参考入力)" },
  { id: "calc", no: 9, label: "計算", note: "計算条件の確認と実行" },
  { id: "result", no: 10, label: "結果", note: "室別負荷・機器選定" },
];

let idCounter = 0;
function makeId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createFloor(f = {}) {
  return {
    floorId: f.floorId ?? makeId("floor"),
    name: f.name ?? "1F",
    level: f.level ?? 1,
    note: f.note ?? "",
  };
}

// 入れ子オブジェクトの正規化は「値の補完」ではなく「UIが参照するキーの存在保証」として行う。
// 旧スキーマの書き出しJSONのように親キーはあるが入れ子キーが欠けている入力を読むと、
// step-screens.jsx のプロパティ参照がundefinedになり画面全体が落ちるため、
// createRoom の既定値と同じ構造をここでも必ず成立させる(数値そのものは補完しない)。
function subObject(value, defaults) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { ...defaults, ...source };
}

export function createRoom(r = {}) {
  return {
    roomId: r.roomId ?? makeId("room"),
    floorId: r.floorId ?? null,
    // 系統(空調系統)。STABROの系統集計に対応する。
    systemId: r.systemId ?? null,
    name: r.name ?? "室",
    usage: r.usage ?? null, // BUILDING_TYPES の id
    floorArea: r.floorArea ?? null,
    ceilingHeight: r.ceilingHeight ?? DEFAULT_CEILING_HEIGHT,
    indoorTemperature: subObject(r.indoorTemperature, { cooling: DEFAULT_COOLING_TEMP, heating: DEFAULT_HEATING_TEMP }),
    indoorHumidity: subObject(r.indoorHumidity, { cooling: null, heating: null }), // 現行エンジンは湿度未対応
    operatingHours: subObject(r.operatingHours, { start: null, end: null }),
    occupancy: r.occupancy ?? null,
    internalHeat: subObject(r.internalHeat, {
      lightingWm2: null,   // 根拠となる原単位が未確認のため既定null
      equipmentWm2: null,  // 同上
      others: [],
    }),
    // null = 既存エンジンの「在室人数 × 用途別原単位」で自動算出
    outdoorAir: {
      ...subObject(r.outdoorAir, { volumeM3h: null, ventilationType: null }),
      heatRecovery: subObject(r.outdoorAir?.heatRecovery, { enabled: false, efficiency: null }),
      infiltration: subObject(r.outdoorAir?.infiltration, { sashTightness: null, hasExternalDoor: null }),
    },
    envelope: {
      ...subObject(r.envelope, { walls: [], ceiling: { area: null, uValue: null } }),
      // [{ area, orientation, uValue }]
      walls: Array.isArray(r.envelope?.walls) ? r.envelope.walls.map((w) => createWall(w)) : [],
      // 内壁(間仕切り): [{ area, uValue }]。R6の「構造体負荷」の内壁分。
      interiorWalls: Array.isArray(r.envelope?.interiorWalls) ? r.envelope.interiorWalls.map((w) => createWall(w)) : [],
      interiorDeltaTK: r.envelope?.interiorDeltaTK ?? null,
      roof: subObject(r.envelope?.roof, { area: null, uValue: null }),
      floor: subObject(r.envelope?.floor, { area: null, uValue: null }),
      ceiling: subObject(r.envelope?.ceiling, { area: null, uValue: null }),
    },
    // [{ area, orientation, glassType, uValue, scValue, shading }]
    windows: Array.isArray(r.windows) ? r.windows.map((w) => createWindow(w)) : [],
  };
}

export function createWall(w = {}) {
  return {
    area: w.area ?? null,
    orientation: w.orientation ?? "n",
    uValue: w.uValue ?? null,
    // 材料構成(厚さ・熱伝導率)からU値を算定する場合に使用
    materials: Array.isArray(w.materials) ? w.materials.map((m) => ({ name: m.name ?? "", thicknessMm: m.thicknessMm ?? null, conductivityWmK: m.conductivityWmK ?? null })) : [],
    solarAbsorptionRatio: w.solarAbsorptionRatio ?? null,
  };
}

export function createWindow(w = {}) {
  return {
    area: w.area ?? null,
    orientation: w.orientation ?? "s",
    glassType: w.glassType ?? "",
    uValue: w.uValue ?? null,
    scValue: w.scValue ?? null,
    shading: w.shading ?? "",
    // 庇・ルーバー等の日射遮蔽率(0〜1)。設計条件として入力する。
    shadeRatio: w.shadeRatio ?? null,
    // サッシ気密性区分別の単位すきま風量[m³/(h·m²)]
    unitLeakageM3hPerM2: w.unitLeakageM3hPerM2 ?? null,
  };
}

export function createProjectDoc(p = {}) {
  const floors = Array.isArray(p.floors) && p.floors.length ? p.floors.map((f) => createFloor(f)) : [createFloor({ name: "1F", level: 1 })];
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: p.projectId ?? null,
    projectName: p.projectName ?? "名称未設定の案件",
    client: p.client ?? "",
    siteAddress: p.siteAddress ?? "",
    buildingTypeId: p.buildingTypeId ?? DEFAULT_BUILDING_TYPE_ID,
    regionId: p.regionId ?? DEFAULT_REGION_ID,
    totalFloorArea: p.totalFloorArea ?? null,
    airConditionedArea: p.airConditionedArea ?? null,
    operatingHours: subObject(p.operatingHours, { start: "09:00", end: "18:00" }),
    marginPct: p.marginPct ?? 0,
    targetFloorId: p.targetFloorId ?? null,
    floors,
    rooms: Array.isArray(p.rooms) ? p.rooms.map((r) => createRoom(r)) : [],
    note: p.note ?? "",
  };
}

/**
 * 保存済みデータ(旧スキーマを含む)を現行スキーマに正規化する。
 * 欠けているフィールドは既定値で補うが、数値は補完しない。
 */
const idsOf = (list) => (Array.isArray(list) ? list.map((entry) => entry.id) : []);
const isKnownId = (ids, id) => ids.length === 0 || ids.includes(id);
// 既定IDが一覧に無い場合のみ先頭に退避する(通常は既定IDが使われる)
const fallbackId = (ids, preferred) => (ids.includes(preferred) ? preferred : ids[0]);

// 未知の用途/地域IDは、室用途(room.usage)だけでなく建物既定(buildingTypeId)からも
// 参照されるため、既知のIDに戻す。置き換え先は案件の既定ID(エンジン側の既定と同じ)であり、
// 一覧の先頭を勝手に選ぶと地域区分が実態と食い違うため使わない。
// 既知IDの一覧は計算エンジンが持つ唯一の定義(SHARED-LOGICのBUILDING_TYPES/REGIONS)から
// 渡してもらい、ここでは複製しない。
function resolveKnownIds(base, known) {
  const buildingTypeIds = idsOf(known.buildingTypes);
  const regionIds = idsOf(known.regions);
  if (!isKnownId(buildingTypeIds, base.buildingTypeId)) base.buildingTypeId = fallbackId(buildingTypeIds, DEFAULT_BUILDING_TYPE_ID);
  if (!isKnownId(regionIds, base.regionId)) base.regionId = fallbackId(regionIds, DEFAULT_REGION_ID);
  for (const room of base.rooms) {
    if (room.usage !== null && !isKnownId(buildingTypeIds, room.usage)) room.usage = null;
  }
}

export function normalizeProjectDoc(raw, known = {}) {
  if (!raw || typeof raw !== "object") return createProjectDoc();
  const base = createProjectDoc({
    projectId: raw.projectId ?? null,
    projectName: raw.projectName,
    client: raw.client,
    siteAddress: raw.siteAddress,
    buildingTypeId: raw.buildingTypeId,
    regionId: raw.regionId,
    totalFloorArea: raw.totalFloorArea ?? raw.floorArea ?? null,
    airConditionedArea: raw.airConditionedArea,
    operatingHours: raw.operatingHours,
    marginPct: raw.marginPct,
    targetFloorId: raw.targetFloorId,
    floors: Array.isArray(raw.floors) && raw.floors.length ? raw.floors.map((f) => createFloor(f)) : undefined,
    note: raw.note,
  });
  const floorIds = new Set(base.floors.map((f) => f.floorId));
  base.rooms = Array.isArray(raw.rooms)
    ? raw.rooms.map((r) => {
        const room = createRoom(r);
        if (!floorIds.has(room.floorId)) room.floorId = base.floors[0].floorId;
        return room;
      })
    : [];
  resolveKnownIds(base, known);
  return base;
}

export function roomsOfFloor(project, floorId) {
  return project.rooms.filter((r) => r.floorId === floorId);
}

export function roomAreaTotal(project) {
  return project.rooms.reduce((sum, r) => sum + (Number(r.floorArea) || 0), 0);
}

export function roomVolume(room) {
  const blank = (v) => v === null || v === undefined || v === "";
  if (blank(room.floorArea) || blank(room.ceilingHeight)) return null;
  const area = Number(room.floorArea);
  const height = Number(room.ceilingHeight);
  if (!Number.isFinite(area) || !Number.isFinite(height)) return null;
  return area * height;
}

/**
 * 【アダプター】室 → 既存 computeLoad() 入力形式への変換。
 * engine.js の roomToLegacyLoadInput() と同一の対応関係のみを行い、計算は一切しない。
 * 未指定(null)は undefined として渡し、既存エンジン側の既定値フォールバックに委ねる。
 */
export function roomToLoadInput(project, room) {
  const toLegacy = (v) => (v === null || v === undefined || v === "" ? undefined : v);
  return {
    buildingTypeId: room.usage || project.buildingTypeId,
    regionId: project.regionId,
    floorAreaTotal: room.floorArea,
    floors: project.floors.length,
    occupants: room.occupancy,
    coolingSetTemp: room.indoorTemperature ? toLegacy(room.indoorTemperature.cooling) : undefined,
    heatingSetTemp: room.indoorTemperature ? toLegacy(room.indoorTemperature.heating) : undefined,
    marginPct: project.marginPct,
    includeOccupantLoad: false, // 既存エンジンの既定値と同一(出典未確認のため加算しない)
  };
}

/**
 * 案件全体の計算。
 * @param {object} project
 * @param {{computeLoad: Function, selectEquipment: Function}} engine
 *   SHARED-LOGICブロックの関数をそのまま渡す(このファイルでは計算しない)。
 */
export function computeProject(project, engine) {
  const { computeLoad, selectEquipment } = engine;
  const rooms = project.rooms.map((room) => {
    const input = roomToLoadInput(project, room);
    const loadResult = computeLoad(input);
    const equipmentResult = loadResult.status === "ok" ? selectEquipment(loadResult) : null;
    return { room, input, loadResult, equipmentResult };
  });

  const valid = rooms.filter((r) => r.loadResult.status === "ok");
  // 合算のみ(新しい計算式ではない)。professional-spec-data-model-v1.md §D
  // 「建物全体最大負荷(室の合算)」に対応する。
  const sum = (pick) => valid.reduce((acc, r) => acc + pick(r.loadResult), 0);
  const totals = {
    roomCount: project.rooms.length,
    validRoomCount: valid.length,
    floorArea: sum((l) => l.floorAreaTotal),
    designLoadCoolingKW: sum((l) => l.designLoadCoolingKW),
    designLoadHeatingKW: sum((l) => l.designLoadHeatingKW),
    roughLoadCoolingKW: sum((l) => l.roughLoadCoolingKW),
    roughLoadHeatingKW: sum((l) => l.roughLoadHeatingKW),
    occupantSensibleKW: sum((l) => l.occupantSensibleKW),
    occupantLatentKW: sum((l) => l.occupantLatentKW),
    ventilationM3h: sum((l) => l.ventilationM3h),
  };
  totals.requiredCapacityKW = Math.max(totals.designLoadCoolingKW, totals.designLoadHeatingKW);
  totals.basis = totals.designLoadCoolingKW >= totals.designLoadHeatingKW ? "cooling" : "heating";

  // 建物全体の機器選定も既存 selectEquipment() をそのまま使う。
  // 入力は「室別結果の合算値」を loadResult と同じ形に詰め替えたものだけ。
  const buildingSelection = valid.length
    ? selectEquipment({
        status: "ok",
        requiredCapacityKW: totals.requiredCapacityKW,
        floors: project.floors.length,
        basis: totals.basis,
      })
    : { status: "invalid", reason: "計算可能な室がありません。", candidates: [], recommended: null, selectionReasonText: null };

  const warnings = [];
  for (const r of rooms) {
    const label = r.room.name || "(室名未設定)";
    if (r.loadResult.status !== "ok") {
      warnings.push(`${label}: ${r.loadResult.reason}`);
      continue;
    }
    for (const w of r.loadResult.warnings) warnings.push(`${label}: ${w}`);
  }
  const declared = Number(project.totalFloorArea);
  if (Number.isFinite(declared) && declared > 0 && totals.floorArea > declared) {
    warnings.push(`室面積の合計(${totals.floorArea.toFixed(1)}m²)が延床面積(${declared}m²)を超えています(要確認)。`);
  }

  return { rooms, totals, buildingSelection, warnings };
}

const isFilled = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

/**
 * 10ステップそれぞれの入力充足状況。
 * status: "done"(必須入力が揃っている) | "todo"(必須が未入力) | "optional"(任意項目のみ)
 */
export function getStepStatus(project, calc) {
  const rooms = project.rooms;
  const anyRoom = rooms.length > 0;
  const status = {};

  status.building = {
    done: !!project.buildingTypeId && !!project.regionId && isFilled(project.totalFloorArea),
    issues: [
      !isFilled(project.totalFloorArea) ? "延床面積が未入力です。" : null,
    ].filter(Boolean),
  };
  status.floors = {
    done: project.floors.length > 0,
    issues: project.floors.length ? [] : ["階が1つも登録されていません。"],
  };
  status.rooms = {
    done: anyRoom && rooms.every((r) => isFilled(r.floorArea) && !!r.name),
    issues: !anyRoom
      ? ["室が1つも登録されていません。"]
      : [
          ...rooms.filter((r) => !r.name).map(() => "室名が未入力の室があります。室名は帳票の識別に使用します。"),
          ...rooms.filter((r) => !isFilled(r.floorArea)).map((r) => `${r.name || "(室名未設定)"}: 面積が未入力です。`),
        ],
  };
  status.conditions = {
    done: anyRoom && rooms.every((r) => isFilled(r.indoorTemperature?.cooling) && isFilled(r.indoorTemperature?.heating)),
    issues: rooms
      .filter((r) => !isFilled(r.indoorTemperature?.cooling) || !isFilled(r.indoorTemperature?.heating))
      .map((r) => `${r.name || "(室名未設定)"}: 室内温度が未入力です(既定値26℃/22℃で計算されます)。`),
  };
  status.occupancy = {
    done: anyRoom && rooms.every((r) => r.occupancy !== null && r.occupancy !== "" && Number(r.occupancy) > 0),
    issues: rooms
      .filter((r) => !(Number(r.occupancy) > 0))
      .map((r) => `${r.name || "(室名未設定)"}: 在室人数が0人のため換気量が0m³/hになります。`),
  };
  status.internal = {
    done: anyRoom && rooms.some((r) => isFilled(r.internalHeat?.lightingWm2) || isFilled(r.internalHeat?.equipmentWm2)),
    optional: true,
    issues: [],
  };
  status.outdoorair = {
    done: anyRoom && rooms.some((r) => isFilled(r.outdoorAir?.volumeM3h) || !!r.outdoorAir?.ventilationType),
    optional: true,
    issues: [],
  };
  status.envelope = {
    done: anyRoom && rooms.some((r) => (r.envelope?.walls?.length || 0) > 0 || (r.windows?.length || 0) > 0),
    optional: true,
    issues: [],
  };
  const calcReady = status.building.done && status.rooms.done;
  status.calc = { done: calcReady, issues: calcReady ? [] : ["建物条件と室の入力を完了してください。"] };
  status.result = {
    done: !!calc && calc.totals.validRoomCount > 0,
    issues: calc && calc.totals.validRoomCount > 0 ? [] : ["計算可能な室がありません。"],
  };
  return status;
}

export function projectSummaryRows(project, calc) {
  return [
    ["案件名", project.projectName || "―"],
    ["階数", `${project.floors.length} 階`],
    ["室数", `${project.rooms.length} 室`],
    ["室面積合計", `${roomAreaTotal(project).toFixed(1)} m²`],
    ["設計用必要冷房能力", calc ? `${calc.totals.designLoadCoolingKW.toFixed(1)} kW` : "―"],
    ["設計用必要暖房能力", calc ? `${calc.totals.designLoadHeatingKW.toFixed(1)} kW` : "―"],
  ];
}

// ============================================================================
// 【系統集計】Room → System → Floor → Building
// STABROの集計単位(室・系統・階・建物)に対応する。
// 計算式は一切持たず、computeProject() の室別結果を合算するだけ(新しい式なし)。
// ============================================================================

/** 室別結果の1件から集計対象の負荷値を取り出す(status!=="ok"は0扱いせず除外)。 */
function aggregationValues(roomEntry) {
  const l = roomEntry.loadResult;
  if (!l || l.status !== "ok") return null;
  return {
    floorArea: l.floorAreaTotal || 0,
    coolingKW: l.designLoadCoolingKW || 0,
    heatingKW: l.designLoadHeatingKW || 0,
    requiredKW: l.requiredCapacityKW || 0,
    ventilationM3h: l.ventilationM3h || 0,
    occupantSensibleKW: l.occupantSensibleKW || 0,
    occupantLatentKW: l.occupantLatentKW || 0,
  };
}

function emptyAggregate(label) {
  return {
    label,
    roomCount: 0,
    validRoomCount: 0,
    floorArea: 0,
    designLoadCoolingKW: 0,
    designLoadHeatingKW: 0,
    requiredCapacityKW: 0,
    ventilationM3h: 0,
    occupantSensibleKW: 0,
    occupantLatentKW: 0,
    basis: null,
  };
}

function accumulate(agg, v) {
  agg.validRoomCount += 1;
  agg.floorArea += v.floorArea;
  agg.designLoadCoolingKW += v.coolingKW;
  agg.designLoadHeatingKW += v.heatingKW;
  agg.requiredCapacityKW += v.requiredKW;
  agg.ventilationM3h += v.ventilationM3h;
  agg.occupantSensibleKW += v.occupantSensibleKW;
  agg.occupantLatentKW += v.occupantLatentKW;
  return agg;
}

function finalizeAggregate(agg) {
  agg.basis = agg.designLoadCoolingKW >= agg.designLoadHeatingKW ? "cooling" : "heating";
  return agg;
}

/**
 * 室別結果を「室 → 系統 → 階 → 建物」で集計する。
 * 系統は Room.systemId、階は Room.floorId による。未設定は「未設定」として集約する。
 */
export function aggregateProject(project, calc) {
  const byRoom = [];
  const bySystemMap = new Map();
  const byFloorMap = new Map();

  for (const entry of calc.rooms) {
    const v = aggregationValues(entry);
    const room = entry.room;
    const floorId = room.floorId || "__none__";
    const systemId = room.systemId || "__none__";
    const floor = project.floors.find((f) => f.floorId === floorId);
    const floorLabel = floor ? floor.name : "階未設定";
    const systemLabel = systemId === "__none__" ? "系統未設定" : systemId;

    byRoom.push({
      roomId: room.roomId,
      roomName: room.name || "(室名未設定)",
      floorId: room.floorId,
      floorLabel,
      systemId: room.systemId,
      systemLabel,
      usage: room.usage || project.buildingTypeId,
      status: entry.loadResult?.status || "invalid",
      ...(v || { floorArea: 0, coolingKW: 0, heatingKW: 0, requiredKW: 0, ventilationM3h: 0, occupantSensibleKW: 0, occupantLatentKW: 0 }),
    });

    if (!v) continue;
    if (!bySystemMap.has(systemId)) bySystemMap.set(systemId, emptyAggregate(systemLabel));
    const sysAgg = bySystemMap.get(systemId);
    sysAgg.roomCount += 1;
    accumulate(sysAgg, v);

    if (!byFloorMap.has(floorId)) byFloorMap.set(floorId, emptyAggregate(floorLabel));
    const flrAgg = byFloorMap.get(floorId);
    flrAgg.roomCount += 1;
    accumulate(flrAgg, v);
  }

  const bySystem = [...bySystemMap.values()].map(finalizeAggregate);
  const byFloor = [...byFloorMap.values()].map(finalizeAggregate);

  const building = emptyAggregate(project.projectName || "建物全体");
  building.roomCount = project.rooms.length;
  for (const s of bySystem) {
    building.validRoomCount += s.validRoomCount;
    building.floorArea += s.floorArea;
    building.designLoadCoolingKW += s.designLoadCoolingKW;
    building.designLoadHeatingKW += s.designLoadHeatingKW;
    building.requiredCapacityKW += s.requiredCapacityKW;
    building.ventilationM3h += s.ventilationM3h;
    building.occupantSensibleKW += s.occupantSensibleKW;
    building.occupantLatentKW += s.occupantLatentKW;
  }
  finalizeAggregate(building);
  // 建物全体の必要容量は「各室必要容量の合算」ではなく、冷暖房それぞれの合算の大きい方。
  building.requiredCapacityKW = Math.max(building.designLoadCoolingKW, building.designLoadHeatingKW);
  building.basis = building.designLoadCoolingKW >= building.designLoadHeatingKW ? "cooling" : "heating";

  return { byRoom, bySystem, byFloor, building };
}
