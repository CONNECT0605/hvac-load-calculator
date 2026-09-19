// ui-kit.jsx
// 共通UIパーツ。表示専用で、計算・業務ロジックは一切持たない。
//
// 設計方針「現場は複雑、画面は静か。」
//  - 構造は「面」ではなく極細の罫線で示す(影やべた塗りを多用しない)
//  - 色は意味にだけ使う(冷房=青 / 暖房=茶 / 注意=琥珀 / 危険=赤 / 完了=緑)
//  - 数字は等幅tabular。桁が揺れないこと自体を可読性として扱う
//  - 小さな文字ほど字間を開ける(マイクロラベル)。本文と競合させない
//  - 太さは600まで。700は使わない(圧が強すぎて疲れる)
import { Component } from "react";

export const T = {
  navy: "#1B3A5C",
  navyDeep: "#12293F",
  blue: "#1F5F9E",
  blueSoft: "#F2F6FA",
  ink: "#14161A",
  ink2: "#3D434C",
  gray: "#5B6672",
  grayLight: "#656E7C",
  line: "#E5E6E4",
  lineSoft: "#F0F1EF",
  lineStrong: "#D3D5D2",
  bg: "#F4F4F2",
  panel: "#FFFFFF",
  cooling: "#1F5F9E",
  heating: "#8A4A2B",
  warn: "#9A6400",
  warnWash: "#FDF8EE",
  danger: "#A12A20",
  dangerWash: "#FDF3F2",
  ok: "#1D6B4F",
  okWash: "#F1F8F4",
  accentWash: "#F2F6FA",
};

const FONT_STACK = "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',system-ui,sans-serif";

