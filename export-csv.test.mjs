import assert from "node:assert/strict";
import { buildCsv, escapeCsv } from "./export-csv.mjs";

assert.equal(escapeCsv('a,"b"\nc'), '"a,""b""\nc"');
const csv = buildCsv({ project: { name: "日本語,案件" }, generatedAt: "2026-09-09", method: "概算", notices: ["provisional"], conditions: [], basis: [], results: [], warnings: [], equipment: [], pricing: [] });
assert.ok(csv.startsWith("\ufeff"));
assert.ok(csv.includes('"日本語,案件"'));
assert.ok(csv.includes("provisional"));
console.log("export-csv: PASS");
