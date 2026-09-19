// ============================================================================
// hvac-calc-engine.js  (v3 — 2026-09-02改訂)
// 空調負荷計算・機器選定の純粋計算エンジン(React非依存)
// 同じ入力値なら必ず同じ結果になる決定論的な関数群。
// hvac-load-calculator.jsx 内に埋め込まれているものと同一ロジックです
// (jsxは単一ファイルのブラウザartifactのためexternal importができず、
//  このファイルとjsx内のロジックは手動で同期しています。既知の制約)
//
// 【v3での変更点】
// 1. 「概算負荷(roughLoad)」と「設計用必要負荷(designLoad)」を明確に分離。
//    人体負荷は既定では概算負荷に加算しない(二重計上リスクの回避)。
//    ユーザーが明示的に includeOccupantLoad=true にした場合のみ加算する。
// 2. 面積の定義を明確化するフィールドを追加(floorAreaTotal, areaInputMode)。
// 3. 機種選定結果に selectionType("formal"=実在機器による正式選定 /
//    "provisional"=容量クラス仮選定)を追加し、表示側で混同できない構造にした。
// 4. EQUIPMENT_DBに5.6kWクラス(2馬力/50形)の実在型式を追加。
//    全エントリに source{name, url, confirmedDate} を持たせ追跡可能にした。
// ============================================================================

// ============================================================================
// 【R6 詳細方式(積み上げ計算)】
// 建築設備設計基準 令和6年版に準拠した積み上げ方式。既存の原単位方式
// (computeLoad / selectEquipment)は一切変更せず、追加のみを行う。
// 係数は確認できた値のみ採用し、未確認は null + NOT VERIFIED として返す。
// ============================================================================

// --- 空気の標準物性値(設計係数ではなく物理定数) ---
const AIR_PROPERTIES = {
  densityKgPerM3: 1.2,
  specificHeatKJPerKgK: 1.006,
  vaporizationKJPerKg: 2501,
  standardPressureKPa: 101.325,
  source: { name: "湿り空気の標準物性値(空気調和工学の一般値)", url: null, confirmedDate: "2026-09-15" },
  status: "confirmed",
};

// 時刻別集計の代表時刻
const DETAILED_HOURS = [9, 12, 14, 16];

// 表面熱伝達抵抗 m²·K/W。JIS A 2102-1(建築物の熱性能)等で用いられる一般値。
// 材料構成から熱通過率Uを算定する場合にのみ使用する(実測値がある場合はuValueを直接指定)。
const SURFACE_RESISTANCE = {
  indoor: 0.11,
  outdoor: 0.04,
  source: {
    name: "JIS A 2102-1 / 建築物の熱性能計算における表面熱伝達抵抗の一般値",
    url: null,
    confirmedDate: "2026-09-15",
  },
  status: "provisional",
};

/**
 * 材料構成(厚さ・熱伝導率)から熱通過率Uを算定する。
 * R = Ri + Σ(t/λ) + Ro、U = 1/R という定義式のみ。新しい係数は追加しない。
 * uValue が直接指定されている場合はそちらを優先する。
 */
function uValueFromMaterials(materials) {
  if (!Array.isArray(materials) || materials.length === 0) return null;
  let r = SURFACE_RESISTANCE.indoor + SURFACE_RESISTANCE.outdoor;
  for (const m of materials) {
    const thickness = toNum(m.thicknessM) ?? (toNum(m.thicknessMm) !== null ? toNum(m.thicknessMm) / 1000 : null);
    const lambda = toNum(m.conductivityWmK);
    if (thickness === null || lambda === null || lambda === 0 || thickness < 0) return null;
    r += thickness / lambda;
  }
  return r > 0 ? 1 / r : null;
}

/** 面(wall/window/roof/floor)のU値。uValue優先、無ければ材料構成から算定。 */
function resolveUValue(surface) {
  const direct = toNum(surface.uValue);
  if (direct !== null) return direct;
  return uValueFromMaterials(surface.materials);
}

// 建築設備設計基準 令和6年版 第4編第1章第2節(3)(4)の負荷項目(原文)。
// 国土交通省公開PDF: https://www.mlit.go.jp/gobuild/content/001390961.pdf (page 14)
const R6_ITEM_SOURCE = {
  name: "建築設備設計基準 令和6年版 第4編第1章第2節 空調熱負荷計算(3)(4)",
  url: "https://www.mlit.go.jp/gobuild/content/001390961.pdf",
  page: 14,
  confirmedDate: "2026-09-15",
};
const R6_LOAD_ITEMS = {
  cooling: [
    { no: 1, label: "構造体負荷(顕熱)", implemented: true, component: "envelopeKW" },
    { no: 2, label: "ガラス面負荷(顕熱)", implemented: true, component: "windowConductionKW + windowSolarKW" },
    { no: 3, label: "照明負荷(顕熱)", implemented: true, component: "lightingKW" },
    { no: 4, label: "人体負荷(潜熱及び顕熱)", implemented: true, component: "occupantSensibleKW + occupantLatentKW" },
    { no: 5, label: "その他の室内負荷(潜熱及び顕熱)", implemented: "partial", component: "equipmentKW(顕熱のみ。その他機器の潜熱原単位が未確認)" },
    { no: 6, label: "すきま風負荷(潜熱及び顕熱)", implemented: true, component: "infiltrationSensibleKW + infiltrationLatentKW" },
    { no: 7, label: "外気負荷(潜熱及び顕熱)", implemented: true, component: "outdoorAirSensibleKW + outdoorAirLatentKW" },
    { no: 8, label: "ダクト及び配管表面からの負荷、空気漏洩による負荷、送風機及びポンプ運転による負荷、間欠空調による蓄熱負荷", implemented: false, component: null },
  ],
  heating: [
    { no: 1, label: "構造体負荷(顕熱)", implemented: true, component: "envelopeKW" },
    { no: 2, label: "ガラス面負荷(顕熱)", implemented: true, component: "windowConductionKW" },
    { no: 3, label: "すきま風負荷(潜熱及び顕熱)", implemented: true, component: "infiltrationSensibleKW" },
    { no: 4, label: "外気負荷(潜熱及び顕熱)", implemented: true, component: "outdoorAirSensibleKW" },
    { no: 5, label: "ダクト及び配管表面からの負荷、空気漏洩による負荷、送風機及びポンプ運転による負荷、間欠空調による蓄熱負荷", implemented: false, component: null },
  ],
  source: R6_ITEM_SOURCE,
};

// --- 設計用屋外条件(冷房 危険率2.5%) ---
// 原本未入手のため二次資料経由。冬期(暖房)値・未転記地区は null。
const R6_DESIGN_OUTDOOR_SOURCE = {
  name: "建築設備設計基準 令和6年版 設計用外気条件(冷房 危険率2.5%)。二次資料経由の転記(原本未確認)",
  url: "https://akisho-workshop.com/archives/16216",
  confirmedDate: "2026-09-15",
};
const R6_DESIGN_OUTDOOR = {
  hokkaido: { city: "札幌", coolingDB: 30.7, coolingRH: 59.2, heatingDB: null },
  tohoku: { city: "仙台", coolingDB: 32.9, coolingRH: 59.0, heatingDB: null },
  kanto: { city: "東京", coolingDB: 34.8, coolingRH: 58.0, heatingDB: null },
  chubu: { city: "名古屋", coolingDB: 35.4, coolingRH: 50.6, heatingDB: null },
  kansai: { city: "大阪", coolingDB: 34.9, coolingRH: 53.1, heatingDB: null },
  chugoku_shikoku: { city: null, coolingDB: null, coolingRH: null, heatingDB: null },
  kyushu: { city: "福岡", coolingDB: 35.1, coolingRH: 57.3, heatingDB: null },
  okinawa: { city: "那覇", coolingDB: 32.9, coolingRH: 70.9, heatingDB: null },
};

