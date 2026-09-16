export function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv(report) {
  const rows = [["区分", "項目", "値"]];
  rows.push(["案件", "案件名", report.project.name], ["案件", "出力日時", report.generatedAt], ["計算", "計算方法", report.method]);
  for (const notice of report.notices) rows.push(["注意事項", "", notice]);
  for (const [key, value] of report.conditions) rows.push(["計算条件", key, value]);
  for (const [key, value] of report.basis) rows.push(["計算根拠", key, value]);
  for (const [key, value] of report.results) rows.push(["計算結果", key, value]);
  for (const [key, value] of report.rooms || []) rows.push(["室別内訳", key, value]);
  for (const warning of report.warnings) rows.push(["警告", "", warning]);
  for (const [key, value] of report.equipment) rows.push(["機器選定", key, value]);
  for (const [key, value] of report.pricing || []) rows.push(["価格・見積", key, value]);
  return `\ufeff${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function downloadCsv(report, filename = "hvac-estimate.csv") {
  const safeName = String(filename || "hvac-estimate.csv").replace(/[/\\?%*:|"<>]/g, "_");
  const blob = new Blob([buildCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * R6詳細方式(熱負荷計算書)のCSV。
 * buildCsv() と同じく整形のみで、数値の再計算はしない。
 */
export function buildDetailedCsv(report) {
  const rows = [["区分", "項目", "値", "補足"]];
  rows.push(["案件", "案件名", report.project.name, ""]);
  rows.push(["案件", "出力日時", report.generatedAt, ""]);
  rows.push(["計算", "計算方法", report.method, ""]);
  for (const [label, value] of report.conditions || []) rows.push(["設計条件", label, value, ""]);
  for (const [label, value, hour] of report.maximums || []) rows.push(["最大負荷", label, value, hour]);
  for (const row of report.coolingItems || []) rows.push(["負荷詳細(冷房)", `${row[0]}. ${row[1]}`, row[3], row[2]]);
  for (const row of report.heatingItems || []) rows.push(["負荷詳細(暖房)", `${row[0]}. ${row[1]}`, row[3], row[2]]);
  for (const [label, value] of report.breakdown || []) rows.push(["負荷内訳(冷房)", label, value, ""]);
  for (const [label, value] of report.heatingBreakdown || []) rows.push(["負荷内訳(暖房)", label, value, ""]);
  for (const row of report.hourly || []) rows.push(["時刻別", `${row[0]}`, `顕熱 ${row[2]} / 潜熱 ${row[3]} / 全熱 ${row[4]}`, `暖房 ${row[5]} / 外気 ${row[1]}`]);
  for (const row of report.aggregateRooms || []) rows.push(["室別集計", row[0], `冷房 ${row[4]} / 暖房 ${row[5]}`, `${row[1]} / ${row[2]} / ${row[3]}`]);
  for (const row of report.aggregateSystems || []) rows.push(["系統集計", row[0], `冷房 ${row[3]} / 暖房 ${row[4]} / 基準 ${row[5]}`, `${row[1]} / ${row[2]}`]);
  for (const row of report.aggregateFloors || []) rows.push(["階集計", row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `${row[1]} / ${row[2]}`]);
  for (const row of report.aggregateBuilding || []) rows.push(["建物集計", row[0], `冷房 ${row[3]} / 暖房 ${row[4]} / 基準 ${row[5]}`, `${row[1]} / ${row[2]}`]);
  for (const [label, value] of report.ventilation || []) rows.push(["換気・すきま風", label, value, ""]);
  for (const row of report.coefficientSources || []) rows.push(["係数の出典", row[0], `${row[1]}`, `${row[2]} ${row[3]} ${row[4]}`]);
  for (const item of report.defaultedFromR6 || []) rows.push(["基準値補完", item, "基準値で補完", ""]);
  for (const item of report.notVerified || []) rows.push(["未確認", item, "要確認", "非公開データ等のため未確定"]);
  for (const item of report.warnings || []) rows.push(["警告", item, "要確認", ""]);
  for (const row of report.checklist || []) rows.push(["チェックリスト", row[1], row[2], row[3] ?? ""]);
  return `\ufeff${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function downloadDetailedCsv(report, filename = "hvac-detailed-load.csv") {
  const safeName = String(filename || "hvac-detailed-load.csv").replace(/[/\\?%*:|"<>]/g, "_");
  const blob = new Blob([buildDetailedCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}
