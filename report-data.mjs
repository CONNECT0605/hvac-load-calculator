export const ESTIMATE_NOTICES = [
  "概算空調負荷・概算見積ツールです。",
  "用途別W/m²原単位、地域係数、温度補正は暫定値です。",
  "人体負荷は参考表示で、既定では設計用負荷に未算入です。",
  "上記の概算値(面積原単位方式)には、外皮・窓・方位・日射・照明・機器発熱・すきま風・外気負荷・湿度の熱量を積み上げていません(換気量[m³/h]は算出します)。",
  "外皮・窓・方位・日射・照明・機器発熱・すきま風・外気負荷・湿度・時刻別は、R6詳細方式の熱負荷計算書(詳細帳票)で積み上げます。",
  "ダクト・配管表面、空気漏洩、送風機・ポンプ運転、間欠空調の蓄熱は未実装です。",
  "正式な実施設計、発注、法規判定の代替ではありません。",
];

/**
 * 案件(Project/Floor/Room)モデル用のレポートデータ。
 * 数値はすべて計算エンジンの結果(calc)由来で、ここでは整形しか行わない。
 */
export function buildProjectReport({ project, calc, buildingTypes, regions }) {
  const region = regions.find((r) => r.id === project.regionId);
  const usageIds = [...new Set(project.rooms.map((room) => room.usage || project.buildingTypeId))];
  const totals = calc.totals;
  const recommended = calc.buildingSelection.status === "ok" ? calc.buildingSelection.recommended : null;
  const kw = (v) => `${v.toFixed(1)} kW`;

  return {
    title: "空調負荷計算・機器選定レポート",
    generatedAt: new Date().toISOString(),
    project: { name: project.projectName || "名称未設定の案件", id: project.projectId || null },
    method: "室面積 × 用途別暫定W/m²原単位 × 地域係数 × 温度設定補正 × (1 + 計画上の余裕) を室ごとに算出し、建物全体で合算",
    notices: ESTIMATE_NOTICES,
    conditions: [
      ["施主・顧客名", project.client || "―"],
      ["現場所在地", project.siteAddress || "―"],
      ["地域区分", region ? region.label : "―"],
      ["延床面積", project.totalFloorArea === null || project.totalFloorArea === undefined ? "―" : `${project.totalFloorArea} m²`],
      ["階数", `${project.floors.length} 階`],
      ["室数", `${project.rooms.length} 室（計算可能 ${totals.validRoomCount} 室）`],
      ["室面積合計", `${totals.floorArea.toFixed(1)} m²`],
      ["運転時間", `${project.operatingHours?.start || "―"} 〜 ${project.operatingHours?.end || "―"}`],
      ["計画上の余裕", `${project.marginPct} %`],
    ],
    basis: [
      ["地域補正", region ? `冷房 ×${region.coolingFactor} / 暖房 ×${region.heatingFactor}（provisional）` : "―"],
      ...usageIds.map((id) => {
        const type = buildingTypes.find((b) => b.id === id);
        return [
          `原単位（${type ? type.label : id}）`,
          type ? `冷房 ${type.coolingWm2.value} W/m² / 暖房 ${type.heatingWm2.value} W/m²（provisional）` : "―",
        ];
      }),
      ["人体発熱", `参考算出のみ（顕熱 ${totals.occupantSensibleKW.toFixed(2)} kW / 潜熱 ${totals.occupantLatentKW.toFixed(2)} kW、設計用負荷に未算入）`],
      ["未実装項目", "外皮・窓・日射・照明・機器発熱・外気熱負荷・湿度・時刻別計算"],
    ],
    results: [
      ["概算冷房負荷（合算）", kw(totals.roughLoadCoolingKW)],
      ["概算暖房負荷（合算）", kw(totals.roughLoadHeatingKW)],
      ["設計用必要冷房能力", kw(totals.designLoadCoolingKW)],
      ["設計用必要暖房能力", kw(totals.designLoadHeatingKW)],
      ["選定基準能力", `${kw(totals.requiredCapacityKW)}（${totals.basis === "cooling" ? "冷房" : "暖房"}が支配的）`],
      ["必要換気量", `${Math.round(totals.ventilationM3h).toLocaleString()} m³/h`],
    ],
    rooms: calc.rooms.map(({ room, loadResult }) => [
      room.name || "(室名未設定)",
      loadResult.status === "ok"
        ? `面積 ${loadResult.floorAreaTotal.toFixed(1)} m² / 冷房 ${kw(loadResult.designLoadCoolingKW)} / 暖房 ${kw(loadResult.designLoadHeatingKW)} / 換気 ${Math.round(loadResult.ventilationM3h).toLocaleString()} m³/h`
        : loadResult.reason,
    ]),
    warnings: calc.warnings,
    equipment: recommended
      ? [
          ["推奨容量クラス", `${recommended.size.toFixed(1)} kW（${recommended.code} / ${recommended.hp}馬力）× ${recommended.count}台`],
          ["設置合計容量", kw(recommended.installedKW)],
          ["余裕率", `+${recommended.surplusPct.toFixed(1)} %`],
          ["選定区分", recommended.selectionType === "formal" ? "実在機器による正式選定" : "容量クラス仮選定（実在機器未確認）"],
          ["選定理由", calc.buildingSelection.selectionReasonText],
        ]
      : [["機器選定", "計算可能な室がないため選定できません。"]],
    pricing: [],
  };
}

