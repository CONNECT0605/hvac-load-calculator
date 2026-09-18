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
      <div className="px-4 md:px-6 flex items-center justify-between gap-4" style={{ maxWidth: 1400, margin: "0 auto", minHeight: 56 }}>
        <div className="min-w-0">
          <div className="title-tight truncate-safe" style={{ color: T.ink, fontSize: 15 }}>空調負荷計算</div>
          <div className="truncate-safe" style={{ color: T.grayLight, fontSize: 11 }}>{projectName || "案件未設定"}</div>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className="ui-tab px-3 py-1.5"
              style={{
                color: screen === tab.id ? T.ink : T.gray,
                fontSize: 12,
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
        const complete = doneCount === stage.steps.length;
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelect(stage.steps[0])}
            className="ui-tab text-left px-3.5 py-2.5 flex-1 min-w-[130px]"
            style={{
              background: on ? T.accentWash : "#FFFFFF",
              border: `1px solid ${on ? T.navy : T.line}`,
              borderTop: `2px solid ${on ? T.navy : T.line}`,
              borderRadius: 2,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span style={{ color: on ? T.navy : T.ink2, fontSize: 12, fontWeight: on ? 600 : 500 }}>
                {stage.label}
              </span>
              <span className="tnum" style={{ color: complete ? T.ok : T.grayLight, fontSize: 10 }}>
                {doneCount}/{stage.steps.length}
              </span>
            </div>
            <div className="mt-1 truncate-safe" style={{ color: T.grayLight, fontSize: 10 }}>
              {stage.note}
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
              className="ui-tab flex items-center gap-1.5 px-2.5 shrink-0"
              style={{
                background: on ? T.accentWash : "#FFFFFF",
                border: `1px solid ${on ? T.navy : T.line}`,
                borderRadius: 2,
                minHeight: 36,
              }}
            >
              <span
                className="tnum flex items-center justify-center"
                style={{
                  fontSize: 10,
                  width: 16,
                  height: 16,
                  borderRadius: 2,
                  color: done ? "#FFFFFF" : T.grayLight,
                  background: done ? T.navy : "#FFFFFF",
                  border: `1px solid ${done ? T.navy : T.line}`,
                }}
              >
                {s.no}
              </span>
              <span style={{ color: on ? T.navy : T.ink2, fontSize: 11, fontWeight: on ? 600 : 400 }}>
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
        <ul className="leading-relaxed" style={{ color: T.gray, fontSize: 11 }}>
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
        {STEPS.map((s) => {
          const isDone = stepStatus[s.id]?.done;
          return (
            <span
              key={s.id}
              title={s.label}
              className="tnum"
              style={{
                fontSize: 10,
                width: 22,
                height: 20,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 2,
                color: isDone ? "#FFFFFF" : T.grayLight,
                background: isDone ? T.navy : "#FFFFFF",
                border: `1px solid ${isDone ? T.navy : T.line}`,
              }}
            >
              {s.no}
            </span>
          );
        })}
      </div>

      {/* 不足件数はこの画面で唯一「目を引く」必要がある数字。
          それ以外を静かに保つことで、この1つが埋もれない。 */}
      <div className="tnum leading-none" style={{ color: issues.length ? T.warn : T.ok }}>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>{issues.length}</span>
        <span style={{ fontSize: 11, marginLeft: 6, color: T.gray }}>件の不足・要確認</span>
      </div>
      {issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {issues.slice(0, 4).map((issue, i) => (
            <li key={i} className="leading-snug" style={{ color: T.ink2, fontSize: 10.5 }}>・{issue}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        {has ? (
          <div className="flex flex-col gap-4">
            <Stat label="冷房" value={num(calc.totals.designLoadCoolingKW)} unit="kW" tone="cooling" />
            <Stat label="暖房" value={num(calc.totals.designLoadHeatingKW)} unit="kW" tone="heating" />
            <Stat label="選定基準" value={num(calc.totals.requiredCapacityKW)} unit="kW" />
          </div>
        ) : (
          <p style={{ color: T.grayLight, fontSize: 11 }}>室の面積を入力すると計算値が出ます。</p>
        )}
      </div>

      <div className="tnum mt-4 leading-relaxed" style={{ color: T.grayLight, fontSize: 10 }}>
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
      {/* 現在地。長い画面をスクロールしても「今どこにいるか」を失わないよう、
          工程番号・名称・段を1行にまとめて先頭に固定する。 */}
      <div className="mb-3 flex items-baseline gap-2 flex-wrap">
        <span className="label-micro">{stage.label}</span>
        <span className="tnum" style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>
          {STEPS[index]?.no} / {STEPS.length}
        </span>
        <span style={{ color: T.ink2, fontSize: 13 }}>{STEPS[index]?.label}</span>
      </div>
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
          <span className="title-tight truncate-safe" style={{ color: T.ink, fontSize: 14 }}>空調負荷計算</span>
          <span className="truncate-safe" style={{ color: T.grayLight, fontSize: 11 }}>{projectName || "案件未設定"}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {[["home", "ホーム"], ["projects", "案件一覧"], ["workspace", "入力"], ["report", "レポート"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="ui-tab px-2.5 py-1"
              style={{
                color: screen === id ? "#FFFFFF" : T.ink2,
                background: screen === id ? T.navy : "#FFFFFF",
                border: `1px solid ${screen === id ? T.navy : T.line}`,
                fontSize: 11,
                borderRadius: 2,
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
              className="ui-tab px-2.5 py-1"
              style={{
                background: s.id === step ? T.accentWash : "#FFFFFF",
                color: T.ink2,
                border: `1px solid ${s.id === step ? T.navy : T.line}`,
                fontSize: 11,
                borderRadius: 2,
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
            className="ui-tab px-2.5 py-1.5 shrink-0"
            style={{ border: `1px solid ${T.lineStrong}`, color: T.ink2, background: "#FFFFFF", fontSize: 11, borderRadius: 2 }}
          >
            {open ? "閉じる" : "全ステップ"}
          </button>
          <span className="truncate-safe" style={{ color: T.ink, fontSize: 12 }}>
            <span className="tnum" style={{ color: T.grayLight, marginRight: 6 }}>{current?.no}/10</span>
            {current?.label}
          </span>
          {issues > 0 && (
            <span className="tnum shrink-0" style={{ color: T.warn, fontSize: 11 }}>不足 {issues}件</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="tnum" style={{ color: T.grayLight, fontSize: 11 }}>
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