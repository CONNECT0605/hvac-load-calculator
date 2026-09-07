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
  for (const warning of report.warnings) rows.push(["警告", "", warning]);
  for (const [key, value] of report.equipment) rows.push(["機器選定", key, value]);
  for (const [key, value] of report.pricing) rows.push(["価格・見積", key, value]);
  return `\ufeff${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function downloadCsv(report, filename = "hvac-estimate.csv") {
  const blob = new Blob([buildCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
