// ============================================================================
// 【R6詳細方式の建物集計】室別の詳細計算結果を「同一時刻で合算」し、建物全体の
// 最大負荷を求める。
//
// 合算方式は professional-spec-data-model-v1.md §E の確定仕様
// (「同一時刻の負荷を合算し、その時系列の最大値を採用する」)に従う。
// これは加算のみであり、新しい係数・新しい計算式は一切持たない。
//
// 計算そのものは engine 側の computeDetailedLoad() が行い、ここは
// ・Room → 詳細方式入力への翻訳(engine.roomToDetailedLoadInput に委譲)
// ・時刻別結果の合算(加算)
// だけを行う。係数が未確認の項目は engine 側で 0 として扱われ notVerified に
// 記録されるため、ここで値を作ることはない。
// ============================================================================
import { DETAILED_HOURS, R6_LOAD_ITEMS, computeDetailedLoad, roomToDetailedLoadInput, selectEquipment } from "./r6-engine.mjs";

const COMPONENT_KEYS = [
  "envelopeKW",
  "windowConductionKW",
  "interiorWallKW",
  "windowSolarKW",
  "lightingKW",
  "equipmentKW",
  "occupantSensibleKW",
  "occupantLatentKW",
  "outdoorAirSensibleKW",
  "outdoorAirLatentKW",
  "infiltrationSensibleKW",
  "infiltrationLatentKW",
];

const zeroComponents = () => Object.fromEntries(COMPONENT_KEYS.map((k) => [k, 0]));

function addComponents(acc, src) {
  for (const key of COMPONENT_KEYS) acc[key] += Number(src?.[key]) || 0;
  return acc;
}

/**
 * 案件全体をR6詳細方式で計算する。
 * @param {object} project
 * @returns {{rooms: Array, validRoomCount: number, hourly: Array, peak: object,
 *   breakdown: object|null, heatingBreakdown: object|null,
 *   ventilationM3h: number, infiltrationVolumeM3h: number,
 *   designLoadCoolingKW: number, designLoadHeatingKW: number|null,
 *   requiredCapacityKW: number, basis: string,
 *   notVerified: Array<string>, warnings: Array<string>}}
 */
