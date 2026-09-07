import assert from "node:assert/strict";
import { STORAGE_KEY, createProjectSnapshot, duplicateProject, listProjects, loadProject, saveProject } from "./project-storage.mjs";

const storage = (() => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
})();

const saved = saveProject(createProjectSnapshot({ projectName: "日本語,案件", inputs: { floorArea: 100, nested: { x: 1 } } }), storage);
assert.equal(listProjects(storage).length, 1);
assert.equal(loadProject(saved.projectId, storage).inputs.floorArea, 100);
const duplicate = duplicateProject(saved.projectId, storage);
assert.notEqual(duplicate.projectId, saved.projectId);
assert.equal(duplicate.projectName, "日本語,案件 のコピー");
storage.setItem(STORAGE_KEY, "壊れたJSON");
assert.deepEqual(listProjects(storage), []);
console.log("project-storage: PASS");