// --- 建築設備設計基準 準拠の室内発熱・換気 基準値 ---
const R6_INTERNAL_LOAD_SOURCE = {
  name: "建築設備設計基準 令和6年版(設計要領第六集・北九州市ZEB化指針が同基準の目安値として引用)",
  url: "https://www.city.kitakyushu.lg.jp/files/001214813.pdf",
  confirmedDate: "2026-09-15",
};
const R6_INTERNAL_LOAD = {
  lightingWm2: { office: 9, meeting: 6 },
  equipmentWm2: { officeMin: 15, officeMax: 30, meetingMin: 10, meetingMax: 15 },
  occupantSensibleWPerPerson: 69,
  occupantLatentWPerPerson: 53,
  occupantAtRoomTempC: 26,
  ventilationM3hPerPerson: 30,
  occupantDensityPerM2: { officeMin: 0.1, officeMax: 0.2, meetingMin: 0.3, meetingMax: 0.6 },
  source: R6_INTERNAL_LOAD_SOURCE,
  status: "provisional",
};

// null/""/undefined は「未入力」として扱う。
// Number(null)===0 を有効値と誤認すると、未転記の係数が「0℃」「0W/m²」として
// 計算に混入するため、既存 roomToLegacyLoadInput と同一の考え方で厳密に判定する。
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// 飽和蒸気圧 kPa(Tetensの式)
function saturationVaporPressureKPa(tC) {
  if (!Number.isFinite(tC)) return null;
  return 0.61078 * Math.exp((17.2694 * tC) / (tC + 237.29));
}

// 絶対湿度 kg/kg'(標準大気圧)
function humidityRatioKgPerKg(tC, rhPct) {
  const ps = saturationVaporPressureKPa(tC);
  if (ps === null || !Number.isFinite(rhPct)) return null;
  const pv = (Math.max(0, Math.min(100, rhPct)) / 100) * ps;
  const pt = AIR_PROPERTIES.standardPressureKPa;
  if (pt - pv <= 0) return null;
  return (0.622 * pv) / (pt - pv);
}

// 貫流負荷 kW = U[W/m²K] × A[m²] × ΔT[K] / 1000
function conductionKW(uValue, areaM2, deltaTK) {
  if (!Number.isFinite(uValue) || !Number.isFinite(areaM2) || !Number.isFinite(deltaTK)) return 0;
  return (uValue * areaM2 * deltaTK) / 1000;
}

// 日射負荷 kW = SC × I[W/m²] × A[m²] / 1000
function solarKW(scValue, irradianceWm2, areaM2) {
  if (!Number.isFinite(scValue) || !Number.isFinite(irradianceWm2) || !Number.isFinite(areaM2)) return 0;
  return (scValue * irradianceWm2 * areaM2) / 1000;
}

// 空気搬送の顕熱 kW = ρ×cp×V[m³/h]×ΔT / 3600
function airSensibleKW(volumeM3h, deltaTK) {
  if (!Number.isFinite(volumeM3h) || !Number.isFinite(deltaTK)) return 0;
  return (AIR_PROPERTIES.densityKgPerM3 * AIR_PROPERTIES.specificHeatKJPerKgK * volumeM3h * deltaTK) / 3600;
}

// 空気搬送の潜熱 kW = ρ×r×V×Δx / 3600
function airLatentKW(volumeM3h, deltaXKgPerKg) {
  if (!Number.isFinite(volumeM3h) || !Number.isFinite(deltaXKgPerKg)) return 0;
  return (AIR_PROPERTIES.densityKgPerM3 * AIR_PROPERTIES.vaporizationKJPerKg * volumeM3h * deltaXKgPerKg) / 3600;
}

/**
 * R6 詳細方式(積み上げ)。1室分の負荷を時刻別に積み上げ、最大負荷を求める。
 * 既存 computeLoad は変更しない。係数が未確認の項目は計算に0として寄与させ、
 * notVerified に列挙する(値の発明は行わない)。
 */
