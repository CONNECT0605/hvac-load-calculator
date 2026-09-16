# STABRO / 建築設備設計基準 令和6年版 互換性マトリクス

作成日: 2026-09-15 / 対象: `hvac-calc-engine.js`
基準: STABRO負荷計算(イズミコンサルティング、建築設備設計基準 令和6年版準拠)の公開仕様

状態の定義:
- **PASS** = 実装済みで、入力→計算結果の因果をテストで検証済み
- **FAIL** = 未実装、または計算に未接続
- **NOT VERIFIED** = 係数・式が公開資料から確認できず、値の発明ができないため未確定

**重要**: 本マトリクスは「PASSしていない項目を隠さない」ために作成しています。
現時点で **STABRO完全一致(全項目PASS)ではありません**。理由は §3 に記載します。

---

## 1. 方式の全体像

| 方式 | 関数 | 状態 |
|---|---|---|
| 原単位方式(概算) | `computeLoad` | PASS(既存。COREロックで固定) |
| R6 詳細方式(積み上げ) | `computeDetailedLoad` | PASS(新規実装) |

STABRO本体は**詳細方式(積み上げ)**です。今回、その土台を新規実装しました。

---

## 2. 計算項目マトリクス

### 2-1. 外皮・構造

| STABRO項目 | アプリ項目 | Engine変数 | 計算式 | 係数/データ | 時刻別 | 出力 | テスト | 状態 |
|---|---|---|---|---|---|---|---|---|
| 外壁 | `envelope.walls[].uValue/area` | `wallUA` | `U×A×ΔT/1000` | U値(入力) | PASS | `envelopeKW` | 面積・U値で変化を検証 | **PASS** |
| 屋根 | `envelope.roof` | `roofUA` | 同上 | U値(入力) | PASS | `envelopeKW` | 同上 | **PASS** |
| 床 | `envelope.floor` | `floorUA` | 同上 | U値(入力)/地中温度 | PASS | `envelopeKW` | 寄与0を明示 | **FAIL**(地中温度が未転記のため冷房・暖房とも寄与0) |
| 内壁 | `envelope.interiorWalls` | `interiorUA` | `U×A×ΔT/1000` | U値・ΔT(入力) | PASS | `interiorWallKW` | ΔT入力で負荷発生を検証 | **PASS** |
| 構造体の熱通過 | ― | ― | ― | 材料構成(厚み・λ) | ― | ― | ― | **NOT VERIFIED**(材料データ未転記) |
| 熱通過率 | 各面の`uValue` | `uaOf()` | 入力値を使用 | ― | ― | ― | ― | **PASS**(外部入力として) |
| 材料・厚さ等の構造条件 | ― | ― | ― | ― | ― | ― | ― | **NOT VERIFIED**(材料データ未転記) |
| 方位条件 | `orientation` | 日射の方位別参照 | 方位別日射量 | 方位別日射量 | PASS | `windowSolarKW` | 南↔西で変化を検証 | **PASS** |

### 2-2. 窓・ガラス

| STABRO項目 | アプリ項目 | Engine変数 | 計算式 | 係数/データ | 時刻別 | 出力 | テスト | 状態 |
|---|---|---|---|---|---|---|---|---|
| ガラス面積 | `windows[].area` | `winUASum` | `U×A×ΔT/1000` | 入力 | PASS | `windowConductionKW` | 面積増で負荷増を検証 | **PASS** |
| ガラスの熱通過 | `windows[].uValue` | `winUASum` | 同上 | U値(入力) | PASS | 同上 | U値で変化を検証 | **PASS** |
| ガラス面日射 | `scValue`+`solarWm2` | `winSolarKW` | `SC×I×A/1000` | SC(入力)/日射量 | PASS | `windowSolarKW` | 方位・SCで変化を検証 | **PASS** |
| 方位 | `orientation` | 同上 | 方位別日射量 | ― | PASS | 同上 | PASS | **PASS** |
| 遮蔽 | `scValue` | 同上 | SCに反映 | ― | PASS | 同上 | SC低減で負荷減を検証 | **PASS** |
| 庇 | ― | ― | ― | 庇の寸法・影 | ― | ― | ― | **FAIL**(未実装) |
| ルーバー | ― | ― | ― | ― | ― | ― | ― | **FAIL**(未実装) |
| 標準日射熱取得 | `solarWm2`(外部入力) | `solarWm2` | ― | **地区データ(時刻・方位別)** | PASS | 同上 | 未転記を明示 | **NOT VERIFIED**(地区データ未転記。入力すれば計算可) |
| ETD(実効温度差) | ― | ― | ― | ETD表(地区データ) | ― | ― | ― | **NOT VERIFIED**(STABROの地区データにETDタブが存在することは確認。表の値は未転記) |

