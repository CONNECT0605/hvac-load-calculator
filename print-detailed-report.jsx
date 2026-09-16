// R6詳細方式(熱負荷計算書)の印刷用DOM。
// 計算は行わず、detailed-report.mjs の整形結果をそのまま出力する。
import { T } from "./ui-kit.jsx";

function Section({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="print-section">
      <h2>{title}</h2>
      <table>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {row.map((cell, j) => (j === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function PrintDetailedReport({ report }) {
  if (!report) return null;
  const r = report;
  return (
    <article id="print-detailed-report" className="print-only">
      <h1>{r.title}</h1>
      <p><strong>案件名:</strong> {r.project.name}</p>
      <p><strong>出力日時:</strong> {new Date(r.generatedAt).toLocaleString("ja-JP")}</p>
      <p><strong>計算方法:</strong> {r.method}</p>
      <Section title="設計条件" rows={r.conditions.map(([k, v]) => [k, v])} />
      <Section title="最大負荷一覧" rows={r.maximums.map(([k, v, t]) => [k, v, t])} />
      <Section title="負荷詳細(冷房 8項目)" rows={r.coolingItems.map((row) => [`${row[0]}. ${row[1]}`, row[3], row[2]])} />
      <Section title="負荷詳細(暖房 5項目)" rows={r.heatingItems.map((row) => [`${row[0]}. ${row[1]}`, row[3], row[2]])} />
      <Section title="負荷内訳(冷房・ピーク時刻)" rows={(r.breakdown || []).map(([k, v]) => [k, v])} />
      <Section title="負荷内訳(暖房・ピーク時刻)" rows={(r.heatingBreakdown || []).map(([k, v]) => [k, v])} />
      <Section title="時刻別一覧" rows={r.hourly.map((row) => [row[0], `顕熱 ${row[2]} / 潜熱 ${row[3]} / 全熱 ${row[4]}`, `暖房 ${row[5]} / 外気 ${row[1]}`])} />
      <Section title="室別集計" rows={r.aggregateRooms.map((row) => [row[0], `冷房 ${row[4]} / 暖房 ${row[5]}`, `${row[1]} / ${row[2]} / ${row[3]}`])} />
      <Section title="系統集計" rows={r.aggregateSystems.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `基準 ${row[5]}`])} />
      <Section title="階集計" rows={r.aggregateFloors.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `${row[1]}`])} />
      <Section title="建物集計" rows={r.aggregateBuilding.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `基準 ${row[5]}`])} />
      <Section title="換気量・すきま風量" rows={r.ventilation.map(([k, v]) => [k, v])} />
      <Section title="係数と出典" rows={r.coefficientSources.map((row) => [row[0], row[1], `${row[2]} / ${row[4]}`])} />
      <Section title="基準値で補完した項目" rows={r.defaultedFromR6.map((d) => [d, "基準値で補完"])} />
      <Section title="未確認事項(値を創作せず明示)" rows={r.notVerified.map((n) => [n, "要確認"])} />
      <Section title="警告" rows={r.warnings.length ? r.warnings.map((w) => [w, "要確認"]) : [["状態", "警告なし"]]} />
      <Section title="チェックリスト" rows={r.checklist.map((row) => [row[1], row[2], row[3]])} />
      <p className="print-footer" style={{ color: T.gray }}>
        未確認の係数・データは計算に寄与させず、未確認事項として明示しています。推測値・ダミー値は使用していません。
      </p>
    </article>
  );
}