export function buildReportData({ project, input, result, selection, selectedQuote, costs, marginRate, buildingType, region, validation, capacityValidation }) {
  return {
    title: "概算空調負荷・概算見積ツール",
    generatedAt: new Date().toISOString(),
    project: { name: project.name || "名称未設定の案件", id: project.id || null },
    method: "延床面積 × 用途別暫定W/m²原単位 × 地域係数 × 温度設定補正 × (1 + 計画上の余裕)",
    notices: ESTIMATE_NOTICES,
    conditions: [
      ["建物用途", buildingType.label], ["所在地", region.label], ["延床面積", `${input.floorArea} m²`],
      ["階数", `${input.floors} 階`], ["在室人数", `${input.occupants} 人`], ["冷房設定温度", `${input.coolingSetTemp} ℃`],
      ["暖房設定温度", `${input.heatingSetTemp} ℃`], ["計画上の余裕", `${input.marginPct} %`],
    ],
    basis: [
      ["冷房原単位", `${buildingType.coolingWm2.value} W/m²（provisional）`],
      ["暖房原単位", `${buildingType.heatingWm2.value} W/m²（provisional）`],
      ["地域補正", `冷房 ×${region.coolingFactor} / 暖房 ×${region.heatingFactor}（provisional）`],
      ["温度補正", `冷房 ×${result.tempFactorCooling.toFixed(2)} / 暖房 ×${result.tempFactorHeating.toFixed(2)}（provisional）`],
    ],
    results: [
      ["概算冷房負荷", `${result.roughLoadCoolingKW.toFixed(1)} kW`], ["概算暖房負荷", `${result.roughLoadHeatingKW.toFixed(1)} kW`],
      ["設計用必要冷房能力", `${result.coolingLoadKW.toFixed(1)} kW`], ["設計用必要暖房能力", `${result.heatingLoadKW.toFixed(1)} kW`],
      ["選定基準能力", `${result.requiredCapacityKW.toFixed(1)} kW`], ["必要換気量", `${result.ventilationM3h.toLocaleString()} m³/h`],
    ],
    warnings: [...(result.warnings || []), ...(validation.warnings || []), ...(validation.errors || []), ...(capacityValidation?.message ? [capacityValidation.message] : [])],
    equipment: [
      ["選択容量", `${selection.size.toFixed(1)} kW × ${selection.count}台`], ["設置合計容量", `${capacityValidation.installedKW.toFixed(1)} kW`],
      ["能力判定", capacityValidation.ok ? "必要能力を満たす" : "能力不足（要修正）"],
    ],
    pricing: [
      ["採用戦略", selectedQuote.strategyLabel], ["販売店", `${selectedQuote.store}（sample）`], ["機器価格", `¥${selectedQuote.totalUnitPrice.toLocaleString()}（sample）`],
      ["送料", `¥${selectedQuote.shipping.toLocaleString()}（sample）`], ["工事費概算", `¥${costs.constructionTotal.toLocaleString()}（assumption）`],
      ["原価合計", `¥${costs.costTotal.toLocaleString()}（sample / assumption）`], ["粗利率", `${Math.round(marginRate * 100)} %（assumption）`],
      ["客先提示概算", `¥${Math.round(costs.costTotal / (1 - marginRate)).toLocaleString()}（sample / assumption）`],
    ],
  };
}
