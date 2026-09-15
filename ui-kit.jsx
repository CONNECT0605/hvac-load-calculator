// ui-kit.jsx
// Design A(白・ネイビー・ブルー・ブラック/グレー基調)の共通UIパーツ。
// 表示専用。計算・業務ロジックは一切持たない。
import { Component } from "react";

export const T = {
  navy: "#0F2A47",
  navyDeep: "#0A1D33",
  blue: "#1E5AA8",
  blueSoft: "#EAF1FA",
  ink: "#111827",
  gray: "#5B6672",
  grayLight: "#8B95A1",
  line: "#DCE2E9",
  lineSoft: "#EDF1F5",
  bg: "#F4F6F9",
  panel: "#FFFFFF",
  cooling: "#1E5AA8",
  heating: "#8C4A2F",
  warn: "#A66300",
  danger: "#A32B22",
  ok: "#1F6F52",
};

export function Panel({ title, subtitle, actions, children, tone = "default" }) {
  return (
    <section
      className="bg-white"
      style={{ border: `1px solid ${T.line}`, borderTop: tone === "accent" ? `2px solid ${T.navy}` : `1px solid ${T.line}` }}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 py-3" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
          <div>
            {title && <h2 className="text-[13px] font-semibold tracking-wide" style={{ color: T.navy }}>{title}</h2>}
            {subtitle && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: T.gray }}>{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Field({ label, unit, hint, required, children }) {
  return (
    <div className="py-2.5" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
      {/* 幅が足りない端末(320px級)では入力欄を折り返す。PC幅では flex-wrap が
          発動せず従来と同じ1行レイアウトになる。 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <label className="text-[12px] flex items-center gap-1.5" style={{ color: T.ink }}>
          {label}
          {required && <span className="text-[10px] px-1" style={{ color: T.danger, border: `1px solid ${T.danger}` }}>必須</span>}
        </label>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          {children}
          {unit && <span className="text-[11px] w-14 text-left shrink-0" style={{ color: T.gray }}>{unit}</span>}
        </div>
      </div>
      {hint && <p className="text-[11px] mt-1 leading-relaxed" style={{ color: T.grayLight }}>{hint}</p>}
    </div>
  );
}

const inputBase = "text-[13px] px-2 py-1.5 bg-white outline-none focus:ring-2";

export function NumberInput({ value, onChange, min, step = 1, width = "w-28", placeholder, disabled }) {
  return (
    <input
      type="number"
      value={value === null || value === undefined ? "" : value}
      min={min}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={`${inputBase} ${width} text-right font-mono tabular-nums`}
      style={{ border: `1px solid ${T.line}`, color: T.ink, "--tw-ring-color": T.blueSoft }}
    />
  );
}

export function TextInput({ value, onChange, width = "w-56", placeholder, disabled }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputBase} ${width}`}
      style={{ border: `1px solid ${T.line}`, color: T.ink, "--tw-ring-color": T.blueSoft }}
    />
  );
}

export function SelectInput({ value, onChange, options, width = "w-52", disabled }) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputBase} ${width}`}
      style={{ border: `1px solid ${T.line}`, color: T.ink }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-[12px]" style={{ color: T.ink }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Button({ children, onClick, variant = "default", size = "md", disabled, title }) {
  const styles = {
    primary: { background: T.navy, color: "#FFFFFF", border: `1px solid ${T.navy}` },
    default: { background: "#FFFFFF", color: T.ink, border: `1px solid ${T.line}` },
    accent: { background: T.blue, color: "#FFFFFF", border: `1px solid ${T.blue}` },
    ghost: { background: "transparent", color: T.blue, border: "1px solid transparent" },
    danger: { background: "#FFFFFF", color: T.danger, border: `1px solid ${T.danger}` },
  }[variant];
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-2 text-[12px]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${pad} font-medium whitespace-nowrap transition-opacity ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-85"}`}
      style={styles}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = "info" }) {
  const color = { info: T.blue, muted: T.grayLight, warn: T.warn, danger: T.danger, ok: T.ok, navy: T.navy }[tone];
  return (
    <span className="text-[10px] px-1.5 py-0.5 whitespace-nowrap" style={{ color, border: `1px solid ${color}` }}>
      {children}
    </span>
  );
}

export function Note({ children, tone = "info" }) {
  const color = { info: T.blue, warn: T.warn, danger: T.danger, muted: T.grayLight }[tone];
  return (
    <div className="px-3 py-2 text-[11px] leading-relaxed" style={{ borderLeft: `3px solid ${color}`, background: T.bg, color: T.gray }}>
      {children}
    </div>
  );
}

export function Stat({ label, value, unit, tone = "ink", sub }) {
  const color = { ink: T.ink, cooling: T.cooling, heating: T.heating, blue: T.blue }[tone];
  return (
    <div>
      <div className="text-[11px]" style={{ color: T.gray }}>{label}</div>
      <div className="font-mono tabular-nums leading-tight" style={{ color }}>
        <span className="text-[20px]">{value}</span>
        {unit && <span className="text-[11px] ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: T.grayLight }}>{sub}</div>}
    </div>
  );
}

export function Table({ head, children, minWidth = 0 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" style={{ minWidth: minWidth || undefined }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}`, background: T.bg }}>
            {head.map((h) => (
              <th
                key={h.key ?? h.label}
                className={`font-medium py-2 px-2 ${h.align === "right" ? "text-right" : "text-left"}`}
                style={{ color: T.gray, width: h.width }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, align = "left", mono, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      className={`py-2 px-2 ${align === "right" ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""}`}
      style={{ borderBottom: `1px solid ${T.lineSoft}`, color: T.ink }}
    >
      {children}
    </td>
  );
}

export function EmptyState({ message, action }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[12px]" style={{ color: T.grayLight }}>{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// 予期しない例外でReactツリー全体が消え「白画面」になるのを防ぐ最後の砦。
// 計算結果は変更せず、表示のみを守る。保存済みデータには触れない。
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[HVAC] 予期しないエラーを検出しました", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen px-6 py-10" style={{ background: T.bg, color: T.ink }}>
        <div className="max-w-[720px] mx-auto">
          <h1 className="text-[18px] font-semibold mb-3">画面の表示中にエラーが発生しました</h1>
          <p className="text-[13px] mb-4" style={{ color: T.gray }}>
            入力内容や保存済みの案件データは失われていません。以下の内容を確認してください。
          </p>
          <pre
            className="text-[12px] p-3 rounded overflow-auto mb-4"
            style={{ background: T.lineSoft, color: T.ink, border: `1px solid ${T.line}` }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>再読み込み</Button>
            <Button onClick={() => this.setState({ error: null })}>表示を戻す</Button>
          </div>
        </div>
      </div>
    );
  }
}
