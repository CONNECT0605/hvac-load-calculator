// design-variants.jsx
// A/B/C のデザイン比較用。表示層(ヘッダー・ステップ導線・余白)のみを差し替える。
// 入力項目・計算・データモデルには一切触れない。
//
// - Design A: 現行。常時3カラム(ナビ/入力/ステータス)で全体を一望する実務型。
// - Design B: 青色の帯を排除し、入力を「つくる→あわせる→だす」の3段に集約。
//             右カラムを要点のみに絞り、視線を1列にまとめる。
// - Design C: 入力に集中するため右カラムを畳み、画面下に常時見える実行バーを置く。
//
// 既定は最終採用デザイン。A/B/C の切替は開発時(import.meta.env.DEV)のみ表示する。
import { createContext, useContext, useMemo, useState } from "react";
import { STEPS, roomAreaTotal } from "./project-model.mjs";
import { ESTIMATE_NOTICES } from "./report-data.mjs";
import { StepNav, WeatherPanel } from "./app-screens.jsx";
import StepEditor from "./step-screens.jsx";
import { Button, Panel, Stat, T } from "./ui-kit.jsx";

const num = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "―");

export const VARIANTS = ["A", "B", "C"];

// 最終採用デザイン。比較用の切替は ?design=A|B|C を付けたときだけ有効。
export const FINAL_VARIANT = "B";

// URLの ?design= から比較用デザインを読む。未指定なら最終採用デザイン。
// (本番でも ?design= を付ければ3案を見比べられる。通常の利用では切替UIは出ない)
export function readVariantFromUrl() {
  if (typeof window === "undefined") return { variant: FINAL_VARIANT, compare: false };
  const p = new URLSearchParams(window.location.search).get("design");
  const v = p ? p.toUpperCase() : null;
  if (v && VARIANTS.includes(v)) return { variant: v, compare: true };
  return { variant: FINAL_VARIANT, compare: false };
}

const VariantContext = createContext(FINAL_VARIANT);

