import { useMemo, useRef, useState } from "react";
import {
  STORAGE_UNAVAILABLE_MESSAGE,
  createProjectSnapshot,
  deleteProject,
  downloadProjectJson,
  duplicateProject,
  importProject,
  isStorageAvailable,
  listProjects,
  loadProject,
  parseProjectFile,
  saveProject,
} from "./project-storage.mjs";
import {
  STEPS,
  computeProject,
  createFloor,
  createProjectDoc,
  createRoom,
  getStepStatus,
  normalizeProjectDoc,
} from "./project-model.mjs";
import {
  AppHeader,
  DetailedReportScreen,
  HomeScreen,
  ProjectListScreen,
  ReportScreen,
  StatusPanel,
  StepNav,
} from "./app-screens.jsx";
import StepEditor from "./step-screens.jsx";
import { Button, Note, T } from "./ui-kit.jsx";
import {
  DesignCBar,
  DesignCHeader,
  DesignCSubNote,
  DesignBEditor,
  DesignBHeader,
  DesignBWorkspace,
  FINAL_VARIANT,
  ThemeProvider,
  VariantSwitcher,
  readVariantFromUrl,
  useVariant,
} from "./design-variants.jsx";
import { buildProjectReport } from "./report-data.mjs";
import { downloadCsv, downloadDetailedCsv } from "./export-csv.mjs";
import { computeDetailedProject, toReportLoadResult, aggregateDetailedProject, buildEquipmentSchedule } from "./detailed-building.mjs";
import { buildDetailedReport } from "./detailed-report.mjs";
import PrintReport from "./print-report.jsx";
import PrintDetailedReport from "./print-detailed-report.jsx";

// =====================================================================
// 空調負荷計算・機器選定ロジック(Single Source of Truth)
// 以下のSHARED-LOGIC-START〜ENDは hvac-calc-engine.js と一字一句同一のテキストです。
// 整合性は hvac-calc-engine.sync-check.js で機械的に検証しています。
// このブロック内を直接編集する場合は、必ずengine.js側も同じ内容に更新してください。
// =====================================================================
// ===SHARED-LOGIC-START===
// ↓このマーカーからSHARED-LOGIC-ENDまでのブロックは、hvac-load-calculator.jsx に
// 一字一句同一のテキストとして埋め込まれています(Single Source of Truthの実体)。
// 変更する場合は、必ずこのブロックをコピーしてjsx側の対応箇所を置き換えてください。
// 整合性は hvac-calc-engine.sync-check.js で機械的に検証できます。

// 【構造変更 2026-09-02】各原単位をvalue/unit/status/source/confirmedDate/noteを持つ
// メタデータオブジェクトに変更。数値そのもの(value)は一切変更していません。
// status: "provisional"(正式根拠未確認の暫定値) | "verified"(規格原本等で確認済み・現時点で該当なし)
function wm2(value, note) {
  return {
    value,
    unit: "W/m2",
    status: "provisional",
    source: "本アプリの暫定仮定値。SHASE-S112等の正式根拠は未確認(2026-09-02時点)。",
    confirmedDate: null,
    note: note || "正式な国基準・SHASE-S112の数値ではありません。calculation-method-spec-v3.md参照。",
  };
}

const BUILDING_TYPES = [
  { id: "office", label: "オフィス", coolingWm2: wm2(172), heatingWm2: wm2(122), ventPerPerson: 30 },
  { id: "retail", label: "店舗(物販)", coolingWm2: wm2(209), heatingWm2: wm2(151), ventPerPerson: 30 },
  { id: "restaurant", label: "飲食店", coolingWm2: wm2(244), heatingWm2: wm2(174), ventPerPerson: 30 },
  { id: "hotel", label: "ホテル客室", coolingWm2: wm2(116), heatingWm2: wm2(105), ventPerPerson: 25 },
  { id: "hospital", label: "病院(病室)", coolingWm2: wm2(140), heatingWm2: wm2(116), ventPerPerson: 25 },
  { id: "school", label: "学校(教室)", coolingWm2: wm2(105), heatingWm2: wm2(93), ventPerPerson: 20 },
  { id: "factory", label: "工場・倉庫", coolingWm2: wm2(93), heatingWm2: wm2(81), ventPerPerson: 15 },
  { id: "residential", label: "集合住宅", coolingWm2: wm2(81), heatingWm2: wm2(70), ventPerPerson: 20 },
];
// 【出典】上記W/m²原単位は、いずれも「本アプリの概算仮定」です。外部の公的資料・
// 業界標準資料と突き合わせた数値ではありません。人体発熱(人体顕熱・潜熱)が
// この原単位にあらかじめ含まれているか否かは確認できていません(未確定)。
// → 詳細は本ファイル末尾の「244W/m²等の原単位に関する確認結果」を参照。

