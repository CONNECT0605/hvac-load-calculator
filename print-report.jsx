function Section({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="print-section">
      <h2>{title}</h2>
      <table><tbody>{rows.map(([label, value], index) => <tr key={`${label}-${index}`}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
    </section>
  );
}

export default function PrintReport({ report }) {
  return (
    <article id="print-report" className="print-only">
      <h1>{report.title}</h1>
      <p><strong>案件名:</strong> {report.project.name}</p>
      <p><strong>出力日時:</strong> {new Date(report.generatedAt).toLocaleString("ja-JP")}</p>
      <Section title="計算方法・注意事項" rows={[["計算方法", report.method], ...report.notices.map((notice, index) => [`注意 ${index + 1}`, notice])]} />
      <Section title="計算条件" rows={report.conditions} />
      <Section title="計算根拠" rows={report.basis} />
      <Section title="計算結果" rows={report.results} />
      <Section title="室別内訳" rows={report.rooms} />
      <Section title="警告・要確認" rows={report.warnings.length ? report.warnings.map((warning, index) => [`警告 ${index + 1}`, warning]) : [["状態", "警告なし"]]} />
      <Section title="機器選定" rows={report.equipment} />
      <Section title="価格・工事費・概算見積" rows={report.pricing} />
      <p className="print-footer">価格、工事費、原価、利益率は sample / assumption を含みます。原単位・地域補正・温度補正は provisional（暫定値）です。</p>
    </article>
  );
}
