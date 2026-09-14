export const STORAGE_KEY = "hvac-load-calculator.projects.v1";
export const SCHEMA_VERSION = 1;

function makeId() {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now() {
  return new Date().toISOString();
}

function getStore(storage) {
  if (storage) return storage;
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function readAll(storage) {
  const store = getStore(storage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.schemaVersion === SCHEMA_VERSION && p.projectId) : [];
  } catch {
    return [];
  }
}

function writeAll(projects, storage) {
  const store = getStore(storage);
  if (!store) throw new Error("このブラウザではローカル保存を利用できません。");
  store.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function createProjectSnapshot({ projectId, projectName, createdAt, inputs }) {
  const timestamp = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: projectId || makeId(),
    projectName: String(projectName || "名称未設定の案件").trim() || "名称未設定の案件",
    createdAt: createdAt || timestamp,
    updatedAt: timestamp,
    inputs: structuredClone(inputs),
  };
}

export function listProjects(storage) {
  return readAll(storage)
    .map((project) => ({ ...project, inputs: undefined }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProject(projectId, storage) {
  const project = readAll(storage).find((item) => item.projectId === projectId);
  return project ? structuredClone(project) : null;
}

export function saveProject(snapshot, storage) {
  const projects = readAll(storage);
  const normalized = createProjectSnapshot(snapshot);
  const existing = projects.findIndex((item) => item.projectId === normalized.projectId);
  if (existing >= 0) normalized.createdAt = projects[existing].createdAt;
  if (existing >= 0) projects[existing] = normalized;
  else projects.push(normalized);
  writeAll(projects, storage);
  return structuredClone(normalized);
}

export function duplicateProject(projectId, storage) {
  const source = loadProject(projectId, storage);
  if (!source) return null;
  return saveProject(createProjectSnapshot({
    projectName: `${source.projectName} のコピー`,
    inputs: source.inputs,
  }), storage);
}

export const EXPORT_FORMAT = "hvac-load-calculator.project";

export function serializeProject(snapshot) {
  return JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now(), project: snapshot }, null, 2);
}

export function parseProjectFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み取れないファイルです。");
  }
  const project = parsed && parsed.project ? parsed.project : parsed;
  if (!project || typeof project !== "object" || !project.inputs) {
    throw new Error("案件データの形式が正しくありません。書き出ししたJSONファイルを選んでください。");
  }
  return project;
}

export function importProject(text, storage) {
  const source = parseProjectFile(text);
  return saveProject(createProjectSnapshot({ projectName: source.projectName, inputs: source.inputs }), storage);
}

export function downloadProjectJson(snapshot, filename) {
  const safeName = String(filename || `${snapshot.projectName || "project"}.json`).replace(/[/\\?%*:|"<>]/g, "_");
  const blob = new Blob([serializeProject(snapshot)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function deleteProject(projectId, storage) {
  const projects = readAll(storage).filter((item) => item.projectId !== projectId);
  writeAll(projects, storage);
  return true;
}