function computeDetailedLoad(input) {
  const p = input || {};
  const warnings = [];
  const notVerified = [];
  const defaultedFromR6 = [];

  const area = toNum(p.floorAreaTotal);
  if (area === null || area <= 0) {
    return {
      status: "invalid", method: "detailed",
      reason: "面積が0以下、または未入力です。詳細方式では計算できません(要確認)。",
      warnings, notVerified, defaultedFromR6, coverage: [],
    };
  }

  const usage = p.usage || p.buildingTypeId || null;
  const nOccupants = Math.max(0, toNum(p.occupants) ?? 0);
  const ceilingHeight = toNum(p.ceilingHeight);
  const roomVolumeM3 = ceilingHeight !== null ? area * ceilingHeight : null;
  if (roomVolumeM3 === null) notVerified.push("室容積(天井高が未入力のため、換気回数法のすきま風を算定できません)");

  const tinCooling = toNum(p.coolingSetTemp) ?? 26;
  const tinHeating = toNum(p.heatingSetTemp) ?? 22;
  const rhInCooling = toNum(p.indoorRHCooling) ?? 50;
  const rhInHeating = toNum(p.indoorRHHeating) ?? 40;

  const hours = Array.isArray(p.hours) && p.hours.length ? p.hours.slice() : DETAILED_HOURS.slice();
  const regionOutdoor = R6_DESIGN_OUTDOOR[p.regionId] || null;
  if (!regionOutdoor || regionOutdoor.coolingDB === null) {
    notVerified.push("設計用屋外条件(この地区の値は未転記)");
  }

  // --- 内部発熱(基準値で補完した場合は defaultedFromR6 に記録) ---
  const isMeeting = usage === "meeting" || usage === "conference";
  let lightingWm2 = toNum(p.lightingWm2);
  if (!Number.isFinite(lightingWm2)) {
    const r6 = isMeeting
      ? R6_INTERNAL_LOAD.lightingWm2.meeting
      : (usage === "office" ? R6_INTERNAL_LOAD.lightingWm2.office : null);
    if (r6 !== null) { lightingWm2 = r6; defaultedFromR6.push(`照明原単位 ${r6}W/m²(基準値)`); }
    else { lightingWm2 = 0; notVerified.push("照明原単位(用途に対応する基準値が未確認)"); }
  }
  let equipmentWm2 = toNum(p.equipmentWm2);
  if (!Number.isFinite(equipmentWm2)) {
    const r6 = isMeeting ? R6_INTERNAL_LOAD.equipmentWm2.meetingMax : R6_INTERNAL_LOAD.equipmentWm2.officeMax;
    if (r6 !== undefined) { equipmentWm2 = r6; defaultedFromR6.push(`機器原単位 ${r6}W/m²(基準値の上限)`); }
    else { equipmentWm2 = 0; notVerified.push("機器原単位"); }
  }
  const occSensibleW = toNum(p.occupantSensibleWPerPerson) ?? R6_INTERNAL_LOAD.occupantSensibleWPerPerson;
  const occLatentW = toNum(p.occupantLatentWPerPerson) ?? R6_INTERNAL_LOAD.occupantLatentWPerPerson;
  const occSensibleKW = (nOccupants * occSensibleW) / 1000;
  const occLatentKW = (nOccupants * occLatentW) / 1000;
  const lightingKW = (area * lightingWm2) / 1000;
  const equipmentKW = (area * equipmentWm2) / 1000;

  // --- 外皮 ---
  const walls = Array.isArray(p.walls) ? p.walls : [];
  const windows = Array.isArray(p.windows) ? p.windows : [];
  const interiorWalls = Array.isArray(p.interiorWalls) ? p.interiorWalls : [];
  const roof = p.roof || null;
  const floorEnv = p.floorEnvelope || null;
  const interiorDeltaTK = toNum(p.interiorDeltaTK) ?? 0;

  const uaOf = (w) => { const u = resolveUValue(w); const a = toNum(w.area); return u !== null && a !== null ? u * a : 0; };
  const wallUA = walls.reduce((s, w) => s + uaOf(w), 0);
  if (walls.some((w) => resolveUValue(w) === null)) notVerified.push("外壁の熱貫流率U値(未入力の面があります)");
  const winUASum = windows.reduce((s, w) => s + uaOf(w), 0);
  if (windows.some((w) => resolveUValue(w) === null)) notVerified.push("窓の熱貫流率U値(未入力の面があります)");
  const roofUA = roof ? uaOf(roof) : 0;
  if (roof && resolveUValue(roof) === null) notVerified.push("屋根の熱貫流率U値");
  const floorUA = floorEnv ? uaOf(floorEnv) : 0;
  if (floorEnv && resolveUValue(floorEnv) === null) notVerified.push("床の熱貫流率U値");
  if (!floorEnv) notVerified.push("床の熱貫流率U値・暖房設計用地中温度");
  if (floorEnv && toNum(p.groundTemperature) === null) {
    notVerified.push("暖房設計用地中温度(未転記。床は冷房・暖房とも寄与0として計算しています)");
  }
  const interiorUA = interiorWalls.reduce((s, w) => s + uaOf(w), 0);

  // --- 日射(ガラス面標準日射熱取得は地区データ。未転記のため入力値を使用) ---
  const solarWm2 = p.solarWm2 && typeof p.solarWm2 === "object" ? p.solarWm2 : null;
  if (!solarWm2) notVerified.push("ガラス面標準日射熱取得(地区データ。時刻・方位別日射量が未転記)");

  // --- 外気・換気・すきま風 ---
  const heatRecovery = p.heatRecovery || {};
  const recoveryEfficiencyInput = toNum(heatRecovery.efficiency);
  const recoveryEff = heatRecovery.enabled === true && recoveryEfficiencyInput !== null
    ? Math.max(0, Math.min(1, recoveryEfficiencyInput / 100)) : 0;
  if (heatRecovery.enabled === true && recoveryEff === 0) notVerified.push("熱交換効率");

  let outdoorAirVolumeM3h = toNum(p.outdoorAirVolumeM3h);
  if (outdoorAirVolumeM3h === null) {
    outdoorAirVolumeM3h = nOccupants * R6_INTERNAL_LOAD.ventilationM3hPerPerson;
    if (nOccupants > 0) defaultedFromR6.push(`外気量 ${R6_INTERNAL_LOAD.ventilationM3hPerPerson}m³/(h・人)(基準値)×${nOccupants}人`);
  }

  if (interiorWalls.length && toNum(p.interiorDeltaTK) === null) notVerified.push("内壁の温度差(未入力。内壁負荷は0として計算しています)");

  const inf = p.infiltration || {};
  const isWindward = inf.windwardSide === true;
  // 建築設備設計基準: 換気回数は入口が風上側で夏期2回・冬期3〜4回、それ以外で夏期1回・冬期1〜2回
  const explicitAirChangeCooling = toNum(inf.airChangeRateCooling);
  const infAirChangeCooling = explicitAirChangeCooling !== null
    ? explicitAirChangeCooling
    : (inf.method === "air_change" ? (isWindward ? 2 : 1) : null);
  if (inf.method === "air_change" && explicitAirChangeCooling === null) {
    defaultedFromR6.push(`すきま風 換気回数 夏期${isWindward ? 2 : 1}回(基準値)`);
  }
  const infAirChangeHeating = toNum(inf.airChangeRateHeating);
  if (inf.method === "air_change" && infAirChangeHeating === null) {
    notVerified.push("すきま風 冬期換気回数(基準は3〜4回/1〜2回の範囲で、単一値を特定できないため要入力)");
  }
  const unitLeakage = toNum(inf.unitLeakageM3hPerM2);
  const windowAreaTotal = windows.reduce((s, w) => s + (toNum(w.area) ?? 0), 0);
  const infiltrationConfigured = inf.method !== undefined && inf.method !== null && inf.method !== "";
  if (infiltrationConfigured && unitLeakage === null) {
    notVerified.push("単位すきま風量(サッシ気密性区分別の表が未転記)");
  }

  // 時刻別外気温度・湿度(地区データ。未転記のため入力値。無い場合は代表値で全時刻一定)
  const hourlyOutdoor = p.hourlyOutdoorDB && typeof p.hourlyOutdoorDB === "object" ? p.hourlyOutdoorDB : null;
  if (!hourlyOutdoor) notVerified.push("時刻別外気温度(地区データ。代表値で全時刻一定として計算)");
  const hourlyOutdoorRH = p.hourlyOutdoorRH && typeof p.hourlyOutdoorRH === "object" ? p.hourlyOutdoorRH : null;
  const heatingOutdoorDB = toNum(p.heatingOutdoorDB) ?? (regionOutdoor ? toNum(regionOutdoor.heatingDB) : null);
  if (heatingOutdoorDB === null) notVerified.push("暖房用 設計外気温度(冬期。未転記のため暖房負荷を確定できません)");

  const xInCooling = humidityRatioKgPerKg(tinCooling, rhInCooling);
  const xInHeating = humidityRatioKgPerKg(tinHeating, rhInHeating);

  const hourlyResults = hours.map((hour) => {
    const hKey = String(hour);
    const toutCooling = (hourlyOutdoor ? toNum(hourlyOutdoor[hKey]) : null) ?? (regionOutdoor ? toNum(regionOutdoor.coolingDB) : null);
    const rhOut = (hourlyOutdoorRH ? toNum(hourlyOutdoorRH[hKey]) : null) ?? (regionOutdoor ? toNum(regionOutdoor.coolingRH) : null);
    const xOut = humidityRatioKgPerKg(toutCooling, rhOut);

    // 冷房(貫流 + 日射 + 内部発熱 + 外気 + すきま風)
    const dTCoolingOut = toutCooling === null ? 0 : toutCooling - tinCooling;
    const dTCoolingGround = 0; // 地中温度が未転記のため床は寄与0(notVerifiedに記載)
    const envCooling = conductionKW(wallUA, 1, dTCoolingOut) + conductionKW(roofUA, 1, dTCoolingOut) + conductionKW(floorUA, 1, dTCoolingGround);
    const winCooling = conductionKW(winUASum, 1, dTCoolingOut);
    const interiorCooling = conductionKW(interiorUA, 1, interiorDeltaTK);
    const winSolarKW = windows.reduce((s, w) => {
      const orient = w.orientation || "s";
      const irr = solarWm2 && solarWm2[orient] ? toNum(solarWm2[orient][hKey]) : null;
      return s + solarKW(toNum(w.scValue), irr, toNum(w.area));
    }, 0);
    const oaSensibleCooling = airSensibleKW(outdoorAirVolumeM3h, dTCoolingOut) * (1 - recoveryEff);
    const oaLatentCooling = xOut === null ? 0 : airLatentKW(outdoorAirVolumeM3h, xOut - xInCooling) * (1 - recoveryEff);
    const infVolumeCooling = roomVolumeM3 !== null && infAirChangeCooling !== null ? roomVolumeM3 * infAirChangeCooling : 0;
    const infWindowCooling = Number.isFinite(unitLeakage) ? windowAreaTotal * unitLeakage : 0;
    const infVolumeCoolingTotal = infVolumeCooling + infWindowCooling;
    const infSensibleCooling = airSensibleKW(infVolumeCoolingTotal, dTCoolingOut);
    const infLatentCooling = xOut === null ? 0 : airLatentKW(infVolumeCoolingTotal, xOut - xInCooling);

    const coolingSensibleKW = envCooling + winCooling + interiorCooling + winSolarKW + lightingKW + equipmentKW + occSensibleKW + oaSensibleCooling + infSensibleCooling;
    const coolingLatentKW = occLatentKW + oaLatentCooling + infLatentCooling;
    const coolingTotalKW = coolingSensibleKW + coolingLatentKW;

    // 暖房(貫流 + 外気顕熱 + すきま風顕熱。日射・内部発熱は安全側で見込まない)
    let heatingTotalKW = null;
    let heatingComponents = null;
    if (heatingOutdoorDB !== null) {
      const dTHeating = tinHeating - heatingOutdoorDB;
      const dTHeatingGround = 0; // 暖房設計用地中温度が未転記のため床は寄与0
      const envHeating = conductionKW(wallUA, 1, dTHeating) + conductionKW(roofUA, 1, dTHeating) + conductionKW(floorUA, 1, dTHeatingGround);
      const winHeating = conductionKW(winUASum, 1, dTHeating);
      const interiorHeating = conductionKW(interiorUA, 1, interiorDeltaTK);
      const oaSensibleHeating = airSensibleKW(outdoorAirVolumeM3h, dTHeating) * (1 - recoveryEff);
      const infVolumeHeating = roomVolumeM3 !== null && infAirChangeHeating !== null ? roomVolumeM3 * infAirChangeHeating : 0;
      const infVolumeHeatingTotal = infVolumeHeating + infWindowCooling;
      const infSensibleHeating = airSensibleKW(infVolumeHeatingTotal, dTHeating);
      heatingComponents = {
        envelopeKW: envHeating,
        windowConductionKW: winHeating,
        interiorWallKW: interiorHeating,
        outdoorAirSensibleKW: oaSensibleHeating,
        infiltrationSensibleKW: infSensibleHeating,
      };
      heatingTotalKW = envHeating + winHeating + interiorHeating + oaSensibleHeating + infSensibleHeating;
    }

    return {
      hour,
      outdoorDB: toutCooling,
      outdoorRH: rhOut,
      components: {
        envelopeKW: envCooling,
        windowConductionKW: winCooling,
        interiorWallKW: interiorCooling,
        windowSolarKW: winSolarKW,
        lightingKW,
        equipmentKW,
        occupantSensibleKW: occSensibleKW,
        occupantLatentKW: occLatentKW,
        outdoorAirSensibleKW: oaSensibleCooling,
        outdoorAirLatentKW: oaLatentCooling,
        infiltrationSensibleKW: infSensibleCooling,
        infiltrationLatentKW: infLatentCooling,
      },
      infiltrationVolumeM3h: infVolumeCoolingTotal,
      coolingSensibleKW,
      coolingLatentKW,
      coolingTotalKW,
      heatingTotalKW,
      heatingComponents,
    };
  });

  const peakCooling = hourlyResults.reduce((a, b) => (b.coolingTotalKW > a.coolingTotalKW ? b : a), hourlyResults[0]);
  const usableHeating = hourlyResults.filter((r) => r.heatingTotalKW !== null);
  const peakHeating = usableHeating.length
    ? usableHeating.reduce((a, b) => (b.heatingTotalKW > a.heatingTotalKW ? b : a), usableHeating[0])
    : null;

  const margin = Number.isFinite(Number(p.marginPct)) ? Math.max(0, Number(p.marginPct)) : 0;
  const marginFactor = 1 + margin / 100;
  const designLoadCoolingKW = peakCooling.coolingTotalKW * marginFactor;
  const designLoadHeatingKW = peakHeating ? peakHeating.heatingTotalKW * marginFactor : null;
  const basis = designLoadHeatingKW !== null && designLoadHeatingKW > designLoadCoolingKW ? "heating" : "cooling";
  const requiredCapacityKW = designLoadHeatingKW !== null
    ? Math.max(designLoadCoolingKW, designLoadHeatingKW)
    : designLoadCoolingKW;

  if (peakCooling.coolingTotalKW <= 0) warnings.push("冷房負荷が0kWです。外皮・窓・内部発熱・外気の入力状況を確認してください(要確認)。");
  if (designLoadHeatingKW === null) warnings.push("暖房負荷は設計外気温度(冬期)が未確認のため算定していません(要確認)。");

  return {
    status: "ok",
    method: "detailed",
    warnings,
    notVerified,
    defaultedFromR6,
    hours,
    hourlyResults,
    peak: {
      coolingHour: peakCooling.hour,
      coolingKW: peakCooling.coolingTotalKW,
      coolingSensibleKW: peakCooling.coolingSensibleKW,
      coolingLatentKW: peakCooling.coolingLatentKW,
      heatingHour: peakHeating ? peakHeating.hour : null,
      heatingKW: peakHeating ? peakHeating.heatingTotalKW : null,
    },
    breakdown: peakCooling.components,
    heatingBreakdown: peakHeating ? peakHeating.heatingComponents : null,
    ventilationM3h: outdoorAirVolumeM3h,
    infiltrationVolumeM3h: peakCooling.infiltrationVolumeM3h,
    designLoadCoolingKW,
    designLoadHeatingKW,
    basis,
    requiredCapacityKW,
    loadItems: R6_LOAD_ITEMS,
    coefficientSources: {
      airProperties: AIR_PROPERTIES.source,
      designOutdoor: R6_DESIGN_OUTDOOR_SOURCE,
      internalLoad: R6_INTERNAL_LOAD_SOURCE,
      loadItems: R6_ITEM_SOURCE,
      surfaceResistance: SURFACE_RESISTANCE.source,
    },
  };
}

