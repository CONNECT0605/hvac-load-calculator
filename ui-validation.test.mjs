import assert from "node:assert/strict";
import { validateEquipmentCapacity, validateInputs } from "./ui-validation.mjs";

assert.ok(validateInputs({ floorArea: 0, floors: 1, occupants: 0, coolingSetTemp: "", heatingSetTemp: "" }).errors.length > 0);
assert.ok(validateInputs({ floorArea: 100, floors: 1, occupants: -1, coolingSetTemp: 26, heatingSetTemp: 22 }).warnings.length > 0);
assert.ok(validateInputs({ floorArea: 100, floors: 1, occupants: 0, coolingSetTemp: "", heatingSetTemp: "" }).warnings.length >= 3);
assert.equal(validateEquipmentCapacity({ requiredCapacityKW: 24.4, selection: { size: 5.6, count: 4 } }).ok, false);
assert.equal(validateEquipmentCapacity({ requiredCapacityKW: 24.4, selection: { size: 5.6, count: 5 } }).ok, true);
console.log("ui-validation: PASS");
