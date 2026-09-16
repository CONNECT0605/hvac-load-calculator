// app-screens.jsx
// Home / 案件一覧 / 左ステップナビ / 右ステータスパネル / 天気予報 / レポート。
// 計算は行わず、計算エンジンの結果(calc)と案件データを表示するだけ。

import { useEffect, useState } from "react";
import { STEPS, projectSummaryRows, roomAreaTotal } from "./project-model.mjs";
import { cityForRegion, fetchForecast, formatForecastDate } from "./weather.mjs";
import { ESTIMATE_NOTICES } from "./report-data.mjs";
import {
  Button,
  EmptyState,
  Note,
  Panel,
  Stat,
  T,
  Table,
  Tag,
  Td,
} from "./ui-kit.jsx";

const num = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "―");
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString("ja-JP") : "―");

export function AppHeader({ projectName, screen, onNavigate, onSave, saveDisabled }) {
  const tabs = [
    { id: "home", label: "ホーム" },
    { id: "projects", label: "案件一覧" },
    { id: "workspace", label: "入力・計算" },
    { id: "report", label: "レポート" },
  ];
  return (
    <header className="no-print" style={{ background: T.navyDeep }}>
      <div className="px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-wide text-white">空調負荷計算 / 機器選定</span>
          <span className="text-[11px]" style={{ color: "#9DB2C9" }}>{projectName || "―"}</span>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className="px-3 py-1.5 text-[12px]"
              style={{
                color: screen === tab.id ? "#FFFFFF" : "#9DB2C9",
                borderBottom: screen === tab.id ? `2px solid ${T.blue}` : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-3">
            <Button variant="accent" size="sm" onClick={onSave} disabled={saveDisabled}>案件を保存</Button>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function StepNav({ current, stepStatus, onSelect }) {
  // モバイル/タブレットでは10ステップの一覧が入力欄より上に全展開され、
  // 入力開始までスクロールが必要になるため、既定では折りたたみ現在ステップのみ表示する。
  // PC(lg以上)では従来どおり常時全表示。
  const [open, setOpen] = useState(false);
  const currentStep = STEPS.find((s) => s.id === current);
  const doneCount = STEPS.filter((s) => stepStatus[s.id]?.done).length;

  const handleSelect = (stepId) => {
    onSelect(stepId);
    setOpen(false);
  };

  return (
    <nav className="bg-white" style={{ border: `1px solid ${T.line}` }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold" style={{ color: T.navy }}>入力ステップ</div>
            <div className="text-[11px]" style={{ color: T.gray }}>
              {doneCount} / {STEPS.length} 完了
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden shrink-0 px-3 py-1.5 text-[12px]"
            style={{ border: `1px solid ${T.line}`, color: T.navy, background: "#FFFFFF" }}
            aria-expanded={open}
          >
            {open ? "一覧を閉じる" : "ステップ一覧"}
          </button>
        </div>
        {!open && (
          <div className="lg:hidden mt-2 text-[12px]" style={{ color: T.ink }}>
            <span className="font-mono mr-1.5" style={{ color: T.navy }}>{currentStep?.no}.</span>
            {currentStep?.label}
          </div>
        )}
      </div>
      <ol className={open ? "block" : "hidden lg:block"}>
        {STEPS.map((step) => {
          const status = stepStatus[step.id] || {};
          const active = current === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                data-testid={`step-nav-${step.id}`}
                onClick={() => handleSelect(step.id)}
                className="w-full text-left px-4 py-2.5 flex items-start gap-3"
                style={{
                  background: active ? T.blueSoft : "transparent",
                  borderLeft: active ? `3px solid ${T.navy}` : "3px solid transparent",
                  borderBottom: `1px solid ${T.lineSoft}`,
                }}
              >
                <span
                  className="text-[11px] font-mono w-5 h-5 flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    color: status.done ? "#FFFFFF" : T.gray,
                    background: status.done ? T.navy : "#FFFFFF",
                    border: `1px solid ${status.done ? T.navy : T.line}`,
                  }}
                >
                  {step.no}
                </span>
                <span className="min-w-0">
                  <span className="text-[12px] block" style={{ color: active ? T.navy : T.ink, fontWeight: active ? 600 : 400 }}>
                    {step.label}
                    {status.optional && !status.done && <span className="ml-1.5 text-[10px]" style={{ color: T.grayLight }}>任意</span>}
                  </span>
                  <span className="text-[10px] block leading-snug" style={{ color: T.grayLight }}>{step.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StatusPanel({ project, calc, stepStatus, regionId }) {
  const issues = STEPS.flatMap((step) => (stepStatus[step.id]?.issues || []).map((issue) => ({ step, issue })));
  const done = STEPS.filter((s) => stepStatus[s.id]?.done).length;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="進捗" subtitle={`${done} / ${STEPS.length} ステップ完了`}>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((step) => (
            <span
              key={step.id}
              title={step.label}
              className="text-[10px] px-1.5 py-0.5"
              style={{
                color: stepStatus[step.id]?.done ? "#FFFFFF" : T.grayLight,
                background: stepStatus[step.id]?.done ? T.navy : "#FFFFFF",
                border: `1px solid ${stepStatus[step.id]?.done ? T.navy : T.line}`,
              }}
            >
              {step.no}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="現在の計算結果">
        {calc && calc.totals.validRoomCount > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            <Stat label="冷房" value={num(calc.totals.designLoadCoolingKW)} unit="kW" tone="cooling" />
            <Stat label="暖房" value={num(calc.totals.designLoadHeatingKW)} unit="kW" tone="heating" />
            <Stat label="選定基準" value={num(calc.totals.requiredCapacityKW)} unit="kW" />
            <Stat label="換気量" value={Math.round(calc.totals.ventilationM3h).toLocaleString()} unit="m³/h" tone="blue" />
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: T.grayLight }}>室の面積を入力すると計算結果が表示されます。</p>
        )}
        <div className="mt-3 text-[11px] leading-relaxed" style={{ color: T.gray }}>
          室数 {project.rooms.length} 室 / 室面積合計 {num(roomAreaTotal(project))} m² / 延床面積 {num(project.totalFloorArea)} m²
        </div>
      </Panel>

      <Panel title="入力不足・要確認" subtitle={issues.length ? `${issues.length}件` : "指摘なし"}>
        {issues.length === 0 ? (
          <p className="text-[12px]" style={{ color: T.ok }}>必須項目の未入力はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {issues.slice(0, 12).map(({ step, issue }, i) => (
              <li key={`${step.id}-${i}`} className="text-[11px] leading-relaxed flex gap-2" style={{ color: T.gray }}>
                <Tag tone="muted">{step.no}. {step.label}</Tag>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {calc && calc.warnings.length > 0 && (
        <Panel title="計算エンジンからの警告">
          <ul className="flex flex-col gap-1.5">
            {calc.warnings.slice(0, 10).map((w, i) => (
              <li key={i} className="text-[11px] leading-relaxed" style={{ color: T.warn }}>⚠ {w}</li>
            ))}
          </ul>
        </Panel>
      )}

      <WeatherPanel regionId={regionId} />

      <Panel title="計算エンジンの適用範囲">
        <ul className="text-[11px] leading-relaxed" style={{ color: T.gray }}>
          {ESTIMATE_NOTICES.map((notice) => <li key={notice}>・{notice}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

export function WeatherPanel({ regionId }) {
  const [state, setState] = useState({ status: "loading", city: cityForRegion(regionId).city, days: [], error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", city: cityForRegion(regionId).city, days: [], error: null });
    fetchForecast(regionId)
      .then((res) => { if (!cancelled) setState({ status: "ok", city: res.city, days: res.days, error: null }); })
      .catch((error) => { if (!cancelled) setState({ status: "error", city: cityForRegion(regionId).city, days: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [regionId]);

  return (
    <Panel title="現場周辺の天気予報" subtitle={`${state.city}(地域区分の代表都市) / 施工計画の参考情報`}>
      {state.status === "loading" && <p className="text-[12px]" style={{ color: T.grayLight }}>取得中…</p>}
      {state.status === "error" && (
        <p className="text-[11px]" style={{ color: T.warn }}>天気予報を取得できませんでした（{state.error}）。計算結果には影響しません。</p>
      )}
      {state.status === "ok" && (
        <div className="flex flex-col gap-1.5">
          {state.days.map((day) => (
            <div key={day.date} className="flex items-center justify-between text-[12px]" style={{ color: T.ink }}>
              <span className="w-20" style={{ color: T.gray }}>{formatForecastDate(day.date)}</span>
              <span className="flex-1">{day.label}</span>
              <span className="font-mono tabular-nums">
                <span style={{ color: T.heating }}>{num(day.maxC)}</span>
                <span style={{ color: T.grayLight }}> / </span>
                <span style={{ color: T.cooling }}>{num(day.minC)}</span>
                <span className="text-[10px]" style={{ color: T.gray }}> ℃</span>
              </span>
              <span className="w-12 text-right font-mono tabular-nums text-[11px]" style={{ color: T.blue }}>
                {day.precipitationProbability === null ? "―" : `${day.precipitationProbability}%`}
              </span>
            </div>
          ))}
          <p className="text-[10px] mt-1" style={{ color: T.grayLight }}>
            出典: Open-Meteo。設計用外気条件ではなく、負荷計算には使用していません。
          </p>
        </div>
      )}
    </Panel>
  );
}

export function HomeScreen({ project, calc, savedProjects, regionId, onNewProject, onOpenProject, onImport, onNavigate }) {
  const recent = savedProjects.slice(0, 5);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 flex flex-col gap-5">
        <Panel title="はじめる" subtitle="案件を作成して、建物 → 階 → 室の順に入力します。" tone="accent">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onNewProject}>新規案件</Button>
            <Button onClick={() => onNavigate("workspace")}>入力を続ける</Button>
            <Button onClick={() => onNavigate("projects")}>案件一覧</Button>
            <Button onClick={onImport}>インポート</Button>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-5">
            <Stat label="編集中の案件" value={project.rooms.length} unit="室" sub={project.projectName} />
            <Stat label="冷房" value={calc ? num(calc.totals.designLoadCoolingKW) : "―"} unit="kW" tone="cooling" />
            <Stat label="暖房" value={calc ? num(calc.totals.designLoadHeatingKW) : "―"} unit="kW" tone="heating" />
            <Stat label="保存済み案件" value={savedProjects.length} unit="件" />
          </div>
        </Panel>

        <Panel title="最近の案件" actions={<Button size="sm" onClick={() => onNavigate("projects")}>すべて表示</Button>}>
          {recent.length === 0 ? (
            <EmptyState message="保存済みの案件はありません。" action={<Button variant="accent" size="sm" onClick={onNewProject}>新規案件を作成</Button>} />
          ) : (
            <Table head={[{ label: "案件名" }, { label: "更新日時" }, { label: "", align: "right" }]}>
              {recent.map((item) => (
                <tr key={item.projectId}>
                  <Td>{item.projectName}</Td>
                  <Td>{dateTime(item.updatedAt)}</Td>
                  <Td align="right"><Button size="sm" onClick={() => onOpenProject(item.projectId)}>開く</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="入力の流れ">
          <ol className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {STEPS.map((step) => (
              <li key={step.id} className="px-2 py-2 text-[11px]" style={{ border: `1px solid ${T.line}`, color: T.ink }}>
                <span className="font-mono" style={{ color: T.blue }}>{step.no}</span> {step.label}
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="flex flex-col gap-5">
        <WeatherPanel regionId={regionId} />
        <Panel title="このツールについて">
          <ul className="text-[11px] leading-relaxed" style={{ color: T.gray }}>
            {ESTIMATE_NOTICES.map((notice) => <li key={notice}>・{notice}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function ProjectListScreen({ savedProjects, currentProjectId, onOpenProject, onDuplicate, onDelete, onExport, onImport, onNewProject }) {
  return (
    <Panel
      title="案件一覧"
      subtitle="このブラウザに保存されている案件です。"
      tone="accent"
      actions={
        <>
          <Button size="sm" onClick={onImport}>インポート</Button>
          <Button size="sm" variant="primary" onClick={onNewProject}>新規案件</Button>
        </>
      }
    >
      {savedProjects.length === 0 ? (
        <EmptyState message="保存済みの案件はありません。" action={<Button variant="accent" size="sm" onClick={onNewProject}>新規案件を作成</Button>} />
      ) : (
        <Table head={[{ label: "案件名" }, { label: "作成日時" }, { label: "更新日時" }, { label: "", align: "right" }]}>
          {savedProjects.map((item) => (
            <tr key={item.projectId} style={item.projectId === currentProjectId ? { background: T.blueSoft } : undefined}>
              <Td>
                {item.projectName}
                {item.projectId === currentProjectId && <span className="ml-2"><Tag tone="navy">編集中</Tag></span>}
              </Td>
              <Td>{dateTime(item.createdAt)}</Td>
              <Td>{dateTime(item.updatedAt)}</Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="accent" onClick={() => onOpenProject(item.projectId)}>開く</Button>
                  <Button size="sm" onClick={() => onDuplicate(item.projectId)}>複製</Button>
                  <Button size="sm" onClick={() => onExport(item.projectId)}>書き出し</Button>
                  <Button size="sm" variant="danger" onClick={() => onDelete(item.projectId)}>削除</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export function ReportScreen({ project, calc, report, onDownloadCsv, onPrint, onDetailed, onBack }) {
  if (!calc || calc.totals.validRoomCount === 0 || !report) {
    return (
      <Panel title="レポート" tone="accent">
        <EmptyState message="計算結果がないためレポートを作成できません。" action={<Button size="sm" onClick={onBack}>入力に戻る</Button>} />
      </Panel>
    );
  }
  const section = (title, rows) => (
    <Panel title={title} key={title}>
      <Table head={[{ label: "項目", width: "40%" }, { label: "内容" }]}>
        {rows.map(([label, value]) => (
          <tr key={label}><Td>{label}</Td><Td>{value}</Td></tr>
        ))}
      </Table>
    </Panel>
  );
  return (
    <div className="flex flex-col gap-4 no-print">
      <Panel
        title="レポート"
        subtitle={`${project.projectName} / 出力日時 ${dateTime(report.generatedAt)}`}
        tone="accent"
        actions={
          <>
            <Button size="sm" onClick={onBack}>入力に戻る</Button>
            {onDetailed && <Button size="sm" onClick={onDetailed}>詳細方式の計算書</Button>}
            <Button size="sm" onClick={onDownloadCsv}>CSV出力</Button>
            <Button size="sm" variant="primary" onClick={onPrint}>印刷 / PDF</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="設計用必要冷房能力" value={num(calc.totals.designLoadCoolingKW)} unit="kW" tone="cooling" />
          <Stat label="設計用必要暖房能力" value={num(calc.totals.designLoadHeatingKW)} unit="kW" tone="heating" />
          <Stat label="選定基準能力" value={num(calc.totals.requiredCapacityKW)} unit="kW" />
          <Stat label="必要換気量 合計" value={Math.round(calc.totals.ventilationM3h).toLocaleString()} unit="m³/h" tone="blue" />
        </div>
        <div className="mt-4">
          <Note tone="warn">{report.method}</Note>
        </div>
      </Panel>

      {section("案件概要", projectSummaryRows(project, calc))}
      {section("計算条件", report.conditions)}
      {section("計算根拠", report.basis)}
      {section("計算結果(建物全体)", report.results)}
      {section("機器選定", report.equipment)}

      <Panel title="室別 内訳">
        <Table head={[{ label: "室名" }, { label: "面積 (m²)", align: "right" }, { label: "冷房 (kW)", align: "right" }, { label: "暖房 (kW)", align: "right" }, { label: "換気量 (m³/h)", align: "right" }]}>
          {calc.rooms.map(({ room, loadResult }) => (
            <tr key={room.roomId}>
              <Td>{room.name || "(室名未設定)"}</Td>
              <Td align="right" mono>{num(room.floorArea)}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? num(loadResult.designLoadCoolingKW) : "―"}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? num(loadResult.designLoadHeatingKW) : "―"}</Td>
              <Td align="right" mono>{loadResult.status === "ok" ? Math.round(loadResult.ventilationM3h).toLocaleString() : "―"}</Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="警告・要確認">
        {report.warnings.length === 0 ? (
          <p className="text-[12px]" style={{ color: T.ok }}>警告はありません。</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {report.warnings.map((w, i) => <li key={i} className="text-[11px]" style={{ color: T.warn }}>⚠ {w}</li>)}
          </ul>
        )}
      </Panel>

      <Panel title="注意事項">
        <ul className="text-[11px] leading-relaxed" style={{ color: T.gray }}>
          {report.notices.map((notice) => <li key={notice}>・{notice}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * R6詳細方式(積み上げ)の熱負荷計算書。計算はせず、detailed-report.mjs の整形結果を表示する。
 */
export function DetailedReportScreen({ project, detailedReport, onDownloadCsv, onPrint, onBack }) {
  if (!detailedReport) {
    return (
      <Panel title="熱負荷計算書(R6詳細方式)" tone="accent">
        <EmptyState message="計算可能な室がないため詳細方式の計算書を作成できません。" action={<Button size="sm" onClick={onBack}>入力に戻る</Button>} />
      </Panel>
    );
  }
  const section = (title, rows, head = ["項目", "内容", "補足"]) => (
    <Panel title={title} key={title}>
      <Table head={head.map((label, i) => ({ label, align: i === 0 ? "left" : "left" }))}>
        {rows.map((row, i) => (
          <tr key={`${title}-${i}`}>
            {row.map((cell, j) => <Td key={j}>{cell}</Td>)}
          </tr>
        ))}
      </Table>
    </Panel>
  );
  const r = detailedReport;
  const maxOf = (label) => r.maximums.find((m) => m[0] === label);
  const numOf = (label) => {
    const row = maxOf(label);
    return row ? Number(String(row[1]).replace(/[^\d.-]/g, "")) : NaN;
  };
  return (
    <div className="flex flex-col gap-4 no-print">
      <Panel
        title="熱負荷計算書(R6詳細方式)"
        subtitle={`${r.project.name} / 出力日時 ${dateTime(r.generatedAt)}`}
        tone="accent"
        actions={
          <>
            <Button size="sm" onClick={onBack}>入力に戻る</Button>
            <Button size="sm" onClick={onDownloadCsv}>CSV出力(詳細)</Button>
            <Button size="sm" variant="primary" onClick={onPrint}>印刷 / PDF</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="設計用必要冷房能力" value={num(numOf("設計用冷房負荷(余裕率込)"), 1)} unit="kW" tone="cooling" />
          <Stat label="最大冷房全熱" value={num(numOf("冷房 最大全熱"), 1)} unit="kW" tone="cooling" />
          <Stat label="最大冷房発生時刻" value={maxOf("冷房 最大全熱") ? String(maxOf("冷房 最大全熱")[2]).replace(" 時", "") : "―"} unit="時" />
          <Stat label="必要換気量" value={String((r.ventilation.find((v) => v[0] === "外気量") || ["", "―"])[1]).replace(/ m³\/h/, "")} unit="m³/h" tone="blue" />
        </div>
        <div className="mt-4">
          <Note tone="warn">{r.method}</Note>
        </div>
      </Panel>

      {section("設計条件", r.conditions.map(([k, v]) => [k, v]))}
      {section("最大負荷一覧", r.maximums.map(([k, v, t]) => [k, v, t]))}
      {section("負荷詳細(冷房 8項目)", r.coolingItems.map((row) => [`${row[0]}. ${row[1]}`, row[3], row[2]]))}
      {section("負荷詳細(暖房 5項目)", r.heatingItems.map((row) => [`${row[0]}. ${row[1]}`, row[3], row[2]]))}
      {section("負荷内訳(冷房・ピーク時刻)", (r.breakdown || []).map(([k, v]) => [k, v]))}
      {section("負荷内訳(暖房・ピーク時刻)", (r.heatingBreakdown || []).map(([k, v]) => [k, v]))}
      {section("時刻別一覧", r.hourly.map((row) => [row[0], `顕熱 ${row[2]} / 潜熱 ${row[3]} / 全熱 ${row[4]}`, `暖房 ${row[5]} / 外気 ${row[1]}`]))}
      {section("室別集計", r.aggregateRooms.map((row) => [row[0], `冷房 ${row[4]} / 暖房 ${row[5]}`, `${row[1]} / ${row[2]} / ${row[3]}`]))}
      {section("系統集計", r.aggregateSystems.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `基準 ${row[5]} / ${row[1]} / ${row[2]}`]))}
      {section("階集計", r.aggregateFloors.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `${row[1]} / ${row[2]}`]))}
      {section("建物集計", r.aggregateBuilding.map((row) => [row[0], `冷房 ${row[3]} / 暖房 ${row[4]}`, `基準 ${row[5]} / ${row[1]} / ${row[2]}`]))}
      {section("換気量・すきま風量", r.ventilation.map(([k, v]) => [k, v]))}
      {section("係数と出典", r.coefficientSources.map((row) => [row[0], `${row[1]}`, `${row[2]} / ${row[4]}`]))}
      {section("基準値で補完した項目", r.defaultedFromR6.map((d) => [d, "基準値で補完", ""]))}
      {section("未確認事項(値を創作せず明示)", r.notVerified.map((n) => [n, "要確認", ""]))}
      {section("警告", r.warnings.length ? r.warnings.map((w) => [w, "要確認", ""]) : [["警告はありません。", "", ""]])}
      {section("チェックリスト", r.checklist.map((row) => [row[1], row[2], row[3]]))}
    </div>
  );
}
