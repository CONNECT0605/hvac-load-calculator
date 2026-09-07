export const ESTIMATE_NOTICES = [
  "概算空調負荷・概算見積ツールです。",
  "用途別W/m²原単位、地域係数、温度補正は暫定値です。",
  "人体負荷は参考表示で、既定では設計用負荷に未算入です。",
  "換気量は算出しますが、外気熱負荷には未算入です。",
  "外皮、窓、方位、日射、湿度、材料、構造、外気条件の詳細計算は未実装です。",
  "正式な実施設計、発注、法規判定の代替ではありません。",
];

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
