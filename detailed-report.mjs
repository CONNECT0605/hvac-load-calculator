// ============================================================================
// 【R6詳細方式のレポート】建築設備設計基準 令和6年版の熱負荷計算書に相当する出力。
//
// 計算は行わない。computeDetailedLoad() と aggregateProject() の結果を整形するだけ。
// エンジンは引数で受け取る(依存性注入)ため、Node/ブラウザ双方で同一結果になる。
// ============================================================================

const kw = (v) => (v === null || v === undefined ? "―" : `${v.toFixed(1)} kW`);

/**
 * R6詳細方式の熱負荷計算書データを作る。
 * @param {object} args
 * @param {object} args.project 案件
 * @param {object} args.loadResult computeDetailedLoad() の戻り値(建物代表)
 * @param {object} args.aggregate aggregateProject() の戻り値
 * @param {Array}  args.roomResults [{ room, floorLabel, systemLabel, load }]
 */
export function buildDetailedReport({ project, loadResult, aggregate, roomResults, rooms, floors, regions, buildingTypes }) {
  const region = (regions || []).find((r) => r.id === project.regionId);
  const usageLabel = (id) => {
    const t = (buildingTypes || []).find((b) => b.id === id);
    return t ? t.label : id;
  };
  const notVerified = loadResult.notVerified || [];
  const defaultedFromR6 = loadResult.defaultedFromR6 || [];
  const items = loadResult.loadItems || { cooling: [], heating: [] };
  const bd = loadResult.breakdown || {};
  const hbd = loadResult.heatingBreakdown || {};
  const sourceRows = Object.entries(loadResult.coefficientSources || {}).map(([key, s]) => [
    key, s.name, s.page !== undefined ? `p.${s.page}` : "―", s.url || "―", s.confirmedDate || "―",
  ]);

  // 負荷項目一覧(公的基準の順序そのまま)
  const itemRows = (list, componentMap) => list.map((it) => [
    `${it.no}`,
    it.label,
    it.implemented === true ? "実装済" : it.implemented === "partial" ? "一部実装" : "未実装",
    componentMap(it),
  ]);
  const coolingComponent = (it) => {
    if (it.no === 1) return kw(bd.envelopeKW);
    if (it.no === 2) return `${kw((bd.windowConductionKW || 0) + (bd.windowSolarKW || 0))}(貫流 ${kw(bd.windowConductionKW)} + 日射 ${kw(bd.windowSolarKW)})`;
    if (it.no === 3) return kw(bd.lightingKW);
    if (it.no === 4) return `${kw((bd.occupantSensibleKW || 0) + (bd.occupantLatentKW || 0))}(顕熱 ${kw(bd.occupantSensibleKW)} + 潜熱 ${kw(bd.occupantLatentKW)})`;
    if (it.no === 5) return kw(bd.equipmentKW);
    if (it.no === 6) return `${kw((bd.infiltrationSensibleKW || 0) + (bd.infiltrationLatentKW || 0))}(顕熱 ${kw(bd.infiltrationSensibleKW)} + 潜熱 ${kw(bd.infiltrationLatentKW)})`;
    if (it.no === 7) return `${kw((bd.outdoorAirSensibleKW || 0) + (bd.outdoorAirLatentKW || 0))}(顕熱 ${kw(bd.outdoorAirSensibleKW)} + 潜熱 ${kw(bd.outdoorAirLatentKW)})`;
    return "―";
  };
  const heatingComponent = (it) => {
    if (it.no === 1) return kw(hbd.envelopeKW);
    if (it.no === 2) return kw(hbd.windowConductionKW);
    if (it.no === 3) return kw(hbd.infiltrationSensibleKW);
    if (it.no === 4) return kw(hbd.outdoorAirSensibleKW);
    return "―";
  };

  return {
    title: "熱負荷計算書(R6詳細方式)",
    generatedAt: new Date().toISOString(),
    project: { name: project.projectName || "名称未設定の案件", id: project.projectId || null },
    method: "建築設備設計基準 令和6年版に基づく積み上げ計算(外皮+窓+日射+内部発熱+外気+すきま風、時刻別)",
    source: items.source,
    // 設計条件
    conditions: [
      ["施主・顧客名", project.client || "―"],
      ["現場所在地", project.siteAddress || "―"],
      ["設計地区", region ? region.label : "―"],
      ["建物用途", usageLabel(project.buildingTypeId)],
      ["延床面積", project.totalFloorArea === null || project.totalFloorArea === undefined ? "―" : `${project.totalFloorArea} m²`],
      ["階数", `${project.floors.length} 階`],
      ["室数", `${project.rooms.length} 室`],
      ["在室人数", `${project.rooms.reduce((a, r) => a + (Number(r.occupancy) || 0), 0)} 人`],
      ["冷房室内温度", `${project.rooms[0]?.indoorTemperature?.cooling ?? 26} ℃`],
      ["暖房室内温度", `${project.rooms[0]?.indoorTemperature?.heating ?? 22} ℃`],
      ["設計外気温度(冷房)", `${loadResult.hourlyResults?.[0]?.outdoorDB ?? "―"} ℃`],
      ["設計外気相対湿度(冷房)", `${loadResult.hourlyResults?.[0]?.outdoorRH ?? "―"} %`],
      ["計画上の余裕", `${project.marginPct} %`],
    ],
    // 最大負荷一覧
    maximums: [
      ["冷房 最大全熱", kw(loadResult.peak.coolingKW), `${loadResult.peak.coolingHour} 時`],
      ["冷房 最大顕熱", kw(loadResult.peak.coolingSensibleKW), `${loadResult.peak.coolingHour} 時`],
      ["冷房 最大潜熱", kw(loadResult.peak.coolingLatentKW), `${loadResult.peak.coolingHour} 時`],
      ["暖房 最大全熱", kw(loadResult.peak.heatingKW), loadResult.peak.heatingHour === null ? "―" : `${loadResult.peak.heatingHour} 時`],
      ["設計用冷房負荷(余裕率込)", kw(loadResult.designLoadCoolingKW), "―"],
      ["設計用暖房負荷(余裕率込)", kw(loadResult.designLoadHeatingKW), "―"],
      ["選定基準", kw(loadResult.requiredCapacityKW), loadResult.basis === "cooling" ? "冷房支配" : "暖房支配"],
    ],
    // 負荷詳細(公的基準の項目順)
    coolingItems: itemRows(items.cooling, coolingComponent),
    heatingItems: itemRows(items.heating, heatingComponent),
    // 負荷内訳(全12項目)
    breakdown: [
      ["構造体負荷", kw(bd.envelopeKW)],
      ["窓 貫流負荷", kw(bd.windowConductionKW)],
      ["内壁負荷", kw(bd.interiorWallKW)],
      ["窓 日射負荷", kw(bd.windowSolarKW)],
      ["照明負荷", kw(bd.lightingKW)],
      ["機器負荷", kw(bd.equipmentKW)],
      ["人体負荷(顕熱)", kw(bd.occupantSensibleKW)],
      ["人体負荷(潜熱)", kw(bd.occupantLatentKW)],
      ["外気負荷(顕熱)", kw(bd.outdoorAirSensibleKW)],
      ["外気負荷(潜熱)", kw(bd.outdoorAirLatentKW)],
      ["すきま風負荷(顕熱)", kw(bd.infiltrationSensibleKW)],
      ["すきま風負荷(潜熱)", kw(bd.infiltrationLatentKW)],
      ["顕熱合計", kw(loadResult.peak.coolingSensibleKW)],
      ["潜熱合計", kw(loadResult.peak.coolingLatentKW)],
      ["全熱合計", kw(loadResult.peak.coolingKW)],
    ],
    heatingBreakdown: Object.entries(hbd).map(([k, v]) => [k, kw(v)]),
    // 時刻別一覧
    hourly: (loadResult.hourlyResults || []).map((h) => [
      `${h.hour} 時`,
      `${h.outdoorDB ?? "―"} ℃`,
      kw(h.coolingSensibleKW),
      kw(h.coolingLatentKW),
      kw(h.coolingTotalKW),
      kw(h.heatingTotalKW),
    ]),
    // 集計(室・系統・階・建物)
    aggregateRooms: (aggregate?.byRoom || []).map((r) => [
      r.roomName, r.floorLabel, r.systemLabel, `${r.floorArea.toFixed(1)} m²`, kw(r.coolingKW), kw(r.heatingKW),
    ]),
    aggregateSystems: (aggregate?.bySystem || []).map((s) => [
      s.label, `${s.roomCount} 室`, `${s.floorArea.toFixed(1)} m²`, kw(s.designLoadCoolingKW), kw(s.designLoadHeatingKW), kw(s.requiredCapacityKW),
    ]),
    aggregateFloors: (aggregate?.byFloor || []).map((f) => [
      f.label, `${f.roomCount} 室`, `${f.floorArea.toFixed(1)} m²`, kw(f.designLoadCoolingKW), kw(f.designLoadHeatingKW),
    ]),
    aggregateBuilding: aggregate?.building
      ? [["建物合計", `${aggregate.building.validRoomCount} 室`, `${aggregate.building.floorArea.toFixed(1)} m²`, kw(aggregate.building.designLoadCoolingKW), kw(aggregate.building.designLoadHeatingKW), kw(aggregate.building.requiredCapacityKW)]]
      : [],
    // 換気・すきま風
    ventilation: [
      ["外気量", `${Math.round(loadResult.ventilationM3h || 0).toLocaleString()} m³/h`],
      ["すきま風量", `${Math.round(loadResult.infiltrationVolumeM3h || 0).toLocaleString()} m³/h`],
    ],
    // 係数と出典
    coefficientSources: sourceRows,
    // 基準値で補完した項目
    defaultedFromR6,
    // 未確認事項(隠さない)
    notVerified,
    warnings: loadResult.warnings || [],
  };
}