// ===SHARED-LOGIC-START===
// ↓このマーカーからSHARED-LOGIC-ENDまでのブロックは、hvac-load-calculator.jsx に
// 一字一句同一のテキストとして埋め込まれています(Single Source of Truthの実体)。
// 変更する場合は、必ずこのブロックをコピーしてjsx側の対応箇所を置き換えてください。
// 整合性は hvac-calc-engine.sync-check.js で機械的に検証できます。

// 【構造変更 2026-09-02】各原単位をvalue/unit/status/source/confirmedDate/noteを持つ
// メタデータオブジェクトに変更。数値そのもの(value)は一切変更していません。
// status: "provisional"(正式根拠未確認の暫定値) | "verified"(規格原本等で確認済み・現時点で該当なし)
function wm2(value, note) {
  return {
    value,
    unit: "W/m2",
    status: "provisional",
    source: "本アプリの暫定仮定値。SHASE-S112等の正式根拠は未確認(2026-09-02時点)。",
    confirmedDate: null,
    note: note || "正式な国基準・SHASE-S112の数値ではありません。calculation-method-spec-v3.md参照。",
  };
}

const BUILDING_TYPES = [
  { id: "office", label: "オフィス", coolingWm2: wm2(172), heatingWm2: wm2(122), ventPerPerson: 30 },
  { id: "retail", label: "店舗(物販)", coolingWm2: wm2(209), heatingWm2: wm2(151), ventPerPerson: 30 },
  { id: "restaurant", label: "飲食店", coolingWm2: wm2(244), heatingWm2: wm2(174), ventPerPerson: 30 },
  { id: "hotel", label: "ホテル客室", coolingWm2: wm2(116), heatingWm2: wm2(105), ventPerPerson: 25 },
  { id: "hospital", label: "病院(病室)", coolingWm2: wm2(140), heatingWm2: wm2(116), ventPerPerson: 25 },
  { id: "school", label: "学校(教室)", coolingWm2: wm2(105), heatingWm2: wm2(93), ventPerPerson: 20 },
  { id: "factory", label: "工場・倉庫", coolingWm2: wm2(93), heatingWm2: wm2(81), ventPerPerson: 15 },
  { id: "residential", label: "集合住宅", coolingWm2: wm2(81), heatingWm2: wm2(70), ventPerPerson: 20 },
];
// 【出典】上記W/m²原単位は、いずれも「本アプリの概算仮定」です。外部の公的資料・
// 業界標準資料と突き合わせた数値ではありません。人体発熱(人体顕熱・潜熱)が
// この原単位にあらかじめ含まれているか否かは確認できていません(未確定)。
// → 詳細は本ファイル末尾の「244W/m²等の原単位に関する確認結果」を参照。

