import assert from "node:assert/strict";
import { EXPORT_FORMAT, STORAGE_KEY, createProjectSnapshot, deleteProject, duplicateProject, importProject, listProjects, loadProject, parseProjectFile, saveProject, serializeProject } from "./project-storage.mjs";

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
assert.equal(listProjects(storage).length, 2);
deleteProject(duplicate.projectId, storage);
assert.equal(listProjects(storage).length, 1);
const exported = serializeProject(loadProject(saved.projectId, storage));
assert.equal(JSON.parse(exported).format, EXPORT_FORMAT);
const imported = importProject(exported, storage);
assert.notEqual(imported.projectId, saved.projectId);
assert.equal(imported.inputs.nested.x, 1);
assert.equal(listProjects(storage).length, 2);
assert.equal(parseProjectFile(JSON.stringify({ projectName: "裸の案件", inputs: {} })).projectName, "裸の案件");
assert.throws(() => parseProjectFile("{"), /JSON/);
assert.throws(() => parseProjectFile(JSON.stringify({ foo: 1 })), /形式/);
deleteProject(imported.projectId, storage);

storage.setItem(STORAGE_KEY, "壊れたJSON");
assert.deepEqual(listProjects(storage), []);
console.log("project-storage: PASS");