### 2-3. 内部発熱

| STABRO項目 | アプリ項目 | Engine変数 | 計算式 | 係数/データ | 時刻別 | 出力 | テスト | 状態 |
|---|---|---|---|---|---|---|---|---|
| 人体(顕熱) | `occupants` | `occSensibleKW` | `人数×69W/1000` | **基準値 69W/人(室温26℃)** | PASS | `occupantSensibleKW` | 人数2倍で2倍を検証 | **PASS** |
| 人体(潜熱) | `occupants` | `occLatentKW` | `人数×53W/1000` | **基準値 53W/人** | PASS | `occupantLatentKW` | 人数増で増加を検証 | **PASS** |
| 照明 | `internalHeat.lightingWm2` | `lightingKW` | `面積×W/m²/1000` | 基準値 9W/m²(事務室)/6(会議室) | PASS | `lightingKW` | 2倍で2倍を検証 | **PASS** |
| 機器 | `internalHeat.equipmentWm2` | `equipmentKW` | 同上 | 基準値 15〜30W/m²(事務室)/10〜15(会議室) | PASS | `equipmentKW` | 2倍で2倍を検証 | **PASS** |
| その他内部発熱 | `internalHeat.others` | ― | ― | ― | ― | ― | ― | **FAIL**(空配列のみ。厨房機器等は未実装) |
| 顕熱/潜熱/全熱の分離 | ― | `coolingSensibleKW`等 | 内訳→顕熱+潜熱=全熱 | ― | PASS | 合計一致を検証 | **PASS** |

### 2-4. 外気・換気・すきま風

