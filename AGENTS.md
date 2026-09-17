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

## LOAD CORE の固定(重要)

計算COREの数値は `core-lock.test.mjs` で凍結されている。`npm test` に含まれる。
COREハッシュ(8用途×8地域=64ケース):
`827a1d30c7f576b84087492f86d45bb0cfcbaf8d5329591a73c42a60cd869384`

計算式・係数を変更する場合は、**変更根拠と「変更前 → 変更後」を必ず記録**し、
`UPDATE_CORE_LOCK=1 node core-lock.test.mjs` で期待値を更新すること。
根拠なく数値を変えてはならない。

STABRO / SeACD との照合結果は `docs/STABRO-COMPATIBILITY-MATRIX.md`。

## 計算方式は2系統ある

| 方式 | 関数 | 用途 |
| --- | --- | --- |
| 原単位方式(概算) | `computeLoad` / `selectEquipment` | 面積×原単位の概算。既存。**変更禁止** |
| R6詳細方式(積み上げ) | `computeDetailedLoad` | 建築設備設計基準R6相当の積み上げ。SHARED-LOGICの外側 |

`computeDetailedLoad` は `// ===SHARED-LOGIC-START===` の**外側**にあるため
`check:sync` の対象外であり、既存COREに影響しない。

### 係数を創作しない規約

- 確認できた係数は出典(`coefficientSources`)と共に持つ。未確認は `null` のままにする。
- 基準値で補完した場合は `defaultedFromR6` に記録する(黙って埋めない)。
- 計算に寄与できない未確認項目は `notVerified` に列挙する(隠さない)。
- **`Number(null) === 0` に注意。** 未入力を0として扱うと未確認係数が計算に混入するため、
  詳細方式では `toNum()` で厳密に判定する。

### 詳細方式のロック

`core-lock.test.mjs` が2つのハッシュを凍結している。
- 原単位方式: `827a1d30c7f576b84087492f86d45bb0cfcbaf8d5329591a73c42a60cd869384`
- R6詳細方式: `c1a8aa169aa4d567b961c6f0e8f624e5d97f91ad28ee7fbff3fb1bfe72355fba`

### 公的基準の負荷項目

`R6_LOAD_ITEMS` は建築設備設計基準 令和6年版 第4編第1章第2節(3)(4)の
冷房8項目・暖房5項目を原文のまま保持する。**個数・順序を変えてはならない。**
各項目の `implemented` が `true` でないものは、係数が非公開で実装できない項目である。

出典: https://www.mlit.go.jp/gobuild/content/001390961.pdf (page 14)

### 非公開データについて

建築設備設計基準 令和6年版の**公開PDFは本文30ページのみ**で、係数表・80地区データ・
材料データ・ETD表は含まれない(公開PDFの全文検索で確認済)。
STABROの地区データ・材料データは製品内部データで非公開。
**これらを推測で埋めてはならない。** 詳細は `docs/STABRO-COMPATIBILITY-MATRIX.md` §0-2。


## テスト

