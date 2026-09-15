# AGENTS.md

空調負荷計算Webアプリ(日本の空調設備施工・設計業務向け)。React + Vite。

## 絶対に守る制約

- `hvac-calc-engine.js` が計算エンジンの正本。**変更しない。**
- `hvac-load-calculator.jsx` 内の `// ===SHARED-LOGIC-START===`〜`END` は
  engine と一字一句同一でなければならない。`npm run check:sync` が機械検証する。
- 既存の計算式・係数・入力項目・データモデルを推測で追加・変更しない。
- 単位は SI(kW / m³/h / m² / ℃)。SF・BTU/hr・tonnage 等の海外単位は追加しない。
- UIは日本語。

## 構成

| ファイル | 役割 |
| --- | --- |
| `hvac-calc-engine.js` | 計算エンジン(正本) |
| `hvac-load-calculator.jsx` | アプリ本体。SHARED-LOGICを埋め込み。画面遷移と状態保持 |
| `project-model.mjs` | データモデル・`STEPS`・`computeProject`・`getStepStatus`・正規化 |
| `step-screens.jsx` | 10ステップの入力UI(`StepEditor`) |
| `app-screens.jsx` | ヘッダー・ホーム・案件一覧・`StepNav`・`StatusPanel`・`WeatherPanel`・レポート |
| `design-variants.jsx` | デザインA/B/C。レイアウト層のみ。**最終採用は B** |
| `ui-kit.jsx` | 表示部品。`ErrorBoundary` もここ |
| `project-storage.mjs` | localStorage 保存・読込・JSON入出力 |
| `report-data.mjs` / `export-csv.mjs` / `print-report.jsx` | 帳票・CSV・印刷 |
| `weather.mjs` | Open-Meteo(参考情報。**負荷計算には使わない**) |

## デザイン

最終採用は **Design B(段階誘導型)**。`?design=A|B|C` で3案を比較できる
(未指定は B。比較UIは `?design` 指定時のみ表示)。詳細は `design-comparison.md`。

## テスト

```bash
npm test          # unit/integration(engine, csv, storage, validation, model, weather)
npm run check:sync # engine と SHARED-LOGIC の一致確認
npm run build
npm run test:e2e  # Playwright 実ブラウザ 42ケース
```

E2E は `e2e/` にあり、`vite preview` を自動起動する。
各デザインのナビは `data-testid="step-nav-<id>"`、入力本体は
`data-testid="step-editor"` という共通契約を持つ。**デザインを増減するときは
この契約を維持すること**(E2Eが3案すべてを検証している)。

天気APIはE2Eでスタブ/遮断している(外部依存をテストに持ち込まない)。

## 要求仕様の確定状況(重要)

- **GPS・位置情報・交通情報: 要求仕様に存在しない。実装対象外。**
- **Excel/Word 出力: 要求仕様に存在しない。** `stabro-vs-national-standard-comparison.md`
  の「EXCEL/TSV出力対応」は **STABRO(他社製品)の機能説明**であり本アプリの要求ではない。
  本アプリの出力は画面帳票・CSV・印刷/PDF。
- **CAD/BIM: 次工程。** 今回は実装しない。データモデルは手入力前提を維持しつつ、
  将来 図面解析から室・面積・開口部を埋められる余地を残す(現行UIにアップロード導線は無い)。
- 帳票のフル18帳票・系統別集計は `professional-spec-data-model-v1.md` で将来拡張と明記。

## 既知の制約

- 未保存の入力はリロードで失われる(自動保存/draft は要求仕様に無い)。
  保存はヘッダーの「案件を保存」で明示的に行う。
- 詳細モード(窓・外皮・内部発熱の積み上げ)は未実装。現行は原単位方式。
  `hvac-detailed-mode-spec-v1.md` に設計のみ存在。