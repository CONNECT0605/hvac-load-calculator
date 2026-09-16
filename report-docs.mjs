// report-docs.mjs
// 「建築設備設計計算書作成の手引 令和6年版」に準拠した帳票様式へ、
// 既存の詳細レポート(buildDetailedReport)と集計(computeProject)の内容を
// そのまま割り付ける層。ここでは新しい数値を作らない。
//
// 帳票構成(18帳票): 表紙1 + 熱負荷計算書1 + 熱負荷集計表1 + 設計条件9 + チェックリスト6
import { REPORT_R6_SEQUENCE, CHECKLIST_ITEMS } from "./report-taxonomy.mjs";

const cell = (value) => (value === null || value === undefined ? "" : value);

/** 詳細レポートを帳票(シート)構成へ割り付ける。 */
export function buildReportWorkbook({ detailed, aggregate, project, regions, buildingTypes }) {
  const region = (regions || []).find((r) => r.id === project?.regionId) || null;
  const buildingType = (buildingTypes || []).find((b) => b.id === project?.buildingTypeId) || null;
  const city = region?.city || region?.label || "";

  const sheets = {
    表紙: [
      ["帳票", "建築物熱負荷計算書"],
      ["案件名", cell(project?.projectName)],
      ["発注者", cell(project?.client)],
      ["建築物用途", cell(buildingType?.label)],
      ["建設地", cell(project?.siteAddress) || cell(city)],
      ["地域区分", cell(region?.label)],
      ["出力日時", new Date().toLocaleString("ja-JP")],
      ["計算方法", cell(detailed?.method === "detailed" ? "建築設備設計基準 令和6年版 詳細方式(積み上げ)" : detailed?.method)],
    ],
    熱負荷計算書: [
      ["室名", "階", "系統", "冷房 全熱(kW)", "暖房 全熱(kW)"],
      ...((detailed?.aggregateRooms || []).map((x) => [cell(x[0]), cell(x[1]), cell(x[2]), cell(x[3]), cell(x[4])])),
    ],
    熱負荷集計表: [
      ["集計単位", "名称", "冷房 全熱(kW)", "暖房 全熱(kW)"],
      ...(aggregate?.byRoom || []).map((x) => ["室", cell(x.roomName), cell(x.designLoadCoolingKW), cell(x.designLoadHeatingKW)]),
      ...(aggregate?.bySystem || []).map((x) => ["系統", cell(x.label), cell(x.designLoadCoolingKW), cell(x.designLoadHeatingKW)]),
      ...(aggregate?.byFloor || []).map((x) => ["階", cell(x.label), cell(x.designLoadCoolingKW), cell(x.designLoadHeatingKW)]),
      ...(aggregate?.building ? [["建物", cell(aggregate.building.label), cell(aggregate.building.designLoadCoolingKW), cell(aggregate.building.designLoadHeatingKW)]] : []),
    ],
  };

  // 設計条件9帳票(負荷計算の条件区分ごと)
  for (const item of REPORT_R6_SEQUENCE) {
    sheets[item.sheet] = item.rows(detailed);
  }

  // チェックリスト6帳票
  for (const item of CHECKLIST_ITEMS) {
    sheets[item.sheet] = item.rows({ detailed, aggregate, project });
  }

  return {
    title: "建築物熱負荷計算書",
    sheetOrder: ["表紙", "熱負荷計算書", "熱負荷集計表", ...REPORT_R6_SEQUENCE.map((i) => i.sheet), ...CHECKLIST_ITEMS.map((i) => i.sheet)],
    sheets,
  };
}

/** TSV(Excel取込可)。帳票順に連結する。 */
export function buildTsv(workbook) {
  const escapeTsv = (value) => String(value ?? "").replaceAll("\t", " ").replaceAll(/\r?\n/g, " ");
  const lines = [];
  for (const name of workbook.sheetOrder) {
    lines.push(`# ${name}`);
    for (const row of workbook.sheets[name] || []) lines.push(row.map(escapeTsv).join("\t"));
    lines.push("");
  }
  return `\ufeff${lines.join("\r\n")}`;
}

export function downloadTsv(workbook, filename = "hvac-load-reports.tsv") {
  const safeName = String(filename || "hvac-load-reports.tsv").replace(/[/\\?%*:|"<>]/g, "_");
  const blob = new Blob([buildTsv(workbook)], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}