const REGIONS = [
  { id: "hokkaido", label: "北海道", coolingFactor: 0.75, heatingFactor: 1.45 },
  { id: "tohoku", label: "東北", coolingFactor: 0.85, heatingFactor: 1.25 },
  { id: "kanto", label: "関東", coolingFactor: 1.0, heatingFactor: 1.0 },
  { id: "chubu", label: "中部", coolingFactor: 1.0, heatingFactor: 1.05 },
  { id: "kansai", label: "関西", coolingFactor: 1.05, heatingFactor: 0.95 },
  { id: "chugoku_shikoku", label: "中国・四国", coolingFactor: 1.05, heatingFactor: 0.85 },
  { id: "kyushu", label: "九州", coolingFactor: 1.1, heatingFactor: 0.75 },
  { id: "okinawa", label: "沖縄", coolingFactor: 1.3, heatingFactor: 0.35 },
];

const PACKAGE_SIZES = [
  { kw: 5.6, hp: 2, code: "50形" },
  { kw: 7.1, hp: 2.5, code: "63形" },
  { kw: 8.0, hp: 3, code: "80形" },
  { kw: 11.2, hp: 4, code: "112形" },
  { kw: 14.0, hp: 5, code: "140形" },
  { kw: 16.0, hp: 6, code: "160形" },
  { kw: 22.4, hp: 8, code: "224形" },
];

// 人体発熱原単位(参考値。出典:実務解説記事「株式会社パラダイム」の事務作業時の目安値。
// 公的基準ではない。飲食店等の接客・調理作業に特化した値ではないため要確認)
const OCCUPANT_HEAT = {
  sensibleWPerPerson: 60,
  latentWPerPerson: 50,
  source: {
    name: "実務解説記事(株式会社パラダイム)の事務作業時の目安値。公的基準ではない。",
    url: null,
    confirmedDate: "2026-09-02",
  },
};

