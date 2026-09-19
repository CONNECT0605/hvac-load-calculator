// ============================================================================
// R6詳細方式(積み上げ)エンジンへのブリッジ。
//
// hvac-calc-engine.js は CommonJS で書かれた計算の中核(Single Source of Truth)。
// ブラウザ側(UI)から詳細方式 computeDetailedLoad() を呼ぶため、ここで ESM として
// 再輸出するだけ。計算式・係数は一切持たない(engine本体をそのまま参照する)。
// ============================================================================
import engine from "./hvac-calc-engine.js";

export const computeLoad = engine.computeLoad;
export const selectEquipment = engine.selectEquipment;
export const roomToDetailedLoadInput = engine.roomToDetailedLoadInput;
export const computeDetailedLoad = engine.computeDetailedLoad;
export const R6_INTERNAL_LOAD = engine.R6_INTERNAL_LOAD;
export const R6_DESIGN_OUTDOOR = engine.R6_DESIGN_OUTDOOR;
export const R6_LOAD_ITEMS = engine.R6_LOAD_ITEMS;
export const DETAILED_HOURS = engine.DETAILED_HOURS;
export const BUILDING_TYPES = engine.BUILDING_TYPES;
export const REGIONS = engine.REGIONS;

export default engine;