| STABRO項目 | アプリ項目 | Engine変数 | 計算式 | 係数/データ | 時刻別 | 出力 | テスト | 状態 |
|---|---|---|---|---|---|---|---|---|
| 外気量 | `outdoorAir.volumeM3h` | `outdoorAirVolumeM3h` | 入力 or `人数×30m³/h` | **基準値 30m³/(h・人)** | PASS | `ventilationM3h` | 2倍で2倍を検証 | **PASS** |
| 外気顕熱 | 同上 | `oaSensibleCooling` | `ρ·cp·V·ΔT/3600` | 空気物性(確認済) | PASS | `outdoorAirSensibleKW` | 外気温変更で変化を検証 | **PASS** |
| 外気潜熱 | `indoorHumidity`+外気湿度 | `oaLatentCooling` | `ρ·r·V·Δx/3600` | 汽化潜熱2501kJ/kg | PASS | `outdoorAirLatentKW` | 外気湿・室内湿で変化を検証 | **PASS** |
| 外気全熱 | ― | 顕熱+潜熱 | ― | ― | PASS | 合計一致を検証 | **PASS** |
| 外気条件 | `hourlyOutdoorDB/RH` | `toutCooling`,`rhOut` | Tetens式 | 地区データ | PASS | `outdoorDB`,`outdoorRH` | 未転記を明示 | **NOT VERIFIED**(時刻別地区データ未転記。入力すれば計算可) |
| 設計外気温度(冷房) | `R6_DESIGN_OUTDOOR` | `regionOutdoor.coolingDB` | 相対湿度→絶対湿度 | 札幌30.7/仙台32.9/東京34.8/名古屋35.4/大阪34.9/福岡35.1/那覇32.9℃ | PASS | `outdoorDB` | 地区変更で負荷変化を検証 | **PASS**(7地区。中国四国は未転記) |
| 設計外気温度(暖房) | `heatingOutdoorDB` | `heatingOutdoorDB` | ― | **冬期値が未入手** | PASS | `heatingTotalKW` | 未確認を明示 | **NOT VERIFIED**(R6で冬期夜間温度が追加されたが値未入手) |
| 熱交換器 | `heatRecovery` | `recoveryEff` | 外気負荷×(1-効率) | 効率(入力) | PASS | 外気負荷低減を検証 | **PASS** |
| すきま風量(換気回数法) | `infiltration.method=air_change` | `infVolumeCoolingTotal` | `室容積×換気回数` | 夏期 風上2回/他1回(基準値) | PASS | `infiltrationVolumeM3h` | 風上↔風下で差を検証 | **PASS** |
| すきま風量(単位すきま風量法) | `unitLeakageM3hPerM2` | `infWindowCooling` | `窓面積×単位すきま風量` | **サッシ気密性区分別の表** | PASS | 同上 | 未転記を明示 | **NOT VERIFIED**(表未転記。入力すれば計算可) |
| すきま風 冬期換気回数 | `airChangeRateHeating` | `infAirChangeHeating` | 同上 | 基準は3〜4回/1〜2回の範囲 | PASS | 暖房負荷 | 未確認を明示 | **NOT VERIFIED**(単一値を特定できないため要入力) |
| すきま風 顕熱・潜熱 | ― | `infSensible/LatentKW` | 外気と同一式 | ― | PASS | 両方出力 | 変化を検証 | **PASS** |

### 2-5. 湿度・加湿・時刻別・最大負荷

| STABRO項目 | アプリ項目 | Engine変数 | 計算式 | 係数/データ | 状態 |
|---|---|---|---|---|---|
| 室内湿度 | `indoorHumidity.cooling/heating` | `rhInCooling/Heating` | 絶対湿度換算(Tetens) | 入力 | **PASS** |
| 外気湿度 | `hourlyOutdoorRH` | `xOut` | 同上 | 地区データ | **NOT VERIFIED**(時刻別未転記) |
| 潜熱計算 | ― | `coolingLatentKW` | 人体+外気+すきま風 | ― | **PASS** |
| 加湿量 | ― | ― | ― | 冬期外気湿度 | **FAIL**(冬期外気湿度が未転記) |
| 時刻別計算 | `hours` | `hourlyResults` | 各時刻で積み上げ | 9/12/14/16時 | **PASS** |
| 各負荷項目の時刻変化 | 同上 | 同上 | 日射・外気の時刻変化 | 日射量(入力) | **PASS** |
| 最大負荷時刻 | ― | `peak.coolingHour` | 最大値の時刻を選択 | ― | **PASS** |
| 最大顕熱 | ― | `peak.coolingSensibleKW` | ― | ― | **PASS** |
| 最大潜熱 | ― | `peak.coolingLatentKW` | ― | ― | **PASS** |
| 最大全熱 | ― | `peak.coolingKW` | ― | ― | **PASS** |
| 最大負荷判定 | ― | `basis`,`requiredCapacityKW` | `max(冷房,暖房)` | ― | **PASS** |
| 冷房負荷 | ― | `designLoadCoolingKW` | ピーク×(1+余裕率) | ― | **PASS** |
| 暖房負荷 | ― | `designLoadHeatingKW` | 同上 | 冬期外気温度 | **NOT VERIFIED**(冬期外気温度が未転記) |
| 負荷内訳 | ― | `breakdown` | 全12項目を出力 | ― | **PASS** |
| 部屋・系統集計 | `computeProject` | 室の合算 | 単純合算 | ― | **PASS**(室単位。系統単位は未実装) |

### 2-6. 出力