export function Panel({ title, subtitle, actions, children, tone = "default", dense }) {
  return (
    <section
      className="bg-white"
      style={{
        border: `1px solid ${T.line}`,
        borderTop: tone === "accent" ? `2px solid ${T.navy}` : `1px solid ${T.line}`,
        borderRadius: 2,
      }}
    >
      {(title || actions) && (
        <header
          className={`flex items-start justify-between gap-4 ${dense ? "px-4 py-2" : "px-5 py-3.5"}`}
          style={{ borderBottom: `1px solid ${T.lineSoft}` }}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="title-tight" style={{ color: T.navy, fontSize: 13, lineHeight: 1.4 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 leading-relaxed" style={{ color: T.gray, fontSize: 11 }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={dense ? "px-4 py-3" : "px-5 py-4"}>{children}</div>
    </section>
  );
}

export function Field({ label, unit, hint, required, children }) {
  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
      {/* 幅が足りない端末(320px級)では入力欄を折り返す。PC幅では flex-wrap が
          発動せず従来と同じ1行レイアウトになる。 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <label
          className="flex items-center gap-1.5 shrink-0"
          style={{ color: T.ink2, fontSize: 12, lineHeight: 1.5 }}
        >
          {label}
          {required && (
            <span
              className="label-micro"
              style={{
                color: T.danger,
                border: `1px solid ${T.danger}`,
                padding: "0 3px",
                lineHeight: 1.6,
                letterSpacing: "0.08em",
              }}
            >
              必須
            </span>
          )}
        </label>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          {children}
          {unit && (
            <span className="shrink-0" style={{ color: T.grayLight, fontSize: 11, width: 56, textAlign: "left" }}>
              {unit}
            </span>
          )}
        </div>
      </div>
      {hint && (
        <p className="mt-1.5 leading-relaxed" style={{ color: T.grayLight, fontSize: 11 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// 入力欄は「枠」より「面＋下線」で静かに見せる。focus時だけ意味のある色を使う。
const inputBase = "ui-input outline-none transition-colors duration-100";

function inputStyle(extra) {
  return {
    border: `1px solid ${T.line}`,
    borderRadius: 2,
    background: "#FFFFFF",
    color: T.ink,
    fontSize: 13,
    padding: "6px 8px",
    ...extra,
  };
}

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
      className={`${inputBase} ${width} text-right tnum`}
      style={inputStyle({ opacity: disabled ? 0.55 : 1 })}
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
      style={inputStyle({ opacity: disabled ? 0.55 : 1 })}
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
      style={inputStyle({ opacity: disabled ? 0.55 : 1 })}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2" style={{ color: T.ink2, fontSize: 12 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Button({ children, onClick, variant = "default", size = "md", disabled, title }) {
  const base = {
    primary: { background: T.navy, color: "#FFFFFF", border: `1px solid ${T.navy}` },
    default: { background: "#FFFFFF", color: T.ink, border: `1px solid ${T.lineStrong}` },
    accent: { background: T.blue, color: "#FFFFFF", border: `1px solid ${T.blue}` },
    ghost: { background: "transparent", color: T.blue, border: "1px solid transparent" },
    danger: { background: "#FFFFFF", color: T.danger, border: `1px solid ${T.lineStrong}` },
  }[variant];
  const pad = size === "sm" ? "px-3 py-1.5" : "px-3.5 py-2";
  const fs = size === "sm" ? 11 : 12;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-variant={variant}
      className={`ui-btn ${pad} font-medium whitespace-nowrap`}
      style={{
        ...base,
        fontSize: fs,
        lineHeight: 1.5,
        borderRadius: 2,
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Tag({ children, tone = "info" }) {
  const map = {
    info: [T.blue, T.blueSoft],
    muted: [T.gray, "transparent"],
    warn: [T.warn, T.warnWash],
    danger: [T.danger, T.dangerWash],
    ok: [T.ok, T.okWash],
    navy: [T.navy, T.accentWash],
  }[tone];
  const [color, wash] = map;
  return (
    <span
      className="whitespace-nowrap"
      style={{
        color,
        background: wash,
        border: `1px solid ${wash === "transparent" ? T.line : color}`,
        fontSize: 10,
        lineHeight: 1.7,
        padding: "0 5px",
        borderRadius: 2,
      }}
    >
      {children}
    </span>
  );
}

export function Note({ children, tone = "info" }) {
  const map = {
    info: [T.blue, T.accentWash],
    warn: [T.warn, T.warnWash],
    danger: [T.danger, T.dangerWash],
    ok: [T.ok, T.okWash],
    muted: [T.grayLight, T.bg],
  }[tone];
  const [color, wash] = map;
  return (
    <div
      className="leading-relaxed"
      style={{
        borderLeft: `2px solid ${color}`,
        background: wash,
        color: T.ink2,
        fontSize: 11.5,
        padding: "8px 12px",
        borderRadius: "0 2px 2px 0",
      }}
    >
      {children}
    </div>
  );
}

// 数値表示。数字だけを大きく、ラベルと単位は小さく。
// 桁揺れを止めることで「読む」より「照合する」動作に向く。
export function Stat({ label, value, unit, tone = "ink", sub }) {
  const color = { ink: T.ink, cooling: T.cooling, heating: T.heating, blue: T.blue, warn: T.warn }[tone];
  return (
    <div className="min-w-0">
      <div className="label-micro truncate-safe">{label}</div>
      <div className="tnum leading-none mt-1.5" style={{ color }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</span>
        {unit && <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 400 }}>{unit}</span>}
      </div>
      {sub && (
        <div className="mt-1 truncate-safe" style={{ color: T.grayLight, fontSize: 10 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function Table({ head, children, minWidth = 0 }) {
  return (
    <div className="overflow-x-auto">
      <table className="ui-table w-full" style={{ minWidth: minWidth || undefined, fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.lineStrong}` }}>
            {head.map((h) => (
              <th
                key={h.key ?? h.label}
                className={`font-medium py-2 px-2 ${h.align === "right" ? "text-right" : "text-left"}`}
                style={{ color: T.gray, width: h.width, fontSize: 10.5, letterSpacing: "0.06em" }}
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
      className={`py-2 px-2 ${align === "right" ? "text-right" : ""} ${mono ? "tnum" : ""}`}
      style={{ borderBottom: `1px solid ${T.lineSoft}`, color: T.ink2, fontSize: 12, lineHeight: 1.55 }}
    >
      {children}
    </td>
  );
}

export function EmptyState({ message, action }) {
  return (
    <div className="py-12 text-center">
      <p style={{ color: T.grayLight, fontSize: 12 }}>{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
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
      <div className="min-h-screen px-6 py-10" style={{ background: T.bg, color: T.ink, fontFamily: FONT_STACK }}>
        <div className="mx-auto" style={{ maxWidth: 720 }}>
          <h1 className="title-tight mb-3" style={{ fontSize: 17 }}>画面の表示中にエラーが発生しました</h1>
          <p className="mb-4" style={{ color: T.gray, fontSize: 13, lineHeight: 1.7 }}>
            入力内容や保存済みの案件データは失われていません。以下の内容を確認してください。
          </p>
          <pre
            className="p-3 overflow-auto mb-4"
            style={{ background: T.lineSoft, color: T.ink, border: `1px solid ${T.line}`, fontSize: 12, borderRadius: 2 }}
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
