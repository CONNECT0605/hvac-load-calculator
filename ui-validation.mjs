const isBlank = (value) => value === "" || value === null || value === undefined;

export function validateInputs({ floorArea, floors, occupants, coolingSetTemp, heatingSetTemp }) {
  const errors = [];
  const warnings = [];
  const area = Number(floorArea);
  const floorCount = Number(floors);
  const occupantCount = Number(occupants);
  const cooling = Number(coolingSetTemp);
  const heating = Number(heatingSetTemp);

  if (!Number.isFinite(area) || area <= 0) errors.push("延床面積は0より大きい数値を入力してください。");
  if (!Number.isFinite(floorCount) || floorCount < 1) errors.push("階数は1以上で入力してください。");
  if (Number.isFinite(occupantCount) && occupantCount < 0) warnings.push("在室人数が負の値です。既存エンジンは0人として計算します。");
  if (isBlank(occupants) || occupantCount === 0) warnings.push("在室人数が0人のため、換気量は0m³/hになります。");
  if (isBlank(coolingSetTemp) || !Number.isFinite(cooling)) warnings.push("冷房設定温度が未入力です。既存エンジンの既定値26℃で計算します。");
  if (isBlank(heatingSetTemp) || !Number.isFinite(heating)) warnings.push("暖房設定温度が未入力です。既存エンジンの既定値22℃で計算します。");

  const coolingFactor = 1 + (26 - (Number.isFinite(cooling) ? cooling : 26)) * 0.03;
  const heatingFactor = 1 + ((Number.isFinite(heating) ? heating : 22) - 22) * 0.03;
  if (coolingFactor < 0 || heatingFactor < 0) errors.push("温度設定により負の補正係数となるため、計算を続行できません。");

  return { errors, warnings };
}

export function validateEquipmentCapacity({ requiredCapacityKW, selection }) {
  const installedKW = Number(selection?.size) * Number(selection?.count);
  if (!(requiredCapacityKW > 0) || !Number.isFinite(installedKW) || installedKW <= 0) {
    return { ok: false, installedKW: Number.isFinite(installedKW) ? installedKW : 0, shortageKW: null, message: "有効な機器容量と台数を入力してください。" };
  }
  const shortageKW = Math.max(0, requiredCapacityKW - installedKW);
  return shortageKW > 0
    ? { ok: false, installedKW, shortageKW, message: `選択構成は必要能力を${shortageKW.toFixed(1)}kW下回っています。` }
    : { ok: true, installedKW, shortageKW: 0, message: null };
}