export function ThemeProvider({ variant, children }) {
  const value = VARIANTS.includes(variant) ? variant : FINAL_VARIANT;
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

export function useVariant() {
  return useContext(VariantContext);
}

export function VariantSwitcher({ variant, onChange }) {
  const labels = {
    A: "A: 一望型(現行)",
    B: "B: 段階誘導型",
    C: "C: 集中型",
  };
  return (
    <div
      className="fixed z-50 bottom-3 right-3 flex items-center gap-1 px-2 py-1.5 no-print"
      style={{ background: "#FFFFFF", border: `1px solid ${T.line}`, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
    >
      <span className="text-[10px] mr-1" style={{ color: T.gray }}>デザイン比較</span>
      {VARIANTS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className="text-[10px] px-2 py-1"
          style={{
            background: variant === v ? T.navy : "#FFFFFF",
            color: variant === v ? "#FFFFFF" : T.ink,
            border: `1px solid ${variant === v ? T.navy : T.line}`,
          }}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design B: 段階誘導型
// 入力の10項目を3つの段(つくる/あわせる/だす)にまとめ、いま何をすべきかを
// 1箇所で示す。右カラムは要点のみ(進捗の数字・不足件数・主要3値)。
// ---------------------------------------------------------------------------
const B_STAGES = [
  { id: "build", label: "① つくる", note: "案件・階・室", steps: ["building", "floors", "rooms"] },
  { id: "tune", label: "② あわせる", note: "室内条件・人員・発熱・外気・外皮", steps: ["conditions", "occupancy", "internal", "outdoorair", "envelope"] },
  { id: "out", label: "③ だす", note: "計算・結果", steps: ["calc", "result"] },
];

function stageOf(stepId) {
  return B_STAGES.find((s) => s.steps.includes(stepId))?.id ?? "build";
}

export function DesignBHeader({ projectName, screen, onNavigate, onSave, saveDisabled }) {
  const tabs = [
    { id: "home", label: "ホーム" },
    { id: "projects", label: "案件一覧" },
    { id: "workspace", label: "入力" },
    { id: "report", label: "レポート" },
  ];
  return (
    <header className="no-print bg-white" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold" style={{ color: T.navy }}>空調負荷計算</div>
          <div className="text-[11px] truncate" style={{ color: T.gray }}>{projectName}</div>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className="px-3 py-1.5 text-[12px]"
              style={{
                color: screen === tab.id ? T.navy : T.gray,
                fontWeight: screen === tab.id ? 600 : 400,
                borderBottom: screen === tab.id ? `2px solid ${T.navy}` : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-3">
            <Button variant="primary" size="sm" onClick={onSave} disabled={saveDisabled}>案件を保存</Button>
          </div>
        </nav>
      </div>
    </header>
  );
}

function DesignBStageTabs({ step, stepStatus, onSelect }) {
  const active = stageOf(step);
  return (
    <div className="flex flex-wrap items-stretch gap-2 mb-3">
      {B_STAGES.map((stage) => {
        const on = stage.id === active;
        const doneCount = stage.steps.filter((s) => stepStatus[s]?.done).length;
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelect(stage.steps[0])}
            className="text-left px-3.5 py-2 flex-1 min-w-[130px]"
            style={{
              background: on ? T.navy : "#FFFFFF",
              border: `1px solid ${on ? T.navy : T.line}`,
              borderTop: on ? `3px solid ${T.navy}` : `3px solid ${T.line}`,
            }}
          >
            <div className="text-[12px] font-semibold" style={{ color: on ? "#FFFFFF" : T.navy }}>
              {stage.label}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: on ? "#C9D8EA" : T.grayLight }}>
              {stage.note} ・ {doneCount}/{stage.steps.length}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// 段の内訳(1..10)を常時表示する。段だけでは目的の項目へ直接飛べないため、
// 1クリックで任意の項目へ移動できる導線を必ず残す。
function DesignBStepStrip({ step, stepStatus, onSelect }) {
  return (
    <div className="mb-4 -mx-1 px-1 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {STEPS.map((s) => {
          const on = s.id === step;
          const done = stepStatus[s.id]?.done;
          return (
            <button
              key={s.id}
              type="button"
              data-testid={`step-nav-${s.id}`}
              aria-label={`ステップ${s.no} ${s.label}`}
              onClick={() => onSelect(s.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
              style={{
                background: on ? T.blueSoft : "#FFFFFF",
                border: `1px solid ${on ? T.navy : T.line}`,
              }}
            >
              <span
                className="text-[10px] font-mono w-4 h-4 flex items-center justify-center"
                style={{
                  color: done ? "#FFFFFF" : T.gray,
                  background: done ? T.navy : "#FFFFFF",
                  border: `1px solid ${done ? T.navy : T.line}`,
                }}
              >
                {s.no}
              </span>
              <span className="text-[11px]" style={{ color: on ? T.navy : T.ink, fontWeight: on ? 600 : 400 }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 天気予報と計算エンジンの適用範囲は既存機能のため、どのデザインでも必ず表示する。
// (Design B/C で右カラムや配置を変えても、この2つは落とさない)
export function SecondaryInformation({ regionId }) {
  return (
    <div className="flex flex-col gap-4">
      <WeatherPanel regionId={regionId} />
      <Panel title="計算エンジンの適用範囲">
        <ul className="text-[11px] leading-relaxed" style={{ color: T.gray }}>
          {ESTIMATE_NOTICES.map((notice) => <li key={notice}>・{notice}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

function DesignBStatus({ project, calc, stepStatus, regionId }) {
  const issues = STEPS.flatMap((s) => (stepStatus[s.id]?.issues || []).map((issue) => issue));
  const has = calc && calc.totals.validRoomCount > 0;
  return (
    <Panel title="いまの状態" subtitle="進捗・不足・主要な計算値">
      <div className="flex flex-wrap gap-1 mb-4">
        {STEPS.map((s) => (
          <span
            key={s.id}
            title={s.label}
            className="text-[10px] px-1.5 py-0.5"
            style={{
              color: stepStatus[s.id]?.done ? "#FFFFFF" : T.grayLight,
              background: stepStatus[s.id]?.done ? T.navy : "#FFFFFF",
              border: `1px solid ${stepStatus[s.id]?.done ? T.navy : T.line}`,
            }}
          >
            {s.no}
          </span>
        ))}
      </div>

      <div className="text-[28px] leading-none font-mono tabular-nums" style={{ color: issues.length ? T.warn : T.ok }}>
        {issues.length}
        <span className="text-[11px] ml-1" style={{ color: T.gray }}>件の不足・要確認</span>
      </div>
      {issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {issues.slice(0, 4).map((issue, i) => (
            <li key={i} className="text-[10px] leading-snug" style={{ color: T.gray }}>・{issue}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        {has ? (
          <div className="flex flex-col gap-3">
            <Stat label="冷房" value={num(calc.totals.designLoadCoolingKW)} unit="kW" tone="cooling" />
            <Stat label="暖房" value={num(calc.totals.designLoadHeatingKW)} unit="kW" tone="heating" />
            <Stat label="選定基準" value={num(calc.totals.requiredCapacityKW)} unit="kW" />
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: T.grayLight }}>室の面積を入力すると計算値が出ます。</p>
        )}
      </div>

      <div className="mt-4 text-[10px] leading-relaxed" style={{ color: T.gray }}>
        室 {project.rooms.length} / 室面積合計 {num(roomAreaTotal(project))} m² / 延床 {num(project.totalFloorArea)} m²
      </div>
    </Panel>
  );
}

export function DesignBEditor(props) {
  const { step, stepStatus, onJump, onGoResult } = props;
  const index = STEPS.findIndex((s) => s.id === step);
  const atLast = index >= STEPS.length - 1;
  const stage = B_STAGES.find((s) => s.id === stageOf(step));
  const nextInStage = stage.steps[stage.steps.indexOf(step) + 1];
  const next = nextInStage ?? STEPS[index + 1]?.id;
  const prev = STEPS[index - 1]?.id;

  return (
    <div className="min-w-0" data-testid="step-editor">
      <DesignBStageTabs step={step} stepStatus={stepStatus} onSelect={onJump} />
      <DesignBStepStrip step={step} stepStatus={stepStatus} onSelect={onJump} />
      <StepEditor {...props} />
      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <Button onClick={() => prev && onJump(prev)} disabled={!prev}>前へ</Button>
        <div className="flex items-center gap-2">
          {!atLast && (
            <Button variant="primary" onClick={() => (next ? onJump(next) : onGoResult())}>
              次へ: {STEPS.find((s) => s.id === next)?.label ?? "結果"}
            </Button>
          )}
          {atLast && (
            <Button variant="primary" onClick={onGoResult}>レポートを見る</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DesignBWorkspace(props) {
  const { project, calc, stepStatus, regionId } = props;
  return (
    <div className="min-w-0 flex flex-col gap-4">
      <DesignBStatus project={project} calc={calc} stepStatus={stepStatus} regionId={regionId} />
      <SecondaryInformation regionId={regionId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Design C: 集中型
// 右カラムを畳んで入力幅を最大化し、画面下に常時見える実行バーを置く。
// ステップ移動はバーの「全ステップ」から行う。
// ---------------------------------------------------------------------------
export function DesignCHeader({ projectName, screen, onNavigate, onSave, saveDisabled }) {
  return (
    <header className="no-print" style={{ background: "#FFFFFF", borderBottom: `1px solid ${T.line}` }}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-[14px] font-semibold" style={{ color: T.navy }}>空調負荷計算</span>
          <span className="text-[11px] truncate" style={{ color: T.gray }}>{projectName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {[["home", "ホーム"], ["projects", "案件一覧"], ["workspace", "入力"], ["report", "レポート"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="px-2.5 py-1 text-[11px]"
              style={{
                color: screen === id ? "#FFFFFF" : T.ink,
                background: screen === id ? T.navy : "#FFFFFF",
                border: `1px solid ${screen === id ? T.navy : T.line}`,
              }}
            >
              {label}
            </button>
          ))}
          <Button variant="primary" size="sm" onClick={onSave} disabled={saveDisabled}>案件を保存</Button>
        </div>
      </div>
    </header>
  );
}

export function DesignCBar({ project, calc, step, stepStatus, onJump, onGoResult, onOpenReport }) {
  const [open, setOpen] = useState(false);
  const index = STEPS.findIndex((s) => s.id === step);
  const current = STEPS[index];
  const has = calc && calc.totals.validRoomCount > 0;
  const issues = STEPS.flatMap((s) => stepStatus[s.id]?.issues || []).length;

  return (
    <div className="no-print sticky bottom-0 z-40" style={{ background: "#FFFFFF", borderTop: `2px solid ${T.navy}` }}>
      {open && (
        <div className="px-4 py-2 flex flex-wrap gap-1" style={{ borderTop: `1px solid ${T.line}` }}>
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`step-nav-${s.id}`}
              onClick={() => { onJump(s.id); setOpen(false); }}
              className="text-[11px] px-2.5 py-1"
              style={{
                background: s.id === step ? T.blueSoft : "#FFFFFF",
                color: T.navy,
                border: `1px solid ${s.id === step ? T.navy : T.line}`,
              }}
            >
              {s.no}. {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] px-2.5 py-1.5 shrink-0"
            style={{ border: `1px solid ${T.line}`, color: T.navy, background: "#FFFFFF" }}
          >
            {open ? "閉じる" : "全ステップ"}
          </button>
          <span className="text-[12px] truncate" style={{ color: T.ink }}>
            <span className="font-mono mr-1.5" style={{ color: T.navy }}>{current?.no}/10</span>
            {current?.label}
          </span>
          {issues > 0 && (
            <span className="text-[11px] shrink-0" style={{ color: T.warn }}>不足 {issues}件</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tabular-nums" style={{ color: T.gray }}>
            {has ? `冷房 ${num(calc.totals.designLoadCoolingKW)} / 暖房 ${num(calc.totals.designLoadHeatingKW)} kW` : "未計算"}
          </span>
          {index > 0 && <Button size="sm" onClick={() => onJump(STEPS[index - 1].id)}>前へ</Button>}
          {index < STEPS.length - 1 ? (
            <Button variant="primary" size="sm" onClick={onGoResult} disabled={!has}>計算結果を表示</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onOpenReport}>レポート</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DesignCSubNote({ regionId }) {
  return <SecondaryInformation regionId={regionId} />;
}