// 実在機器データベース(容量kW→型式配列)。全エントリに出典・確認日を保持し追跡可能にする。
const EQUIPMENT_DB = {
  5.6: [
    { maker: "ダイキン工業", model: "SZRG50CNT", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認(単相200V/三相200Vいずれかの型式あり)",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/SZRG50CNT.html", confirmedDate: "2026-09-02" } },
    { maker: "三菱電機", model: "PLZ-ERMP50L6", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/PLZ-ERMP50L6.html", confirmedDate: "2026-09-02" } },
    { maker: "パナソニック", model: "PA-P50L7HC", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P50L7HC.html", confirmedDate: "2026-09-02" } },
    { maker: "日立", model: "RCID-GP50RSH11", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/RCID-GP50RSH11.html", confirmedDate: "2026-09-02" } },
    { maker: "日本キヤリア(旧東芝)", model: "GWSA05013XU", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/GWSA05013XU.html", confirmedDate: "2026-09-02" } },
  ],
  8.0: [
    { maker: "ダイキン工業", model: "SZRC80BYT", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット4方向", config: "シングル", power: "三相200V",
      source: { name: "エアコンマート(型式・仕様掲載ページ)", url: "https://www.aircon-mart-2.com/fs/aircon/r4detk4-80a1d", confirmedDate: "2026-09-02" } },
    { maker: "三菱電機", model: "PLZ-ZRMP80L5", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット2方向", config: "シングル", power: "要確認",
      source: { name: "エフジェイテック(型番一覧ページ)", url: "https://ac.fj-tec.co.jp/category/item/package_ac/package_cassette/package_cassette_2/package_cassette_2_package_mitsubishi_electric/", confirmedDate: "2026-09-02" } },
    { maker: "パナソニック", model: "PA-P80U7HC", coolingKW: 8.0, heatingKW: null, indoorType: "4方向天井カセット", config: "シングル", power: "三相200V",
      source: { name: "エアコンセンターAC(型式ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P80U7HC.html", confirmedDate: "2026-09-02" } },
    { maker: "日立", model: "RCI-GP80RGH9", coolingKW: 8.0, heatingKW: null, indoorType: "てんかせ4方向", config: "シングル", power: "要確認",
      source: { name: "エフジェイテック(型番一覧ページ)", url: "https://ac.fj-tec.co.jp/category/item/package_ac/package_cassette/package_cassette_4/package_cassette_4_package_hitachi/", confirmedDate: "2026-09-02" } },
    { maker: "日本キヤリア(旧東芝)", model: "GUEA080111XU", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット4方向", config: "シングル", power: "三相200V",
      source: { name: "エアコンセンターAC(関連型式ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P80U7HC.html", confirmedDate: "2026-09-02" } },
  ],
};
// 【重要な注記】5.6kWクラスの調査で参照した一覧ページ(2U50-H1)自体の「参考例」の記載では、
// 同クラスの冷房能力が「4.5(1.0〜5.0)kW」と表示されており、公称クラス表記「2馬力/50形」=5.6kW
// という業界慣行上の対応と、個別製品の実際のカタログ値が一致しない場合があることを確認した。
// 各社の型式ページ(上記source.url)で個別の正式仕様を確認する必要がある(要確認)。

function findBuildingType(id) { return BUILDING_TYPES.find((b) => b.id === id); }
function findRegion(id) { return REGIONS.find((r) => r.id === id); }

/**
 * 負荷計算。
 * ① 概算負荷(roughLoad) = 面積ベースのみ。人体負荷は含まない。
 * ② 人体負荷(参考値) = 常に計算するが、既定では設計用必要負荷に加算しない。
 * ③ 設計用必要負荷(designLoad) = 概算負荷 [+ 人体負荷(includeOccupantLoad=trueの場合のみ)] × (1+margin/100)
 */
function computeLoad(input) {
  const {
    buildingTypeId, regionId,
    floorAreaTotal,        // 延床面積(建物全体、m²)。簡易モードではこの1値のみを使用する。
    floors,                // 階数(表示・配分参考用。負荷計算そのものには使用しない)
    occupants,
    coolingSetTemp, heatingSetTemp,
    marginPct,
    includeOccupantLoad,   // boolean。既定false(二重計上リスク回避のため)
  } = input;

  const warnings = [];
  const buildingType = findBuildingType(buildingTypeId);
  const region = findRegion(regionId);

  const area = Number(floorAreaTotal);
  const nFloors = Math.max(1, Number(floors) || 1);
  const nOccupantsRaw = Number(occupants);
  const nOccupants = Number.isFinite(nOccupantsRaw) ? Math.max(0, nOccupantsRaw) : 0;
  const margin = Number.isFinite(Number(marginPct)) ? Math.max(0, Number(marginPct)) : 0;
  const includeOccupant = includeOccupantLoad === true;

  if (!Number.isFinite(area) || area <= 0) {
    return { status: "invalid", reason: "面積が0以下、または未入力です。計算できません(要確認)。", warnings };
  }
  if (area > 50000) {
    warnings.push("延床面積が50,000m²を超えています。非現実的な規模の可能性があります(要確認)。");
  }
  if (nOccupants === 0) {
    warnings.push("在室人数が0人のため、換気量が0m³/hです(要確認)。");
  }

  const csTemp = Number(coolingSetTemp);
  const hsTemp = Number(heatingSetTemp);
  const tempFactorCooling = 1 + (26 - (Number.isFinite(csTemp) ? csTemp : 26)) * 0.03;
  const tempFactorHeating = 1 + ((Number.isFinite(hsTemp) ? hsTemp : 22) - 22) * 0.03;
  if (tempFactorCooling < 0 || tempFactorHeating < 0) {
    warnings.push("温度設定補正係数が負の値です(要確認)。");
  }

  // ① 概算負荷(面積ベースのみ。出典未確認の本アプリ仮定)
  const roughLoadCoolingKW = (area * buildingType.coolingWm2.value * region.coolingFactor * tempFactorCooling) / 1000;
  const roughLoadHeatingKW = (area * buildingType.heatingWm2.value * region.heatingFactor * tempFactorHeating) / 1000;

  // 人体負荷(参考値。常に計算するが、includeOccupant=falseの間は設計用必要負荷に含めない)
  const occupantSensibleKW = (nOccupants * OCCUPANT_HEAT.sensibleWPerPerson) / 1000;
  const occupantLatentKW = (nOccupants * OCCUPANT_HEAT.latentWPerPerson) / 1000;
  if (includeOccupant) {
    warnings.push(
      "人体発熱を設計用必要負荷に加算しています。面積原単位(W/m²)が人体発熱を含んだ値かどうかは未確認のため、" +
      "二重計上のリスクが理論上ゼロではありません(要確認)。"
    );
  }

  // ③ 設計用必要負荷
  const occupantAddCoolingKW = includeOccupant ? occupantSensibleKW + occupantLatentKW : 0;
  const preMarginCoolingKW = roughLoadCoolingKW + occupantAddCoolingKW;
  const preMarginHeatingKW = roughLoadHeatingKW; // 暖房には人体発熱を加算しない(設計基準の考え方に整合)

  const marginFactor = 1 + margin / 100;
  const designLoadCoolingKW = preMarginCoolingKW * marginFactor;
  const designLoadHeatingKW = preMarginHeatingKW * marginFactor;

  const basis = designLoadCoolingKW >= designLoadHeatingKW ? "cooling" : "heating";
  const requiredCapacityKW = Math.max(designLoadCoolingKW, designLoadHeatingKW);

  const ventilationM3h = nOccupants * buildingType.ventPerPerson;
  const ventilationPerArea = area > 0 ? ventilationM3h / area : 0;

  // 【構造追加 2026-09-02】この負荷がどの計算方式(A:原単位方式/B:詳細方式)で
  // 構成されたかを追跡する。数値計算そのものには一切影響しない。
  // "unit_load"            = 原単位(W/m²)のみ
  // "unit_load_with_occupant_addon" = 原単位 + 人体負荷を明示的に加算(二重計上リスクを伴うハイブリッド)
  // "detailed"             = 窓・外皮・照明・機器発熱等を個別積み上げる方式(未実装、将来用の予約値)
  const calculationMethod = includeOccupant ? "unit_load_with_occupant_addon" : "unit_load";

  const loadComponents = {
    method: calculationMethod,
    areaBasedCoefficient: {
      included: true,
      coolingWm2: buildingType.coolingWm2.value,
      heatingWm2: buildingType.heatingWm2.value,
      status: buildingType.coolingWm2.status,
      coolingKW: roughLoadCoolingKW,
      heatingKW: roughLoadHeatingKW,
    },
    occupantSensibleLatent: {
      included: includeOccupant,
      coolingKW: includeOccupant ? occupantSensibleKW + occupantLatentKW : 0,
      note: includeOccupant
        ? "原単位に人体発熱が既に含まれているか未確認のため、二重計上のリスクが理論上ゼロではありません"
        : "既定では未算入(算出のみ行い、設計用必要負荷には加算していません)",
    },
    envelope: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    windowSolar: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    lighting: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    equipmentHeat: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    outdoorAir: { included: false, note: "換気量[m³/h]は算出しているが、熱量化・設計用必要負荷への加算はしていない" },
    infiltration: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
  };

  return {
    status: "ok",
    warnings,
    // 建物条件(面積の定義を明示)
    floorAreaTotal: area,
    floors: nFloors,
    areaInputMode: "total_only", // 簡易モードは常にこの値。詳細モードで"per_floor"等を追加予定(未実装)
    // 計算方式の識別(構造追加。数値には影響しない)
    calculationMethod,
    loadComponents,
    // ① 概算負荷
    roughLoadCoolingKW,
    roughLoadHeatingKW,
    // 人体負荷(参考値)
    occupantSensibleKW,
    occupantLatentKW,
    includeOccupantLoad: includeOccupant,
    // ③ 設計用必要負荷
    marginPct: margin,
    designLoadCoolingKW,
    designLoadHeatingKW,
    basis,
    requiredCapacityKW,
    // 換気量
    ventilationM3h,
    ventilationPerArea,
    tempFactorCooling,
    tempFactorHeating,
  };
}

/**
 * 機種選定。容量パッケージ(仮選定)と実在機器(正式選定)を明確に分離する。
 * selectionType: "formal"(実在機器あり) | "provisional"(容量クラスのみ)
 */
function selectEquipment(loadResult) {
  if (loadResult.status !== "ok" || !(loadResult.requiredCapacityKW > 0)) {
    return { status: "invalid", reason: "必要容量が算出できないため、機種選定は行えません(要確認)。", candidates: [], recommended: null, selectionReasonText: null };
  }

  const requiredCapacityKW = loadResult.requiredCapacityKW;

  const candidates = PACKAGE_SIZES.map((p) => {
    const count = Math.max(1, Math.ceil(requiredCapacityKW / p.kw));
    const installedKW = count * p.kw;
    const surplusPct = ((installedKW - requiredCapacityKW) / requiredCapacityKW) * 100;
    const perFloor = count / loadResult.floors;
    const realModels = EQUIPMENT_DB[p.kw] || [];
    const selectionType = realModels.length > 0 ? "formal" : "provisional";
    return { size: p.kw, hp: p.hp, code: p.code, count, installedKW, surplusPct, perFloor, selectionType, realModels };
  });

  const recommended = candidates.reduce((a, b) => (b.surplusPct < a.surplusPct ? b : a));

  const basisLabel = loadResult.basis === "cooling" ? "冷房" : "暖房";
  const typeLabel = recommended.selectionType === "formal" ? "実在機器による正式選定" : "容量クラス仮選定(実在機器未確認)";
  const selectionReasonText =
    `${basisLabel}負荷が支配的なため、${basisLabel}能力を基準に選定しました。設計用必要負荷は${requiredCapacityKW.toFixed(1)}kWです。` +
    `標準機種${recommended.size.toFixed(1)}kW(${recommended.code}/${recommended.hp}馬力、${recommended.count}台、設置合計${recommended.installedKW.toFixed(1)}kW、余裕率+${recommended.surplusPct.toFixed(1)}%)が候補中で余裕率最小のため推奨します。` +
    `区分:${typeLabel}。` +
    (recommended.selectionType === "formal"
      ? `実在型式候補:${recommended.realModels.map((m) => `${m.maker} ${m.model}`).join("、")}。`
      : `この容量クラスの実在型式は今回未調査です。`);

  return { status: "ok", candidates, recommended, selectionReasonText };
}

function computeAll(input) {
  const loadResult = computeLoad(input);
  const equipmentResult = selectEquipment(loadResult);
  return { loadResult, equipmentResult };
}
// ===SHARED-LOGIC-END===

// ============================================================================
// 【第1段階 2026-09-04】プロ仕様データモデル(Project/Room階層)+ アダプター層
// ----------------------------------------------------------------------------
// 重要な設計原則:
// 1. このセクションは上記SHARED-LOGICブロックを一切呼び出し元から変更しない。
//    既存のcomputeLoad/selectEquipment/computeAllの動作・引数・戻り値は不変。
// 2. ここで新設するファクトリ関数は「データ構造を作るだけ」であり、独自の
//    計算式・新しい係数を一切追加しない。数値が未確認のフィールドはnullのまま
//    保持する(根拠のない値を勝手に補完しない、という指示に基づく)。
// 3. 唯一の例外として、人体発熱(occupantSensibleWPerPerson/LatentWPerPerson)は
//    「新しい係数」ではなく、既存のOCCUPANT_HEAT(60W/50W、既存の暫定値)を
//    そのまま参照する。新規の数値発明ではない。
// 4. roomToLegacyLoadInput()は「翻訳」のみを行うアダプターであり、計算は
//    一切行わない。最終的な計算は必ず既存のcomputeLoad/selectEquipment/
//    computeAllに委譲する。
// ============================================================================

/**
 * Project(物件) ファクトリ
 * @param {object} p
 */
function createProject(p = {}) {
  return {
    projectId: p.projectId ?? null,
    projectName: p.projectName ?? null,
    regionId: p.regionId ?? null,         // REGIONSのidを参照する想定(既存の地域係数をそのまま利用)
    floors: p.floors ?? 1,                 // 既存のfloors同様、負荷計算そのものには使用しない(表示・配分用)
    targetFloor: p.targetFloor ?? null,    // 対象階(新規。現状は表示・識別用途のみ、計算には未接続)
    totalFloorArea: p.totalFloorArea ?? null, // 延床面積(新規。Room.floorAreaの合計とは別に保持可能)
    airConditionedArea: p.airConditionedArea ?? null, // 空調対象面積(任意)
    operatingHours: p.operatingHours ?? { start: null, end: null },
    marginPct: p.marginPct ?? 0,           // 既存のmarginPctと同じ意味・同じ既定値(0%)
    rooms: [],
  };
}

/**
 * Projectに複数のRoomを登録する(単純な配列管理。計算は行わない)
 */
function addRoomToProject(project, room) {
  project.rooms.push(room);
  return project;
}

/**
 * Envelope(外皮・構造体) ファクトリ。
 * 数値係数(U値等)は根拠未確認のため、指定がない限りすべてnull。
 */
function createEnvelope(e = {}) {
  return {
    wall: e.wall ?? [],           // [{ area, orientation, uValue }] 想定。未指定時は空配列
    roof: e.roof ?? { area: null, uValue: null },
    floor: e.floor ?? { area: null, uValue: null },
    ceiling: e.ceiling ?? { area: null, uValue: null },
    interiorWall: e.interiorWall ?? [], // [{ area, uValue }]
    thermalProperty: e.thermalProperty ?? { note: "構造・断熱区分等は未実装。値はnullのまま。" },
  };
}

/**
 * Window(窓・ガラス) ファクトリ。1室に複数(方位別)持てるよう配列要素として使う想定。
 */
function createWindow(w = {}) {
  return {
    area: w.area ?? null,
    orientation: w.orientation ?? null, // 8方位等の文字列を想定
    glassType: w.glassType ?? null,     // "single" | "double" | "lowE" 等(区分のみ、係数は別途)
    thermalProperty: w.thermalProperty ?? { uValue: null },
    solarProperty: w.solarProperty ?? { scValue: null, etaValue: null },
    shading: w.shading ?? { type: null, present: false },
  };
}

/**
 * InternalHeat(内部発熱) ファクトリ。
 * 人体発熱のみ、既存のOCCUPANT_HEAT(60W/50W、既存の暫定値)を既定値として使用する。
 * 照明・機器・その他は根拠となる原単位が現状存在しないため既定null。
 */
function createInternalHeat(i = {}) {
  return {
    occupantSensibleWPerPerson: i.occupantSensibleWPerPerson ?? OCCUPANT_HEAT.sensibleWPerPerson,
    occupantLatentWPerPerson: i.occupantLatentWPerPerson ?? OCCUPANT_HEAT.latentWPerPerson,
    occupantHeatSource: OCCUPANT_HEAT.source, // 既存の出典情報をそのまま引き継ぐ
    lightingWm2: i.lightingWm2 ?? null,        // 根拠となる原単位未確認のためnull
    equipmentWm2: i.equipmentWm2 ?? null,      // 同上
    otherInternalHeat: i.otherInternalHeat ?? [], // 厨房機器等の積み上げ用、既定は空配列
    schedule: i.schedule ?? null,              // 時刻別スケジュール(第2段階以降)
  };
}

/**
 * OutdoorAirInfiltration(外気・換気・すきま風) ファクトリ。
 * 外気温湿度・熱交換効率等は根拠となる気象データが未接続のためnull。
 */
function createOutdoorAirInfiltration(o = {}) {
  return {
    outdoorAirVolumeM3h: o.outdoorAirVolumeM3h ?? null, // 未指定時は既存ロジック(人数×用途別原単位)側で算出する想定
    ventilationType: o.ventilationType ?? null,          // "type1" | "type2" | "type3" 等
    infiltration: o.infiltration ?? { sashTightness: null, hasExternalDoor: null },
    outdoorTemperature: o.outdoorTemperature ?? { cooling: null, heating: null },
    outdoorHumidity: o.outdoorHumidity ?? { cooling: null, heating: null },
    heatRecovery: o.heatRecovery ?? { enabled: false, efficiency: null },
  };
}

/**
 * Room(室) ファクトリ。
 * volumeはfloorArea×ceilingHeightの単純な自動計算のみ(新しい計算式ではなく幾何学的な定義そのもの)。
 */
function createRoom(r = {}) {
  const floorArea = r.floorArea ?? null;
  const ceilingHeight = r.ceilingHeight ?? null;
  return {
    roomId: r.roomId ?? null,
    roomName: r.roomName ?? null,
    usage: r.usage ?? null,          // BUILDING_TYPESのidを参照する想定
    floorArea,
    ceilingHeight,
    volume: floorArea != null && ceilingHeight != null ? floorArea * ceilingHeight : null,
    indoorTemperature: r.indoorTemperature ?? { cooling: null, heating: null },
    indoorHumidity: r.indoorHumidity ?? { cooling: null, heating: null }, // 現行エンジンは湿度未対応(既存仕様のまま)
    occupancy: r.occupancy ?? null,
    envelope: r.envelope ?? createEnvelope(),
    windows: r.windows ?? [],
    internalHeat: r.internalHeat ?? createInternalHeat(),
    outdoorAir: r.outdoorAir ?? createOutdoorAirInfiltration(),
  };
}

/**
 * 【アダプター】新Room/Projectモデル → 既存computeLoad()入力形式への変換。
 * 計算は一切行わない。既存の入力キー(buildingTypeId等)にそのまま詰め替えるだけ。
 * 未指定の温度はnullのまま既存computeLoad側に渡し、既存のフォールバック処理
 * (Number.isFinite判定→既定値26/22℃)にそのまま委ねる(=ここで新たに26/22という
 * 数値を書かない。既存ロジック側の挙動を1箇所に保つ)。
 */
function roomToLegacyLoadInput(project, room) {
  // 「未指定」(null)と「0℃を明示指定」(数値0)を区別してundefinedに変換する。
  // 既存computeLoad()は Number.isFinite(Number(x)) で有効値判定しており、
  // Number(null)=0(有限)/Number(undefined)=NaN(非有限)という違いがあるため、
  // 「未指定」は必ずundefinedとして渡す(既存側の26℃/22℃フォールバックを
  // このアダプター側で新たに書かず、既存computeLoad自体の挙動にそのまま委ねる)。
  const toLegacyTemp = (v) => (v === null || v === undefined ? undefined : v);

  return {
    buildingTypeId: room.usage,
    regionId: project.regionId,
    floorAreaTotal: room.floorArea,
    floors: project.floors,
    occupants: room.occupancy,
    coolingSetTemp: room.indoorTemperature ? toLegacyTemp(room.indoorTemperature.cooling) : undefined,
    heatingSetTemp: room.indoorTemperature ? toLegacyTemp(room.indoorTemperature.heating) : undefined,
    marginPct: project.marginPct,
    includeOccupantLoad: false, // 既存の既定値と同一。第1段階では変更しない
  };
}

/**
 * 【アダプター経由の計算】新モデルのRoom1件を、既存のcomputeLoad/selectEquipmentに
 * そのまま渡して計算する。新しい計算ロジックは一切含まない(既存関数への委譲のみ)。
 */
function computeRoomLoad(project, room) {
  const legacyInput = roomToLegacyLoadInput(project, room);
  return computeAll(legacyInput); // 既存のcomputeAll(SHARED-LOGICブロック内、不変)をそのまま使用
}

/**
 * 【R6詳細方式のアダプター】新モデルのRoom1件を computeDetailedLoad() の入力へ翻訳する。
 *
 * computeLoad 用の roomToLegacyLoadInput と同じく「翻訳のみ」で、新しい係数・式は持たない。
 * 未指定(null)は null のまま渡す(toNum()が「未入力」として扱う)。
 */
function roomToDetailedLoadInput(project, room) {
  const env = room.envelope || {};
  const oa = room.outdoorAir || {};
  const internal = room.internalHeat || {};
  return {
    regionId: project.regionId,
    usage: room.usage || project.buildingTypeId,
    floorAreaTotal: room.floorArea,
    ceilingHeight: room.ceilingHeight,
    occupants: room.occupancy,
    coolingSetTemp: room.indoorTemperature ? room.indoorTemperature.cooling : null,
    heatingSetTemp: room.indoorTemperature ? room.indoorTemperature.heating : null,
    indoorRHCooling: room.indoorHumidity ? room.indoorHumidity.cooling : null,
    indoorRHHeating: room.indoorHumidity ? room.indoorHumidity.heating : null,
    lightingWm2: internal.lightingWm2,
    equipmentWm2: internal.equipmentWm2,
    others: Array.isArray(internal.others) ? internal.others : [],
    outdoorAirVolumeM3h: oa.volumeM3h,
    heatRecovery: oa.heatRecovery || { enabled: false, efficiency: null },
    infiltration: oa.infiltration || {},
    walls: Array.isArray(env.walls) ? env.walls : [],
    roof: env.roof || null,
    floorEnvelope: env.floor || null,
    interiorWalls: Array.isArray(env.interiorWalls) ? env.interiorWalls : [],
    windows: Array.isArray(room.windows) ? room.windows : [],
    marginPct: project.marginPct,
  };
}

/**
 * 【R6詳細方式のアダプター】Room1件を詳細方式で計算する。
 * 計算式は computeDetailedLoad() 側にのみ存在する(ここは委譲のみ)。
 */
function computeRoomDetailedLoad(project, room) {
  return computeDetailedLoad(roomToDetailedLoadInput(project, room));
}

module.exports = {
  BUILDING_TYPES, REGIONS, PACKAGE_SIZES, OCCUPANT_HEAT, EQUIPMENT_DB,
  computeLoad, selectEquipment, computeAll,
  // 【第1段階 追加分】プロ仕様データモデル+アダプター
  createProject, addRoomToProject, createRoom,
  createEnvelope, createWindow, createInternalHeat, createOutdoorAirInfiltration,
  roomToLegacyLoadInput, computeRoomLoad,
  // 【R6詳細方式】積み上げ計算(既存SHARED-LOGICは変更しない)
  computeDetailedLoad,
  R6_INTERNAL_LOAD, R6_DESIGN_OUTDOOR, AIR_PROPERTIES, DETAILED_HOURS, R6_LOAD_ITEMS,
  SURFACE_RESISTANCE, uValueFromMaterials,
  // 新モデルRoom → R6詳細方式入力への翻訳(project-model.mjs と1対1)
  roomToDetailedLoadInput, computeRoomDetailedLoad,
};

// ============================================================================
// 244W/m²等の原単位に関する確認結果(2026-09-02)
// ----------------------------------------------------------------------------
// BUILDING_TYPESのcoolingWm2/heatingWm2は、本アプリの開発初期(本セッションの
// 最初のプロトタイプ作成時)に、外部資料を引用せずに設定した「本アプリ独自の
// 概算仮定値」です。特定の公的資料・企業資料から転記した数値ではないため、
// 「人体発熱を含む値かどうか」を確認する外部の原典が存在しません。
// したがって「A:人体発熱を含む」「B:含まない」のいずれかを外部資料と突き合わせて
// 判定することは、今回のセッションでは不可能でした。
// この状態を偽って「Bと判定できた」とはせず、「根拠不明」として扱い、
// 上記のとおり既定では人体負荷を設計用必要負荷に加算しない(=概算負荷を基準とする)
// 設計とし、加算はユーザーの明示的なオプトインによってのみ行われるようにしています。
// ============================================================================