| STABRO項目 | アプリ項目 | 状態 |
|---|---|---|
| 室別負荷 | 結果画面 | **PASS** |
| 時刻別結果 | `hourlyResults` | **PASS** |
| 負荷内訳(12項目) | `breakdown` | **PASS** |
| 帳票(計算書) | CSV・印刷 | **PASS**(STABROの18帳票構成には未対応 → **FAIL**) |
| チェックリスト | ― | **FAIL** |
| Excel/TSV | ― | **FAIL**(要求仕様外) |

---

## 3. STABRO完全一致に達していない理由(残項目)

**未実装(FAIL)**: 8項目
1. 床負荷(地中温度が未転記)
2. 庇
3. ルーバー
4. その他内部発熱(厨房機器等)
5. 加湿量
6. 帳票18帳票構成・チェックリスト
7. 系統単位の集計
8. 材料構成データ(厚み・λ)によるU値算定

**未確認(NOT VERIFIED)**: 7項目
1. ガラス面標準日射熱取得(地区データ・時刻別)
2. ETD表(地区データ)
3. 時刻別外気温湿度(地区データ)
4. 設計外気温度 冬期(暖房用) — R6で「冬期夜間温度」が追加されたが値未入手
5. 単位すきま風量表(サッシ気密性区分別)
6. すきま風 冬期換気回数(範囲指定のため単一値特定不能)
7. 材料データ(構造体各100種)

**これらはAIが値を創作してはならない領域です。** 建築設備設計基準 令和6年版の原本または
STABROの地区データ・材料データが入手できた時点で、`変更理由 → 修正 → テスト → 再照合 → 再LOCK`
の手順でPASSにできます。

**実装済みの部分は、入力さえ与えればSTABROと同じ式で計算します**(未確認項目は外から値を渡せる設計)。

---

## 4. 係数の出典

| 係数 | 値 | 出典 | 状態 |
|---|---|---|---|
| 空気密度・比熱・汽化潜熱 | 1.2kg/m³, 1.006kJ/kgK, 2501kJ/kg | 湿り空気の標準物性値 | 確認済 |
| 人体 顕熱/潜熱 | 69W/人, 53W/人(室温26℃) | 建築設備設計基準(北九州市ZEB化指針の引用) | provisional |
| 照明 | 9W/m²(事務室), 6W/m²(会議室) | 同上(基準の目安値) | provisional |
| 機器 | 15〜30W/m²(事務室), 10〜15W/m²(会議室) | 同上 | provisional |
| 外気量 | 30m³/(h・人) | 同上 | provisional |
| 設計外気温度(冷房7地区) | 上表 | 二次資料経由のR6転記 | provisional |
| すきま風 換気回数(夏期) | 風上2回/他1回 | 建築設備設計基準(既存仕様書で原文確認済) | 確認済 |

`provisional` は「基準由来だが原本で直接確認していない」ことを示します。
結果オブジェクトの `coefficientSources` / `defaultedFromR6` に実行時に記録されます。

---

## 5. 検証

```
npm test                      → 57件 + 55件(core-lock) + stabro-compat 49件 成功 / 0件失敗
npm run check:sync            → 一致(283行)・既存SHARED-LOGICは無変更
npm run build                 → 成功
npm run test:e2e              → 42 passed
node stabro-compat.test.mjs   → 49件成功 / 0件失敗(因果テスト)
```

固定済みハッシュ:
- 原単位方式(8用途×8地域=64ケース): `827a1d30c7f576b84087492f86d45bb0cfcbaf8d5329591a73c42a60cd869384`
- R6詳細方式(23数値): `35c2890a7b833e9defc198f4df740efbca8ba76f9ca72f3d996d7f12904d1588`

因果テストで検証した入力接続:
外壁・屋根・床・内壁、窓面積・方位・SC、日射量、照明、機器、人員(顕熱/潜熱)、
外気量・外気温・外気湿・室内湿・熱交換、すきま風(風上/風下)、地区、
暖房設定温度・暖房外気温、余裕率、最大負荷判定、境界値(面積0/負)、
基準値補完の記録、出典の記録。