export function computeDetailedProject(project) {
  const rooms = project.rooms.map((room) => {
    const floor = project.floors.find((f) => f.floorId === room.floorId);
    const input = roomToDetailedLoadInput(project, room);
    return {
      room,
      floorLabel: floor ? floor.name : "階未設定",
      systemLabel: room.systemId || "系統未設定",
      input,
      load: computeDetailedLoad(input),
    };
  });

  const valid = rooms.filter((r) => r.load.status === "ok");

  const hourly = DETAILED_HOURS.map((hour) => ({
    hour,
    outdoorDB: null,
    coolingSensibleKW: 0,
    coolingLatentKW: 0,
    coolingTotalKW: 0,
    heatingTotalKW: 0,
    heatingAvailable: true,
    roomCount: 0,
  }));
  const hourIndexOf = new Map(hourly.map((h, i) => [h.hour, i]));

  for (const entry of valid) {
    for (const h of entry.load.hourlyResults) {
      const idx = hourIndexOf.get(h.hour);
      if (idx === undefined) continue;
      const acc = hourly[idx];
      acc.coolingSensibleKW += h.coolingSensibleKW;
      acc.coolingLatentKW += h.coolingLatentKW;
      acc.coolingTotalKW += h.coolingTotalKW;
      acc.heatingTotalKW = h.heatingTotalKW === null ? null : acc.heatingTotalKW + h.heatingTotalKW;
      if (acc.outdoorDB === null) acc.outdoorDB = h.outdoorDB;
      acc.roomCount += 1;
    }
  }
  // 1室でも暖房未算定(設計外気温度が未確認)なら、建物全体の暖房も未算定とする。
  for (const h of hourly) {
    if (h.heatingTotalKW === null) h.heatingAvailable = false;
    if (!h.heatingAvailable) h.heatingTotalKW = null;
  }

  const peakCooling = hourly.reduce((a, b) => (b.coolingTotalKW > a.coolingTotalKW ? b : a), hourly[0]);
  const heatHours = hourly.filter((h) => h.heatingTotalKW !== null);
  const peakHeating = heatHours.length
    ? heatHours.reduce((a, b) => (b.heatingTotalKW > a.heatingTotalKW ? b : a), heatHours[0])
    : null;

  // ピーク時刻の内訳(室別の同項目を加算するだけ)
  const breakdown = valid.length ? zeroComponents() : null;
  const heatingBreakdown = peakHeating ? zeroComponents() : null;
  let ventilationM3h = 0;
  let infiltrationVolumeM3h = 0;
  for (const entry of valid) {
    ventilationM3h += Number(entry.load.ventilationM3h) || 0;
    if (peakCooling) {
      const atPeak = entry.load.hourlyResults.find((h) => h.hour === peakCooling.hour);
      if (atPeak) {
        addComponents(breakdown, atPeak.components);
        infiltrationVolumeM3h += Number(atPeak.infiltrationVolumeM3h) || 0;
      }
    }
    if (peakHeating) {
      const atPeak = entry.load.hourlyResults.find((h) => h.hour === peakHeating.hour);
      if (atPeak) addComponents(heatingBreakdown, atPeak.heatingComponents);
    }
  }

  const margin = Number.isFinite(Number(project.marginPct)) ? Math.max(0, Number(project.marginPct)) : 0;
  const marginFactor = 1 + margin / 100;
  const designLoadCoolingKW = peakCooling.coolingTotalKW * marginFactor;
  const designLoadHeatingKW = peakHeating ? peakHeating.heatingTotalKW * marginFactor : null;
  const requiredCapacityKW = designLoadHeatingKW !== null
    ? Math.max(designLoadCoolingKW, designLoadHeatingKW)
    : designLoadCoolingKW;
  const basis = designLoadHeatingKW !== null && designLoadHeatingKW > designLoadCoolingKW ? "heating" : "cooling";

  const warnings = valid.length
    ? [...new Set(valid.flatMap((r) => r.load.warnings || []))]
    : ["計算可能な室がありません(室の面積と室名を入力してください)。"];

  // 機器選定は既存の selectEquipment() をそのまま呼ぶ(新しい選定ロジックは持たない)。
  // selectEquipment が必要とするのは status / requiredCapacityKW / floors / basis のみ。
  const equipmentSelection = valid.length
    ? selectEquipment({
        status: "ok",
        requiredCapacityKW: requiredCapacityKW,
        floors: project.floors.length,
        basis: basis,
      })
    : { status: "invalid", reason: "計算可能な室がないため、機種選定は行えません(要確認)。", candidates: [], recommended: null, selectionReasonText: null };

  return {
    rooms,
    validRoomCount: valid.length,
    hourly,
    peak: {
      coolingHour: peakCooling.hour,
      coolingKW: peakCooling.coolingTotalKW,
      coolingSensibleKW: peakCooling.coolingSensibleKW,
      coolingLatentKW: peakCooling.coolingLatentKW,
      heatingHour: peakHeating ? peakHeating.hour : null,
      heatingKW: peakHeating ? peakHeating.heatingTotalKW : null,
    },
    breakdown,
    heatingBreakdown,
    ventilationM3h,
    infiltrationVolumeM3h,
    designLoadCoolingKW,
    designLoadHeatingKW,
    requiredCapacityKW,
    basis,
    equipmentSelection,
    notVerified: [...new Set(valid.flatMap((r) => r.load.notVerified || []))],
    defaultedFromR6: [...new Set(valid.flatMap((r) => r.load.defaultedFromR6 || []))],
    coefficientSources: valid.length ? valid[0].load.coefficientSources || {} : {},
    warnings,
  };
}

/**
 * computeDetailedProject() の結果を、既存の detailed-report.mjs が期待する
 * 「1件の loadResult」形式に整形する(帳票整形の再利用。数値の再計算はしない)。
 * 合算方式は「同一時刻で室別負荷を加算」であり、加算のみで新しい式は持たない。
 */