const REGIONS = [
  { id: "hokkaido", label: "北海道", coolingFactor: 0.75, heatingFactor: 1.45 },
  { id: "tohoku", label: "東北", coolingFactor: 0.85, heatingFactor: 1.25 },
  { id: "kanto", label: "関東", coolingFactor: 1.0, heatingFactor: 1.0 },
  { id: "chubu", label: "中部", coolingFactor: 1.0, heatingFactor: 1.05 },
  { id: "kansai", label: "関西", coolingFactor: 1.05, heatingFactor: 0.95 },
  { id: "chugoku_shikoku", label: "中国・四国", coolingFactor: 1.05, heatingFactor: 0.85 },
  { id: "kyushu", label: "九州", coolingFactor: 1.1, heatingFactor: 0.75 },
  { id: "okinawa", label: "沖縄", coolingFactor: 1.3, heatingFactor: 0.35 },
];

const PACKAGE_SIZES = [
  { kw: 5.6, hp: 2, code: "50形" },
  { kw: 7.1, hp: 2.5, code: "63形" },
  { kw: 8.0, hp: 3, code: "80形" },
  { kw: 11.2, hp: 4, code: "112形" },
  { kw: 14.0, hp: 5, code: "140形" },
  { kw: 16.0, hp: 6, code: "160形" },
  { kw: 22.4, hp: 8, code: "224形" },
];

// 人体発熱原単位(参考値。出典:実務解説記事「株式会社パラダイム」の事務作業時の目安値。
// 公的基準ではない。飲食店等の接客・調理作業に特化した値ではないため要確認)
const OCCUPANT_HEAT = {
  sensibleWPerPerson: 60,
  latentWPerPerson: 50,
  source: {
    name: "実務解説記事(株式会社パラダイム)の事務作業時の目安値。公的基準ではない。",
    url: null,
    confirmedDate: "2026-09-02",
  },
};