```bash
npm test          # unit/integration(engine, core-lock, csv, storage, validation, model, weather)
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

## R6詳細方式(積み上げ)の構成

計算の中核は `hvac-calc-engine.js` の `computeDetailedLoad()`(CommonJS)。
UIから使うための構成は次のとおり。

- `r6-engine.mjs` … engine(CommonJS)をESMとして再輸出するだけのブリッジ。
  ブラウザバンドルには `vite.config.mjs` の `build.commonjsOptions.include` で
  `hvac-calc-engine.js` を明示的に含める必要がある。
- `detailed-building.mjs` … 室別の詳細方式結果を**同一時刻で合算し時系列の最大値を
  採用**する方式(`professional-spec-data-model-v1.md` §E の確定仕様)で
  室→系統→階→建物へ集計する。**加算のみ**で新しい係数・式を持たない。
  `Room.systemId` が系統集計のキー(未設定は「系統未設定」)。
- `detailed-report.mjs` … 帳票整形(8+5項目・内訳・時刻別・集計・出典・
  未確認事項・チェックリスト)。数値は engine の結果のみで、再計算しない。
- `app-screens.jsx` の `DetailedReportScreen` / `print-detailed-report.jsx` /
  `export-csv.mjs` の `buildDetailedCsv` … 画面・印刷・CSVへの接続。

**計算式・係数を新設してはならない。** 未確認の係数は engine 側で
`notVerified` に列挙され、計算には寄与しない(値の発明禁止)。

### 機器選定・機器表の接続(2026-09-17)

データの流れは次の1本である。**新しい選定ロジックは持たない。**

```
Project → Floor → Room → roomToDetailedLoadInput → computeDetailedLoad
  → computeDetailedProject(同時刻合算) → aggregateDetailedProject(室/系統/階/建物)
  → detailed.requiredCapacityKW → 既存 selectEquipment() → EQUIPMENT_DB(実在型式)
  → buildEquipmentSchedule() → 帳票 / 画面 / 印刷 / CSV
```

- `detailed-building.mjs` の `computeDetailedProject` が、算定した必要能力を
  **既存 `selectEquipment()` にそのまま渡す**(`equipmentSelection`)。
  引数は `status` / `requiredCapacityKW` / `floors` / `basis` のみ。
- `buildEquipmentSchedule(detailed, aggregate)` が建物全体行・系統別行・実在型式行を作る。
  台数・設置容量・余裕率・選定理由文は `selectEquipment()` の戻り値をそのまま使う。
- 系統別の選定も同じ `selectEquipment()` を系統集計の必要能力に当てるだけ。
- `EQUIPMENT_DB` は 5.6kW / 8.0kW クラスのみ。他のクラスは
  「この容量クラスの実在型式は今回未調査です」と明示し、**型式を創作しない**。
- テスト: `stabro-detailed-ui.test.mjs`(72件)、E2E `21`。
  「詳細方式の選定 = 既存 `selectEquipment()` の同一必要能力での選定」を機械的に照合している。

### STABRO互換マトリクスの残存FAIL(ブロッカー)

`docs/STABRO-COMPATIBILITY-MATRIX.md` の残存FAILはすべて
**非公開データ**(建築設備設計基準R6本体の表編・STABRO内部の地区/材料データ)に
起因するもので、取得不能。値を創作せず `notVerified` として明示したまま FAIL を維持する。
コード起因のFAILは解消済み。

内訳(2026-09-17 時点):
- 負荷項目: 冷房 PASS 4 / FAIL 4、暖房 PASS 1 / FAIL 4(計 PASS 5 / FAIL 8)。
  うち真の未実装は2件(§1-1 #8・§1-2 #5 のダクト・配管・空気漏洩・送風機・ポンプ・間欠空調)。
  残る6件は非公開係数(その他室内負荷の潜熱原単位、単位すきま風量表・冬期換気回数、
  時刻別の地区別外気データ、暖房設計用地中温度、冬期外気温度)。
- 機器: 必要能力→選定→機器表の接続は PASS。実在型式データの網羅のみ FAIL
  (`EQUIPMENT_DB` は 5.6/8.0kW クラスのみ)。

**56項目という検証セットは本リポジトリのいかなる履歴にも存在しない**
(git 全履歴・全ブランチを検索して 0 件)。実際の検証項目は上記のとおりで、
負荷項目13件 + データフロー13段 + 集計5段 + 帳票18項目 + 因果62 + 集計26 + 帳票42 + 詳細72。

## 既知の制約

- 未保存の入力はリロードで失われる(自動保存/draft は要求仕様に無い)。
  保存はヘッダーの「案件を保存」で明示的に行う。
- 暖房時は設計外気温度(冬期)が非公開のため、暖房負荷は算定せず null を返す
  (冷房を選定基準とする)。値を推測で埋めない。