export function toReportLoadResult(detailedProject) {
  const d = detailedProject;
  return {
    status: d.validRoomCount > 0 ? "ok" : "invalid",
    method: "detailed",
    hours: DETAILED_HOURS.slice(),
    hourlyResults: d.hourly.map((h) => ({
      hour: h.hour,
      outdoorDB: h.outdoorDB,
      outdoorRH: null,
      components: null,
      coolingSensibleKW: h.coolingSensibleKW,
      coolingLatentKW: h.coolingLatentKW,
      coolingTotalKW: h.coolingTotalKW,
      heatingTotalKW: h.heatingTotalKW,
      heatingComponents: null,
    })),
    peak: d.peak,
    breakdown: d.breakdown,
    heatingBreakdown: d.heatingBreakdown,
    ventilationM3h: d.ventilationM3h,
    infiltrationVolumeM3h: d.infiltrationVolumeM3h,
    designLoadCoolingKW: d.designLoadCoolingKW,
    designLoadHeatingKW: d.designLoadHeatingKW,
    basis: d.basis,
    requiredCapacityKW: d.requiredCapacityKW,
    loadItems: R6_LOAD_ITEMS,
    coefficientSources: d.coefficientSources,
    notVerified: d.notVerified,
    defaultedFromR6: d.defaultedFromR6,
    warnings: d.warnings,
  };
}

/**
 * detailed-report.mjs が期待する集計形式(室/系統/階/建物)を作る。
 * 室別の設計用負荷を加算するだけで、新しい式は持たない。
 */
export function aggregateDetailedProject(project, detailed) {
  const valuesOf = (entry) => {
    const l = entry.load;
    if (!l || l.status !== "ok") return null;
    return {
      floorArea: Number(entry.input?.floorAreaTotal) || 0,
      coolingKW: l.designLoadCoolingKW || 0,
      heatingKW: l.designLoadHeatingKW || 0,
      requiredKW: l.requiredCapacityKW || 0,
      ventilationM3h: l.ventilationM3h || 0,
    };
  };
  const empty = (label) => ({
    label, roomCount: 0, validRoomCount: 0, floorArea: 0,
    designLoadCoolingKW: 0, designLoadHeatingKW: 0, requiredCapacityKW: 0,
    ventilationM3h: 0, occupantSensibleKW: 0, occupantLatentKW: 0, basis: null,
  });
  const accumulate = (agg, v) => {
    agg.validRoomCount += 1;
    agg.floorArea += v.floorArea;
    agg.designLoadCoolingKW += v.coolingKW;
    agg.designLoadHeatingKW += v.heatingKW;
    agg.requiredCapacityKW += v.requiredKW;
    agg.ventilationM3h += v.ventilationM3h;
    return agg;
  };
  const finalize = (agg) => {
    agg.basis = agg.designLoadCoolingKW >= agg.designLoadHeatingKW ? "cooling" : "heating";
    return agg;
  };

  const byRoom = [];
  const bySystemMap = new Map();
  const byFloorMap = new Map();
  for (const entry of detailed.rooms) {
    const v = valuesOf(entry);
    const room = entry.room;
    const floorId = room.floorId || "__none__";
    const systemId = room.systemId || "__none__";
    const floor = project.floors.find((f) => f.floorId === floorId);
    byRoom.push({
      roomId: room.roomId,
      roomName: room.name || "(室名未設定)",
      floorId: room.floorId,
      floorLabel: floor ? floor.name : "階未設定",
      systemId: room.systemId,
      systemLabel: systemId === "__none__" ? "系統未設定" : systemId,
      usage: room.usage || project.buildingTypeId,
      status: entry.load?.status || "invalid",
      ...(v || { floorArea: 0, coolingKW: 0, heatingKW: 0, requiredKW: 0, ventilationM3h: 0 }),
    });
    if (!v) continue;
    if (!bySystemMap.has(systemId)) bySystemMap.set(systemId, empty(systemId === "__none__" ? "系統未設定" : systemId));
    const sysAgg = bySystemMap.get(systemId);
    sysAgg.roomCount += 1;
    accumulate(sysAgg, v);
    if (!byFloorMap.has(floorId)) byFloorMap.set(floorId, empty(floor ? floor.name : "階未設定"));
    const flrAgg = byFloorMap.get(floorId);
    flrAgg.roomCount += 1;
    accumulate(flrAgg, v);
  }

  const bySystem = [...bySystemMap.values()].map(finalize);
  const byFloor = [...byFloorMap.values()].map(finalize);
  const building = empty(project.projectName || "建物全体");
  building.roomCount = project.rooms.length;
  building.validRoomCount = detailed.validRoomCount;
  building.floorArea = bySystem.reduce((a, s) => a + s.floorArea, 0);
  building.designLoadCoolingKW = detailed.designLoadCoolingKW;
  building.designLoadHeatingKW = detailed.designLoadHeatingKW ?? 0;
  building.ventilationM3h = detailed.ventilationM3h;
  finalize(building);
  building.requiredCapacityKW = detailed.requiredCapacityKW;
  building.basis = detailed.basis;
  return { byRoom, bySystem, byFloor, building };
}