// 実在機器データベース(容量kW→型式配列)。全エントリに出典・確認日を保持し追跡可能にする。
const EQUIPMENT_DB = {
  5.6: [
    { maker: "ダイキン工業", model: "SZRG50CNT", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認(単相200V/三相200Vいずれかの型式あり)",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/SZRG50CNT.html", confirmedDate: "2026-09-02" } },
    { maker: "三菱電機", model: "PLZ-ERMP50L6", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/PLZ-ERMP50L6.html", confirmedDate: "2026-09-02" } },
    { maker: "パナソニック", model: "PA-P50L7HC", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P50L7HC.html", confirmedDate: "2026-09-02" } },
    { maker: "日立", model: "RCID-GP50RSH11", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/RCID-GP50RSH11.html", confirmedDate: "2026-09-02" } },
    { maker: "日本キヤリア(旧東芝)", model: "GWSA05013XU", coolingKW: 5.6, heatingKW: null, indoorType: "天井カセット形2方向吹出", config: "シングル", power: "要確認",
      source: { name: "エアコンセンターAC(型式一覧ページ)", url: "https://www.e-aircon.jp/aircon_model/GWSA05013XU.html", confirmedDate: "2026-09-02" } },
  ],
  8.0: [
    { maker: "ダイキン工業", model: "SZRC80BYT", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット4方向", config: "シングル", power: "三相200V",
      source: { name: "エアコンマート(型式・仕様掲載ページ)", url: "https://www.aircon-mart-2.com/fs/aircon/r4detk4-80a1d", confirmedDate: "2026-09-02" } },
    { maker: "三菱電機", model: "PLZ-ZRMP80L5", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット2方向", config: "シングル", power: "要確認",
      source: { name: "エフジェイテック(型番一覧ページ)", url: "https://ac.fj-tec.co.jp/category/item/package_ac/package_cassette/package_cassette_2/package_cassette_2_package_mitsubishi_electric/", confirmedDate: "2026-09-02" } },
    { maker: "パナソニック", model: "PA-P80U7HC", coolingKW: 8.0, heatingKW: null, indoorType: "4方向天井カセット", config: "シングル", power: "三相200V",
      source: { name: "エアコンセンターAC(型式ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P80U7HC.html", confirmedDate: "2026-09-02" } },
    { maker: "日立", model: "RCI-GP80RGH9", coolingKW: 8.0, heatingKW: null, indoorType: "てんかせ4方向", config: "シングル", power: "要確認",
      source: { name: "エフジェイテック(型番一覧ページ)", url: "https://ac.fj-tec.co.jp/category/item/package_ac/package_cassette/package_cassette_4/package_cassette_4_package_hitachi/", confirmedDate: "2026-09-02" } },
    { maker: "日本キヤリア(旧東芝)", model: "GUEA080111XU", coolingKW: 8.0, heatingKW: null, indoorType: "天井カセット4方向", config: "シングル", power: "三相200V",
      source: { name: "エアコンセンターAC(関連型式ページ)", url: "https://www.e-aircon.jp/aircon_model/PA-P80U7HC.html", confirmedDate: "2026-09-02" } },
  ],
};
// 【重要な注記】5.6kWクラスの調査で参照した一覧ページ(2U50-H1)自体の「参考例」の記載では、
// 同クラスの冷房能力が「4.5(1.0〜5.0)kW」と表示されており、公称クラス表記「2馬力/50形」=5.6kW
// という業界慣行上の対応と、個別製品の実際のカタログ値が一致しない場合があることを確認した。
// 各社の型式ページ(上記source.url)で個別の正式仕様を確認する必要がある(要確認)。

function findBuildingType(id) { return BUILDING_TYPES.find((b) => b.id === id); }
function findRegion(id) { return REGIONS.find((r) => r.id === id); }

/**
 * 負荷計算。
 * ① 概算負荷(roughLoad) = 面積ベースのみ。人体負荷は含まない。
 * ② 人体負荷(参考値) = 常に計算するが、既定では設計用必要負荷に加算しない。
 * ③ 設計用必要負荷(designLoad) = 概算負荷 [+ 人体負荷(includeOccupantLoad=trueの場合のみ)] × (1+margin/100)
 */
function computeLoad(input) {
  const {
    buildingTypeId, regionId,
    floorAreaTotal,        // 延床面積(建物全体、m²)。簡易モードではこの1値のみを使用する。
    floors,                // 階数(表示・配分参考用。負荷計算そのものには使用しない)
    occupants,
    coolingSetTemp, heatingSetTemp,
    marginPct,
    includeOccupantLoad,   // boolean。既定false(二重計上リスク回避のため)
  } = input;

  const warnings = [];
  const buildingType = findBuildingType(buildingTypeId);
  const region = findRegion(regionId);

  const area = Number(floorAreaTotal);
  const nFloors = Math.max(1, Number(floors) || 1);
  const nOccupantsRaw = Number(occupants);
  const nOccupants = Number.isFinite(nOccupantsRaw) ? Math.max(0, nOccupantsRaw) : 0;
  const margin = Number.isFinite(Number(marginPct)) ? Math.max(0, Number(marginPct)) : 0;
  const includeOccupant = includeOccupantLoad === true;

  if (!Number.isFinite(area) || area <= 0) {
    return { status: "invalid", reason: "面積が0以下、または未入力です。計算できません(要確認)。", warnings };
  }
  if (area > 50000) {
    warnings.push("延床面積が50,000m²を超えています。非現実的な規模の可能性があります(要確認)。");
  }
  if (nOccupants === 0) {
    warnings.push("在室人数が0人のため、換気量が0m³/hです(要確認)。");
  }

  const csTemp = Number(coolingSetTemp);
  const hsTemp = Number(heatingSetTemp);
  const tempFactorCooling = 1 + (26 - (Number.isFinite(csTemp) ? csTemp : 26)) * 0.03;
  const tempFactorHeating = 1 + ((Number.isFinite(hsTemp) ? hsTemp : 22) - 22) * 0.03;
  if (tempFactorCooling < 0 || tempFactorHeating < 0) {
    warnings.push("温度設定補正係数が負の値です(要確認)。");
  }

  // ① 概算負荷(面積ベースのみ。出典未確認の本アプリ仮定)
  const roughLoadCoolingKW = (area * buildingType.coolingWm2.value * region.coolingFactor * tempFactorCooling) / 1000;
  const roughLoadHeatingKW = (area * buildingType.heatingWm2.value * region.heatingFactor * tempFactorHeating) / 1000;

  // 人体負荷(参考値。常に計算するが、includeOccupant=falseの間は設計用必要負荷に含めない)
  const occupantSensibleKW = (nOccupants * OCCUPANT_HEAT.sensibleWPerPerson) / 1000;
  const occupantLatentKW = (nOccupants * OCCUPANT_HEAT.latentWPerPerson) / 1000;
  if (includeOccupant) {
    warnings.push(
      "人体発熱を設計用必要負荷に加算しています。面積原単位(W/m²)が人体発熱を含んだ値かどうかは未確認のため、" +
      "二重計上のリスクが理論上ゼロではありません(要確認)。"
    );
  }

  // ③ 設計用必要負荷
  const occupantAddCoolingKW = includeOccupant ? occupantSensibleKW + occupantLatentKW : 0;
  const preMarginCoolingKW = roughLoadCoolingKW + occupantAddCoolingKW;
  const preMarginHeatingKW = roughLoadHeatingKW; // 暖房には人体発熱を加算しない(設計基準の考え方に整合)

  const marginFactor = 1 + margin / 100;
  const designLoadCoolingKW = preMarginCoolingKW * marginFactor;
  const designLoadHeatingKW = preMarginHeatingKW * marginFactor;

  const basis = designLoadCoolingKW >= designLoadHeatingKW ? "cooling" : "heating";
  const requiredCapacityKW = Math.max(designLoadCoolingKW, designLoadHeatingKW);

  const ventilationM3h = nOccupants * buildingType.ventPerPerson;
  const ventilationPerArea = area > 0 ? ventilationM3h / area : 0;

  // 【構造追加 2026-09-02】この負荷がどの計算方式(A:原単位方式/B:詳細方式)で
  // 構成されたかを追跡する。数値計算そのものには一切影響しない。
  // "unit_load"            = 原単位(W/m²)のみ
  // "unit_load_with_occupant_addon" = 原単位 + 人体負荷を明示的に加算(二重計上リスクを伴うハイブリッド)
  // "detailed"             = 窓・外皮・照明・機器発熱等を個別積み上げる方式(未実装、将来用の予約値)
  const calculationMethod = includeOccupant ? "unit_load_with_occupant_addon" : "unit_load";

  const loadComponents = {
    method: calculationMethod,
    areaBasedCoefficient: {
      included: true,
      coolingWm2: buildingType.coolingWm2.value,
      heatingWm2: buildingType.heatingWm2.value,
      status: buildingType.coolingWm2.status,
      coolingKW: roughLoadCoolingKW,
      heatingKW: roughLoadHeatingKW,
    },
    occupantSensibleLatent: {
      included: includeOccupant,
      coolingKW: includeOccupant ? occupantSensibleKW + occupantLatentKW : 0,
      note: includeOccupant
        ? "原単位に人体発熱が既に含まれているか未確認のため、二重計上のリスクが理論上ゼロではありません"
        : "既定では未算入(算出のみ行い、設計用必要負荷には加算していません)",
    },
    envelope: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    windowSolar: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    lighting: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    equipmentHeat: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
    outdoorAir: { included: false, note: "換気量[m³/h]は算出しているが、熱量化・設計用必要負荷への加算はしていない" },
    infiltration: { included: false, note: "詳細方式(B)未実装のため常にfalse" },
  };

  return {
    status: "ok",
    warnings,
    // 建物条件(面積の定義を明示)
    floorAreaTotal: area,
    floors: nFloors,
    areaInputMode: "total_only", // 簡易モードは常にこの値。詳細モードで"per_floor"等を追加予定(未実装)
    // 計算方式の識別(構造追加。数値には影響しない)
    calculationMethod,
    loadComponents,
    // ① 概算負荷
    roughLoadCoolingKW,
    roughLoadHeatingKW,
    // 人体負荷(参考値)
    occupantSensibleKW,
    occupantLatentKW,
    includeOccupantLoad: includeOccupant,
    // ③ 設計用必要負荷
    marginPct: margin,
    designLoadCoolingKW,
    designLoadHeatingKW,
    basis,
    requiredCapacityKW,
    // 換気量
    ventilationM3h,
    ventilationPerArea,
    tempFactorCooling,
    tempFactorHeating,
  };
}

/**
 * 機種選定。容量パッケージ(仮選定)と実在機器(正式選定)を明確に分離する。
 * selectionType: "formal"(実在機器あり) | "provisional"(容量クラスのみ)
 */
function selectEquipment(loadResult) {
  if (loadResult.status !== "ok" || !(loadResult.requiredCapacityKW > 0)) {
    return { status: "invalid", reason: "必要容量が算出できないため、機種選定は行えません(要確認)。", candidates: [], recommended: null, selectionReasonText: null };
  }

  const requiredCapacityKW = loadResult.requiredCapacityKW;

  const candidates = PACKAGE_SIZES.map((p) => {
    const count = Math.max(1, Math.ceil(requiredCapacityKW / p.kw));
    const installedKW = count * p.kw;
    const surplusPct = ((installedKW - requiredCapacityKW) / requiredCapacityKW) * 100;
    const perFloor = count / loadResult.floors;
    const realModels = EQUIPMENT_DB[p.kw] || [];
    const selectionType = realModels.length > 0 ? "formal" : "provisional";
    return { size: p.kw, hp: p.hp, code: p.code, count, installedKW, surplusPct, perFloor, selectionType, realModels };
  });

  const recommended = candidates.reduce((a, b) => (b.surplusPct < a.surplusPct ? b : a));

  const basisLabel = loadResult.basis === "cooling" ? "冷房" : "暖房";
  const typeLabel = recommended.selectionType === "formal" ? "実在機器による正式選定" : "容量クラス仮選定(実在機器未確認)";
  const selectionReasonText =
    `${basisLabel}負荷が支配的なため、${basisLabel}能力を基準に選定しました。設計用必要負荷は${requiredCapacityKW.toFixed(1)}kWです。` +
    `標準機種${recommended.size.toFixed(1)}kW(${recommended.code}/${recommended.hp}馬力、${recommended.count}台、設置合計${recommended.installedKW.toFixed(1)}kW、余裕率+${recommended.surplusPct.toFixed(1)}%)が候補中で余裕率最小のため推奨します。` +
    `区分:${typeLabel}。` +
    (recommended.selectionType === "formal"
      ? `実在型式候補:${recommended.realModels.map((m) => `${m.maker} ${m.model}`).join("、")}。`
      : `この容量クラスの実在型式は今回未調査です。`);

  return { status: "ok", candidates, recommended, selectionReasonText };
}

function computeAll(input) {
  const loadResult = computeLoad(input);
  const equipmentResult = selectEquipment(loadResult);
  return { loadResult, equipmentResult };
}
// ===SHARED-LOGIC-END===

// =====================================================================
// アプリ本体(Design A: ヘッダー + 左ステップナビ + 中央入力 + 右ステータス)
// 計算は上の SHARED-LOGIC(computeLoad / selectEquipment)のみが行う。
// この層は入力状態の保持と表示だけを担当する。
// =====================================================================

const ENGINE = { BUILDING_TYPES, REGIONS, PACKAGE_SIZES, computeLoad, selectEquipment };

function updateRoomIn(project, roomId, patch) {
  return { ...project, rooms: project.rooms.map((room) => (room.roomId === roomId ? { ...room, ...patch } : room)) };
}

function updateListItem(list, index, patch) {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export default function HVACCalculator() {
  // デザイン比較用の状態。既定は最終採用デザイン(FINAL_VARIANT)。
  // ?design=A|B|C を付けたときだけ切替UIを表示する(通常利用では出さない)。
  const initial = useMemo(() => readVariantFromUrl(), []);
  const [variant, setVariant] = useState(initial.variant);
  const [compare, setCompare] = useState(initial.compare);
  return (
    <ThemeProvider variant={variant}>
      <HVACCalculatorInner />
      {compare && <VariantSwitcher variant={variant} onChange={setVariant} />}
    </ThemeProvider>
  );
}

function HVACCalculatorInner() {
  const variant = useVariant();
  const [project, setProject] = useState(() => createProjectDoc());
  const [screen, setScreen] = useState("home");
  const [step, setStep] = useState("building");
  const [savedProjects, setSavedProjects] = useState(() => listProjects());
  const [message, setMessage] = useState(null);
  // localStorageが参照不可の環境(プライベートブラウズ等)でも計算・出力は使えるようにする。
  const storageAvailable = useMemo(() => isStorageAvailable(), []);
  const fileInputRef = useRef(null);

  const calc = useMemo(() => computeProject(project, ENGINE), [project]);
  const stepStatus = useMemo(() => getStepStatus(project, calc), [project, calc]);
  const report = useMemo(
    () =>
      calc.totals.validRoomCount > 0
        ? buildProjectReport({ project, calc, buildingTypes: BUILDING_TYPES, regions: REGIONS })
        : null,
    [project, calc]
  );
  // R6詳細方式(積み上げ)。計算の中核は engine の computeDetailedLoad() であり、
  // ここは室別結果の合算と帳票整形のみを行う。
  const detailedReport = useMemo(() => {
    if (calc.totals.validRoomCount === 0) return null;
    const detailed = computeDetailedProject(project);
    if (detailed.validRoomCount === 0) return null;
    const aggregate = aggregateDetailedProject(project, detailed);
    return buildDetailedReport({
      project,
      loadResult: toReportLoadResult(detailed),
      aggregate,
      rooms: project.rooms,
      floors: project.floors,
      regions: REGIONS,
      buildingTypes: BUILDING_TYPES,
      equipmentSchedule: buildEquipmentSchedule(detailed, aggregate),
    });
  }, [project, calc]);

  const notify = (text, tone = "info") => setMessage({ text, tone });
  const refreshList = () => setSavedProjects(storageAvailable ? listProjects() : []);

  const actions = {
    setField: (key, value) => setProject((p) => ({ ...p, [key]: value })),
    addFloor: () =>
      setProject((p) => {
        const level = p.floors.reduce((max, f) => Math.max(max, Number(f.level) || 0), 0) + 1;
        return { ...p, floors: [...p.floors, createFloor({ name: `${level}F`, level })] };
      }),
    updateFloor: (floorId, patch) =>
      setProject((p) => ({ ...p, floors: p.floors.map((f) => (f.floorId === floorId ? { ...f, ...patch } : f)) })),
    removeFloor: (floorId) =>
      setProject((p) => {
        if (p.floors.length <= 1) return p;
        return {
          ...p,
          floors: p.floors.filter((f) => f.floorId !== floorId),
          rooms: p.rooms.filter((r) => r.floorId !== floorId),
        };
      }),
    addRoom: (floorId) =>
      setProject((p) => {
        const count = p.rooms.filter((r) => r.floorId === floorId).length + 1;
        const floor = p.floors.find((f) => f.floorId === floorId);
        return { ...p, rooms: [...p.rooms, createRoom({ floorId, name: `${floor ? floor.name : ""}室${count}` })] };
      }),
    updateRoom: (roomId, patch) => setProject((p) => updateRoomIn(p, roomId, patch)),
    duplicateRoom: (roomId) =>
      setProject((p) => {
        const source = p.rooms.find((r) => r.roomId === roomId);
        if (!source) return p;
        const copy = createRoom({ ...source, roomId: undefined, name: `${source.name} のコピー` });
        const index = p.rooms.indexOf(source);
        const rooms = [...p.rooms];
        rooms.splice(index + 1, 0, copy);
        return { ...p, rooms };
      }),
    removeRoom: (roomId) => setProject((p) => ({ ...p, rooms: p.rooms.filter((r) => r.roomId !== roomId) })),
    updateWall: (roomId, index, patch) =>
      setProject((p) => {
        const room = p.rooms.find((r) => r.roomId === roomId);
        if (!room) return p;
        return updateRoomIn(p, roomId, { envelope: { ...room.envelope, walls: updateListItem(room.envelope.walls, index, patch) } });
      }),
    removeWall: (roomId, index) =>
      setProject((p) => {
        const room = p.rooms.find((r) => r.roomId === roomId);
        if (!room) return p;
        return updateRoomIn(p, roomId, { envelope: { ...room.envelope, walls: room.envelope.walls.filter((_, i) => i !== index) } });
      }),
    updateWindow: (roomId, index, patch) =>
      setProject((p) => {
        const room = p.rooms.find((r) => r.roomId === roomId);
        if (!room) return p;
        return updateRoomIn(p, roomId, { windows: updateListItem(room.windows, index, patch) });
      }),
    removeWindow: (roomId, index) =>
      setProject((p) => {
        const room = p.rooms.find((r) => r.roomId === roomId);
        if (!room) return p;
        return updateRoomIn(p, roomId, { windows: room.windows.filter((_, i) => i !== index) });
      }),
  };

  function handleNewProject() {
    const floor = createFloor({ name: "1F", level: 1 });
    setProject(
      createProjectDoc({
        floors: [floor],
        rooms: [createRoom({ floorId: floor.floorId, name: "1F室1" })],
      })
    );
    setStep("building");
    setScreen("workspace");
    notify("新規案件を作成しました。");
  }

  function handleSave() {
    if (!storageAvailable) {
      notify(STORAGE_UNAVAILABLE_MESSAGE, "warn");
      return;
    }
    try {
      const snapshot = saveProject(createProjectSnapshot({ projectId: project.projectId, projectName: project.projectName, inputs: project }));
      setProject((p) => ({ ...p, projectId: snapshot.projectId }));
      refreshList();
      notify(`案件「${snapshot.projectName}」を保存しました。`, "ok");
    } catch (error) {
      notify(`保存できませんでした: ${error.message}`, "danger");
    }
  }

  // 保存データを開く処理を1箇所にまとめる。IDを置き換えた場合の要確認は prefix 付きの
  // 同じ通知に含める(インポート時に「インポートしました」の通知で上書きされないようにするため)。
  function openProjectSnapshot(snapshot, prefix) {
    const doc = normalizeProjectDoc(snapshot.inputs, { buildingTypes: BUILDING_TYPES, regions: REGIONS });
    setProject({ ...doc, projectId: snapshot.projectId, projectName: snapshot.projectName || doc.projectName });
    setStep("building");
    setScreen("workspace");
    const rawType = snapshot.inputs?.buildingTypeId;
    const rawRegion = snapshot.inputs?.regionId;
    const adjusted =
      (rawType !== undefined && rawType !== null && doc.buildingTypeId !== rawType) ||
      (rawRegion !== undefined && rawRegion !== null && doc.regionId !== rawRegion);
    notify(
      adjusted
        ? `${prefix}。保存データに現行の用途・地域区分に無い指定があったため、既定値に置き換えました(要確認)。`
        : `${prefix}。`,
      adjusted ? "warn" : "info"
    );
  }

  function handleOpenProject(projectId) {
    const snapshot = loadProject(projectId);
    if (!snapshot) {
      notify("案件を読み込めませんでした。", "danger");
      return;
    }
    openProjectSnapshot(snapshot, `案件「${snapshot.projectName}」を開きました`);
  }

  function handleDuplicate(projectId) {
    if (!storageAvailable) {
      notify(STORAGE_UNAVAILABLE_MESSAGE, "warn");
      return;
    }
    try {
      const snapshot = duplicateProject(projectId);
      refreshList();
      if (snapshot) notify(`案件を複製しました(${snapshot.projectName})。`, "ok");
    } catch (error) {
      notify(`複製できませんでした: ${error.message}`, "danger");
    }
  }

  function handleDelete(projectId) {
    if (!storageAvailable) {
      notify(STORAGE_UNAVAILABLE_MESSAGE, "warn");
      return;
    }
    try {
      deleteProject(projectId);
      refreshList();
      setProject((p) => (p.projectId === projectId ? { ...p, projectId: null } : p));
      notify("案件を削除しました。");
    } catch (error) {
      notify(`削除できませんでした: ${error.message}`, "danger");
    }
  }

  function handleExport(projectId) {
    const snapshot = loadProject(projectId);
    if (!snapshot) {
      notify("案件を読み込めませんでした。", "danger");
      return;
    }
    downloadProjectJson(snapshot, `${snapshot.projectName || "project"}.json`);
  }

  function handleImportClick() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      // 保存不可の環境でも、読み込んだ案件で入力・計算・書き出しは続けられるようにする。
      if (!storageAvailable) {
        const parsed = parseProjectFile(text);
        openProjectSnapshot(parsed, "案件を読み込みました(この環境では保存できません)");
        return;
      }
      const snapshot = importProject(text);
      refreshList();
      openProjectSnapshot(snapshot, `案件「${snapshot.projectName}」をインポートしました`);
    } catch (error) {
      notify(error.message, "danger");
    }
  }

  function handleNavigate(next) {
    setScreen(next);
    setMessage(null);
  }

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink, fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif" }}>
      {variant === "B" ? (
        <DesignBHeader projectName={project.projectName} screen={screen} onNavigate={handleNavigate} onSave={handleSave} saveDisabled={!project.projectName} />
      ) : variant === "C" ? (
        <DesignCHeader projectName={project.projectName} screen={screen} onNavigate={handleNavigate} onSave={handleSave} saveDisabled={!project.projectName} />
      ) : (
        <AppHeader projectName={project.projectName} screen={screen} onNavigate={handleNavigate} onSave={handleSave} saveDisabled={!project.projectName} />
      )}

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

      <main className="no-print px-6 py-5 max-w-[1400px] mx-auto">
        {message && (
          <div className="mb-4">
            <Note tone={message.tone === "danger" ? "danger" : message.tone === "ok" ? "ok" : "info"}>{message.text}</Note>
          </div>
        )}

        {screen === "home" && (
          <HomeScreen
            project={project}
            calc={calc}
            savedProjects={savedProjects}
            regionId={project.regionId}
            onNewProject={handleNewProject}
            onOpenProject={handleOpenProject}
            onImport={handleImportClick}
            onNavigate={handleNavigate}
          />
        )}

        {screen === "projects" && (
          <ProjectListScreen
            savedProjects={savedProjects}
            currentProjectId={project.projectId}
            onOpenProject={handleOpenProject}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onExport={handleExport}
            onImport={handleImportClick}
            onNewProject={handleNewProject}
          />
        )}

        {screen === "workspace" && variant === "C" && (
          <div className="grid grid-cols-1 gap-5 items-start pb-24">
            <div data-testid="step-editor">
            <StepEditor
              step={step}
              project={project}
              calc={calc}
              stepStatus={stepStatus}
              actions={actions}
              engine={ENGINE}
              onJump={setStep}
              onGoResult={() => setStep("result")}
              onOpenReport={() => handleNavigate("report")}
            />
            </div>
            <DesignCSubNote regionId={project.regionId} />
            <DesignCBar
              project={project}
              calc={calc}
              step={step}
              stepStatus={stepStatus}
              onJump={setStep}
              onGoResult={() => setStep("result")}
              onOpenReport={() => handleNavigate("report")}
            />
          </div>
        )}

        {screen === "workspace" && variant === "B" && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
            <div className="flex flex-col">
              <DesignBEditor
                step={step}
                project={project}
                calc={calc}
                stepStatus={stepStatus}
                actions={actions}
                engine={ENGINE}
                onJump={setStep}
                onGoResult={() => setStep("result")}
                onOpenReport={() => handleNavigate("report")}
              />
            </div>
            {/* 長い入力画面でも不足・計算値を常に見られるようにPCでは追従させる。
                狭幅では通常配置(追従は解除)にし、入力エリアを狭めない。 */}
            <div className="lg:sticky lg:top-4">
              <DesignBWorkspace
                project={project}
                calc={calc}
                stepStatus={stepStatus}
                regionId={project.regionId}
              />
            </div>
          </div>
        )}

        {screen === "workspace" && variant === "A" && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] gap-5 items-start">
            <StepNav current={step} stepStatus={stepStatus} onSelect={setStep} />
            <div className="min-w-0" data-testid="step-editor">
              <StepEditor
                step={step}
                project={project}
                calc={calc}
                stepStatus={stepStatus}
                actions={actions}
                engine={ENGINE}
                onJump={setStep}
                onGoResult={() => setStep("result")}
                onOpenReport={() => handleNavigate("report")}
              />
              <div className="mt-4 flex justify-between">
                <Button onClick={() => setStep(prevStepId(step))} disabled={step === STEPS[0].id}>前のステップ</Button>
                <Button variant="primary" onClick={() => setStep(nextStepId(step))} disabled={step === STEPS[STEPS.length - 1].id}>次のステップ</Button>
              </div>
            </div>
            <StatusPanel project={project} calc={calc} stepStatus={stepStatus} regionId={project.regionId} />
          </div>
        )}

        {screen === "report" && (
          <ReportScreen
            project={project}
            calc={calc}
            report={report}
            onDownloadCsv={() => report && downloadCsv(report, `${project.projectName || "hvac-load"}.csv`)}
            onPrint={() => window.print()}
            onDetailed={() => handleNavigate("detailed")}
            onBack={() => handleNavigate("workspace")}
          />
        )}

        {screen === "detailed" && (
          <DetailedReportScreen
            project={project}
            detailedReport={detailedReport}
            onDownloadCsv={() => detailedReport && downloadDetailedCsv(detailedReport, `${project.projectName || "hvac-load"}-detailed.csv`)}
            onPrint={() => window.print()}
            onBack={() => handleNavigate("report")}
          />
        )}
      </main>

      {screen === "report" && report && <PrintReport report={report} />}
      {screen === "detailed" && detailedReport && <PrintDetailedReport report={detailedReport} />}
    </div>
  );
}

function stepIndex(id) {
  const index = STEPS.findIndex((s) => s.id === id);
  return index < 0 ? 0 : index;
}

function prevStepId(id) {
  return STEPS[Math.max(0, stepIndex(id) - 1)].id;
}

function nextStepId(id) {
  return STEPS[Math.min(STEPS.length - 1, stepIndex(id) + 1)].id;
}