/**
 * 機器表(機器項目)を作る。数値は既存の selectEquipment() の結果と EQUIPMENT_DB の
 * 実在型式のみを並べ替えて表形式にするだけで、新しい選定・新しい計算は行わない。
 * 系統別の必要能力は aggregateDetailedProject() の系統集計(合算のみ)を使う。
 *
 * @param {object} detailed computeDetailedProject() の戻り値
 * @param {object} aggregate aggregateDetailedProject() の戻り値
 * @returns {{status: string, rows: Array, recommended: object|null, selectionReasonText: string|null, reason: string|null}}
 */
export function buildEquipmentSchedule(detailed, aggregate) {
  const selection = detailed?.equipmentSelection;
  if (!selection || selection.status !== "ok" || !selection.recommended) {
    return {
      status: "invalid",
      reason: selection?.reason || "必要能力が算出できないため、機器表を作成できません(要確認)。",
      rows: [],
      recommended: null,
      selectionReasonText: null,
    };
  }

  const recommended = selection.recommended;

  // 系統別の必要能力(既存の系統集計=合算のみ)。系統ごとに同じ既存 selectEquipment を当てる。
  const systemRows = (aggregate?.bySystem || [])
    .filter((s) => s.validRoomCount > 0 && s.requiredCapacityKW > 0)
    .map((s) => {
      const picked = selectEquipment({
        status: "ok",
        requiredCapacityKW: s.requiredCapacityKW,
        floors: 1,
        basis: s.basis,
      });
      const r = picked.status === "ok" ? picked.recommended : null;
      return {
        systemLabel: s.label,
        roomCount: s.roomCount,
        requiredCapacityKW: s.requiredCapacityKW,
        basis: s.basis,
        size: r ? r.size : null,
        code: r ? r.code : null,
        hp: r ? r.hp : null,
        count: r ? r.count : null,
        installedKW: r ? r.installedKW : null,
        surplusPct: r ? r.surplusPct : null,
        selectionType: r ? r.selectionType : null,
        realModels: r ? r.realModels : [],
      };
    });

  // 建物全体の機器項目(推奨クラス。台数・設置容量・余裕率は selectEquipment の値そのまま)
  const buildingRow = {
    scope: "建物全体",
    requiredCapacityKW: detailed.requiredCapacityKW,
    basis: detailed.basis,
    size: recommended.size,
    code: recommended.code,
    hp: recommended.hp,
    count: recommended.count,
    installedKW: recommended.installedKW,
    surplusPct: recommended.surplusPct,
    selectionType: recommended.selectionType,
    realModels: recommended.realModels,
  };

  // 実在型式の明細(型式ごとに1行)。推奨クラスに実在型式がある場合のみ。
  const modelRows = recommended.realModels.map((m) => ({
    scope: `建物全体 / ${recommended.size.toFixed(1)}kWクラス`,
    maker: m.maker,
    model: m.model,
    coolingKW: m.coolingKW,
    heatingKW: m.heatingKW,
    indoorType: m.indoorType,
    config: m.config,
    power: m.power,
    source: m.source || null,
  }));

  return {
    status: "ok",
    reason: null,
    recommended: buildingRow,
    selectionReasonText: selection.selectionReasonText,
    systemRows,
    modelRows,
    rows: [buildingRow, ...systemRows],
  };
}

