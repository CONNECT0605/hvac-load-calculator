import { useState, useMemo } from "react";

const INK = "#1C2530";
const MUTED = "#6B7680";
const PAPER = "#F3F4F1";
const PANEL = "#FFFFFF";
const RULE = "#D8D8D3";
const COOL = "#2C7A7B";
const HEAT = "#B8562F";
const REAL = "#2C6B7A";   // 実データタグ色
const SAMPLE = "#B8562F"; // サンプルデータタグ色
const NEED_CHECK = "#8A6D3B"; // 要確認タグ色

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


// 【サンプルデータ】価格・納期比較のロジック(最安/納期優先/バランス)を動作確認するための仮データ。
// 実在メーカー名との混同を避けるため、メーカー名・販売店名はすべて記号表記にしています。
// 価格帯は容量(kW)に比例させた仮の単価であり、実売価格ではありません。
const SAMPLE_VENDORS = [
  { id: "s1", store: "サンプル販売店A", makerLabel: "メーカーA相当品(仮)", pricePerKW: 52500, shipping: 15000, leadDays: 20 },
  { id: "s2", store: "サンプル販売店B", makerLabel: "メーカーB相当品(仮)", pricePerKW: 49750, shipping: 0, leadDays: 21 },
  { id: "s3", store: "サンプル販売店C", makerLabel: "メーカーC相当品(仮)", pricePerKW: 57500, shipping: 0, leadDays: 5 },
  { id: "s4", store: "サンプル販売店D", makerLabel: "メーカーD相当品(仮)", pricePerKW: 55625, shipping: 20000, leadDays: 25 },
  { id: "s5", store: "サンプル販売店E", makerLabel: "メーカーE相当品(仮)", pricePerKW: 45000, shipping: 25000, leadDays: 30 },
];

function yen(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "―";
  return `¥${Math.round(n).toLocaleString()}`;
}

// =====================================================================
// 共通UIパーツ
// =====================================================================
function FieldRow({ label, unit, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
      <label className="text-sm" style={{ color: INK }}>{label}</label>
      <div className="flex items-center gap-2">
        {children}
        {unit && <span className="text-xs w-10 text-right" style={{ color: MUTED }}>{unit}</span>}
      </div>
    </div>
  );
}

function NumInput({ value, onChange, min = 0, step = 1, width = "w-24" }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={`${width} font-mono text-sm text-right px-2 py-1 bg-transparent outline-none focus:bg-white`}
      style={{ border: `1px solid ${RULE}`, color: INK }}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm px-2 py-1.5 bg-transparent outline-none"
      style={{ border: `1px solid ${RULE}`, color: INK }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

function Panel({ children }) {
  return <div className="p-5" style={{ background: PANEL, border: `1px solid ${RULE}` }}>{children}</div>;
}

function Banner({ color = HEAT, children }) {
  return (
    <div className="px-4 py-3 text-xs leading-relaxed" style={{ borderLeft: `3px solid ${color}`, background: PANEL, color: MUTED }}>
      {children}
    </div>
  );
}

function DataTag({ kind }) {
  const map = {
    real: { label: "実データ", color: REAL },
    sample: { label: "サンプルデータ", color: SAMPLE },
    estimate: { label: "概算", color: MUTED },
    ref: { label: "参考値", color: MUTED },
    check: { label: "要確認", color: NEED_CHECK },
  };
  const t = map[kind] || map.check;
  return (
    <span
      className="text-xs px-1.5 py-0.5"
      style={{ color: t.color, border: `1px solid ${t.color}` }}
    >
      {t.label}
    </span>
  );
}

function StepHeader({ n, total, title, note }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs" style={{ color: MUTED }}>STEP {n}/{total}</span>
        <h3 className="text-sm font-sans font-semibold" style={{ color: INK }}>{title}</h3>
      </div>
      {note && <p className="text-xs mt-1" style={{ color: MUTED }}>{note}</p>}
    </div>
  );
}

const FLOW = [
  { id: "calc", label: "負荷計算" },
  { id: "equipment", label: "機器選定" },
  { id: "pricing", label: "価格比較" },
  { id: "construction", label: "工事費概算" },
  { id: "internal", label: "原価・利益率" },
  { id: "customer", label: "客先向け見積" },
];

function Breadcrumb({ screen, onJump }) {
  const idx = FLOW.findIndex((f) => f.id === screen);
  return (
    <div className="flex flex-wrap items-center gap-1 mb-6 text-xs">
      {FLOW.map((f, i) => (
        <div key={f.id} className="flex items-center gap-1">
          <button
            onClick={() => i <= idx && onJump(f.id)}
            className="px-2 py-1"
            style={{
              color: i === idx ? INK : i < idx ? MUTED : "#B7BEC4",
              borderBottom: i === idx ? `2px solid ${COOL}` : "2px solid transparent",
              cursor: i <= idx ? "pointer" : "default",
            }}
          >
            {i + 1}. {f.label}
          </button>
          {i < FLOW.length - 1 && <span style={{ color: RULE }}>→</span>}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// STEP: 機器選定(概算選定)
// =====================================================================
function EquipmentScreen({ calc, selection, setSelection, onNext, onBack }) {
  const sizeInfo = PACKAGE_SIZES.find((p) => p.kw === selection.size) || PACKAGE_SIZES[1];
  const realModels = EQUIPMENT_DB[selection.size] || [];
  const isReal = realModels.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <StepHeader n={2} total={6} title="機器選定(概算選定)" note="必要能力を満たす機種構成の候補です。実施設計上の最適解と断定するものではありません。" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>必要冷房能力</div>
            <div className="font-mono text-lg" style={{ color: INK }}>{calc.coolingLoadKW.toFixed(1)} kW</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>必要暖房能力</div>
            <div className="font-mono text-lg" style={{ color: INK }}>{calc.heatingLoadKW.toFixed(1)} kW</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>選定基準能力</div>
            <div className="font-mono text-lg" style={{ color: INK }}>{calc.requiredCapacityKW.toFixed(1)} kW</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>必要換気量</div>
            <div className="font-mono text-lg" style={{ color: INK }}>{calc.ventilationM3h.toLocaleString()} m³/h</div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-2 pt-4" style={{ borderTop: `1px solid ${RULE}` }}>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>選択容量(候補)</div>
            <select
              value={selection.size}
              onChange={(e) => {
                const kw = Number(e.target.value);
                const count = Math.max(1, Math.ceil(calc.requiredCapacityKW / kw));
                setSelection({ size: kw, count });
              }}
              className="text-sm px-2 py-1.5"
              style={{ border: `1px solid ${RULE}`, color: INK }}
            >
              {PACKAGE_SIZES.map((p) => (
                <option key={p.kw} value={p.kw}>{p.kw.toFixed(1)} kW ({p.hp}馬力 / {p.code})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>台数</div>
            <NumInput value={selection.count} onChange={(v) => setSelection({ ...selection, count: v })} min={1} width="w-20" />
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>合計容量</div>
            <div className="font-mono text-sm" style={{ color: INK }}>{(selection.size * selection.count).toFixed(1)} kW</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>余裕率</div>
            <div className="font-mono text-sm" style={{ color: INK }}>
              +{(((selection.size * selection.count - calc.requiredCapacityKW) / calc.requiredCapacityKW) * 100).toFixed(1)}%
            </div>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: MUTED }}>
          ※ 台数・容量は自由に変更できます。実際の機種選定はゾーニング・配管長・室外機設置スペース・搬入経路等を踏まえた個別検討が必要です。
        </p>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-sans font-semibold" style={{ color: INK }}>
            {sizeInfo.kw.toFixed(1)}kW({sizeInfo.hp}馬力/{sizeInfo.code})クラスの機器候補
          </h3>
          {isReal ? <DataTag kind="real" /> : <DataTag kind="check" />}
        </div>

        {isReal ? (
          <>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              メーカー・型式・仕様(冷房能力・室内機形式・電源等)はWeb検索により実在を確認したものです。暖房能力・価格・在庫・納期は確認できていないため「要確認」と表示しています。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[880px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>メーカー</th>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>型式</th>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>室内機形式</th>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>構成</th>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>電源</th>
                    <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>冷房能力</th>
                    <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>暖房能力</th>
                    <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>出典</th>
                    <th className="text-left font-normal py-2" style={{ color: MUTED }}>確認日</th>
                  </tr>
                </thead>
                <tbody>
                  {realModels.map((e) => (
                    <tr key={e.model} style={{ borderBottom: `1px solid ${RULE}` }}>
                      <td className="py-2 pr-3">{e.maker}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.model}</td>
                      <td className="py-2 pr-3 text-xs">{e.indoorType}</td>
                      <td className="py-2 pr-3 text-xs">{e.config}</td>
                      <td className="py-2 pr-3 text-xs">{e.power === "要確認" || e.power.startsWith("要確認") ? <DataTag kind="check" /> : e.power}</td>
                      <td className="py-2 pr-3 text-right font-mono">{e.coolingKW.toFixed(1)} kW</td>
                      <td className="py-2 pr-3 text-right">{e.heatingKW ? `${e.heatingKW.toFixed(1)} kW` : <DataTag kind="check" />}</td>
                      <td className="py-2 pr-3">
                        <a href={e.source.url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: REAL }}>
                          {e.source.name}
                        </a>
                      </td>
                      <td className="py-2 text-xs" style={{ color: MUTED }}>{e.source.confirmedDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Banner color={NEED_CHECK}>
            この容量帯({sizeInfo.kw.toFixed(1)}kW/{sizeInfo.hp}馬力)の実在型式は今回未調査です。要確認。
            今回のテスト条件(飲食店・100m²・30人・関東)では8.0kW(3馬力)クラスが選定されるため、そちらでは実データを確認済みです。容量を8.0kWに変更すると実データが表示されます。
          </Banner>
        )}
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs px-3 py-2" style={{ border: `1px solid ${RULE}`, color: INK }}>← 負荷計算に戻る</button>
        <button onClick={onNext} className="text-sm px-4 py-2" style={{ background: INK, color: PAPER }}>価格比較へ進む →</button>
      </div>
    </div>
  );
}

// =====================================================================
// STEP: 価格比較
// =====================================================================
function PricingScreen({ selection, quotes, strategies, onNext, onBack }) {
  const { cheapest, fastest, balanced } = strategies;
  const realModels = EQUIPMENT_DB[selection.size] || [];

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <StepHeader n={3} total={6} title="価格比較" note={`${selection.size.toFixed(1)}kWクラス × ${selection.count}台 を前提にした比較`} />

        <div className="mb-4">
          <Banner color={realModels.length > 0 ? REAL : NEED_CHECK}>
            <div className="flex items-center gap-2 mb-1">
              <DataTag kind={realModels.length > 0 ? "real" : "check"} />
              <span>{realModels.length > 0 ? "実在型式リファレンス(正式選定)" : "この容量クラスの実在型式は未調査(容量クラス仮選定)"}</span>
            </div>
            {realModels.length > 0
              ? "前STEPで確認した実在型式です。価格・在庫・納期は今回のプロトタイプでは取得できていないため「要確認」です。商品ページのリンクは実際に検索で確認したURLです。"
              : "この容量クラスについては実在機器データを確認できていません。以下は容量クラスとしての仮選定であり、実在製品を示すものではありません。"}
          </Banner>
        </div>
        {realModels.length > 0 && (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>メーカー</th>
                <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>型式</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>販売価格</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>在庫</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>納期</th>
                <th className="text-left font-normal py-2" style={{ color: MUTED }}>商品ページ</th>
              </tr>
            </thead>
            <tbody>
              {realModels.map((e) => (
                <tr key={e.model} style={{ borderBottom: `1px solid ${RULE}` }}>
                  <td className="py-2 pr-3">{e.maker}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.model}</td>
                  <td className="py-2 pr-3 text-right"><DataTag kind="check" /></td>
                  <td className="py-2 pr-3 text-right"><DataTag kind="check" /></td>
                  <td className="py-2 pr-3 text-right"><DataTag kind="check" /></td>
                  <td className="py-2">
                    <a href={e.source.url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 inline-block" style={{ border: `1px solid ${REAL}`, color: REAL }}>
                      商品ページを見る
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        <div className="mb-4">
          <Banner color={SAMPLE}>
            <div className="flex items-center gap-2 mb-1"><DataTag kind="sample" /><span>価格・納期比較ロジックのデモ</span></div>
            以下は「最安・納期優先・バランス」の比較ロジックを動作確認するための仮データです。メーカー名・販売店名は実在企業と混同しないよう記号表記にしており、実際の購入価格ではありません。
          </Banner>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>販売店(サンプル)</th>
                <th className="text-left font-normal py-2 pr-3" style={{ color: MUTED }}>相当品</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>1台価格</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>{selection.count}台合計</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>送料</th>
                <th className="text-right font-normal py-2 pr-3" style={{ color: MUTED }}>納期</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const tags = [];
                if (q.id === cheapest.id) tags.push({ label: "最安", color: COOL });
                if (q.id === fastest.id) tags.push({ label: "納期優先", color: HEAT });
                if (q.id === balanced.id) tags.push({ label: "バランス", color: MUTED });
                return (
                  <tr key={q.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                    <td className="py-2 pr-3">
                      {q.store}
                      {tags.map((t) => <span key={t.label} className="ml-2 text-xs" style={{ color: t.color }}>{t.label}</span>)}
                    </td>
                    <td className="py-2 pr-3 text-xs" style={{ color: MUTED }}>{q.makerLabel}</td>
                    <td className="py-2 pr-3 text-right font-mono">{yen(q.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{yen(q.totalUnitPrice)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{q.shipping ? yen(q.shipping) : "無料(仮)"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{q.leadDays}日(仮)</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: MUTED }}>
          評価ロジック: 「最安」は{selection.count}台合計+送料が最小のもの。「納期優先」は納期日数が最小のもの。「バランス」は価格・納期をそれぞれ最小〜最大で0〜1に正規化し、同じ重み(0.5 / 0.5)で合算したスコアが最小のもの。「最適」ではなく比較の一手法です。
        </p>
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs px-3 py-2" style={{ border: `1px solid ${RULE}`, color: INK }}>← 機器選定に戻る</button>
        <button onClick={onNext} className="text-sm px-4 py-2" style={{ background: INK, color: PAPER }}>工事費概算へ進む →</button>
      </div>
    </div>
  );
}

// =====================================================================
// STEP: 工事費概算
// =====================================================================
function ConstructionScreen({ selection, construction, setConstruction, costs, onNext, onBack }) {
  const c = construction;
  const set = (patch) => setConstruction({ ...c, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <StepHeader n={4} total={6} title="工事費概算" note="現地条件により大きく変動する概算(仮)です。パラメータを変更すると連動して再計算されます。" />
        <Banner color={NEED_CHECK}>
          <DataTag kind="estimate" /> 人工単価・m単価等の初期値は一般的な相場を参考にした仮定値であり、正式な出典に基づく確定値ではありません(要確認)。現場調査後に確定してください。
        </Banner>
      </Panel>

      {/* 空調施工費 */}
      <Panel>
        <h3 className="text-sm font-sans font-semibold mb-3" style={{ color: INK }}>空調施工費(仮)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <FieldRow label="作業人数" unit="人"><NumInput value={c.acWorkers} onChange={(v) => set({ acWorkers: v })} min={1} width="w-16" /></FieldRow>
          <FieldRow label="作業日数" unit="日"><NumInput value={c.acDays} onChange={(v) => set({ acDays: v })} min={1} width="w-16" /></FieldRow>
          <FieldRow label="人工単価" unit="円/人日"><NumInput value={c.acLaborRate} onChange={(v) => set({ acLaborRate: v })} step={1000} width="w-24" /></FieldRow>
          <FieldRow label="諸経費率" unit="%"><NumInput value={c.acOverheadPct} onChange={(v) => set({ acOverheadPct: v })} width="w-16" /></FieldRow>
        </div>
        <div className="pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${RULE}` }}>
          <span className="text-sm" style={{ color: INK }}>空調施工費 小計</span>
          <span className="font-mono text-lg" style={{ color: INK }}>{yen(costs.install)}</span>
        </div>
      </Panel>

      {/* 電気工事費 */}
      <Panel>
        <h3 className="text-sm font-sans font-semibold mb-3" style={{ color: INK }}>電気工事費(仮)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <FieldRow label="専用回路数" unit="回路"><NumInput value={c.circuits} onChange={(v) => set({ circuits: v })} min={0} width="w-16" /></FieldRow>
          <FieldRow label="ブレーカー単価" unit="円/回路"><NumInput value={c.breakerCost} onChange={(v) => set({ breakerCost: v })} step={1000} width="w-24" /></FieldRow>
          <FieldRow label="配線部材" unit="円/台"><NumInput value={c.wiringCostPerUnit} onChange={(v) => set({ wiringCostPerUnit: v })} step={1000} width="w-24" /></FieldRow>
          <FieldRow label="人工単価" unit="円/人日"><NumInput value={c.elecLaborRate} onChange={(v) => set({ elecLaborRate: v })} step={1000} width="w-24" /></FieldRow>
          <FieldRow label="作業日数" unit="日"><NumInput value={c.elecDays} onChange={(v) => set({ elecDays: v })} min={0} width="w-16" /></FieldRow>
          <FieldRow label="諸経費率" unit="%"><NumInput value={c.elecOverheadPct} onChange={(v) => set({ elecOverheadPct: v })} width="w-16" /></FieldRow>
        </div>
        <div className="pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${RULE}` }}>
          <span className="text-sm" style={{ color: INK }}>電気工事費 小計</span>
          <span className="font-mono text-lg" style={{ color: INK }}>{yen(costs.electric)}</span>
        </div>
      </Panel>

      {/* 配管工事費 */}
      <Panel>
        <h3 className="text-sm font-sans font-semibold mb-3" style={{ color: INK }}>配管工事費(仮)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <FieldRow label="配管長" unit="m/台"><NumInput value={c.pipeLengthPerUnit} onChange={(v) => set({ pipeLengthPerUnit: v })} width="w-16" /></FieldRow>
          <FieldRow label="配管m単価" unit="円/m"><NumInput value={c.pipeUnitPrice} onChange={(v) => set({ pipeUnitPrice: v })} step={100} width="w-24" /></FieldRow>
          <FieldRow label="ドレン材" unit="円/台"><NumInput value={c.drainCostPerUnit} onChange={(v) => set({ drainCostPerUnit: v })} step={500} width="w-24" /></FieldRow>
          <FieldRow label="保温材" unit="円/台"><NumInput value={c.insulationCostPerUnit} onChange={(v) => set({ insulationCostPerUnit: v })} step={500} width="w-24" /></FieldRow>
          <FieldRow label="人工単価" unit="円/人日"><NumInput value={c.pipeLaborRate} onChange={(v) => set({ pipeLaborRate: v })} step={1000} width="w-24" /></FieldRow>
          <FieldRow label="作業日数" unit="日"><NumInput value={c.pipeDays} onChange={(v) => set({ pipeDays: v })} min={0} width="w-16" /></FieldRow>
          <FieldRow label="高所作業">
            <input type="checkbox" checked={c.highAltitude} onChange={(e) => set({ highAltitude: e.target.checked })} />
          </FieldRow>
        </div>
        <div className="pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${RULE}` }}>
          <span className="text-sm" style={{ color: INK }}>配管工事費 小計{c.highAltitude && "(高所作業+20%)"}</span>
          <span className="font-mono text-lg" style={{ color: INK }}>{yen(costs.piping)}</span>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <span className="text-sm font-sans font-semibold" style={{ color: INK }}>工事費概算 合計</span>
          <span className="font-mono text-xl" style={{ color: INK }}>{yen(costs.constructionTotal)}</span>
        </div>
        <p className="text-xs mt-2" style={{ color: MUTED }}>
          参考:ダイキン工業公式サイトによると、5馬力以下(目安:一般事務所70m²以下)の場合、機器代+工事費込みで50〜70万円/台が最も多い価格帯とされています。現在の設定値がこの相場感から大きく外れていないか確認の目安にしてください。
        </p>
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs px-3 py-2" style={{ border: `1px solid ${RULE}`, color: INK }}>← 価格比較に戻る</button>
        <button onClick={onNext} className="text-sm px-4 py-2" style={{ background: INK, color: PAPER }}>原価・利益率設定へ進む →</button>
      </div>
    </div>
  );
}

// =====================================================================
// STEP: 原価・利益率(社内用)
// =====================================================================
function InternalScreen({ selection, chosenQuote, costs, marginRate, setMarginRate, onNext, onBack }) {
  const sell = costs.costTotal / (1 - marginRate);
  const profit = sell - costs.costTotal;

  return (
    <div className="flex flex-col gap-6">
      <Banner color={NEED_CHECK}>
        <strong>社内用画面</strong> — 原価・粗利率はここまでの画面のみで確認できます。次のSTEPの客先向け画面には表示されません。
      </Banner>

      <Panel>
        <StepHeader n={5} total={6} title="原価内訳" note={`価格比較STEPで選定した「${chosenQuote.store}」の仮データを基に算出`} />
        <table className="w-full text-sm">
          <tbody>
            {[
              { label: "機器仕入価格(サンプル)", value: costs.equipment },
              { label: "送料(サンプル)", value: costs.shipping },
              { label: "空調施工原価", value: costs.install },
              { label: "電気工事原価", value: costs.electric },
              { label: "配管工事原価", value: costs.piping },
              { label: "その他原価", value: costs.other },
            ].map((row) => (
              <tr key={row.label} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td className="py-2" style={{ color: INK }}>{row.label}</td>
                <td className="py-2 text-right font-mono">{yen(row.value)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-sans font-semibold" style={{ color: INK }}>原価合計</td>
              <td className="py-3 text-right font-mono text-lg" style={{ color: INK }}>{yen(costs.costTotal)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel>
        <h3 className="text-sm font-sans font-semibold mb-3" style={{ color: INK }}>粗利率設定</h3>
        <div className="flex gap-2 mb-4">
          {[0.10, 0.15, 0.20, 0.25].map((r) => (
            <button
              key={r}
              onClick={() => setMarginRate(r)}
              className="text-sm px-3 py-2"
              style={{
                border: `1px solid ${marginRate === r ? INK : RULE}`,
                background: marginRate === r ? INK : "transparent",
                color: marginRate === r ? PAPER : INK,
              }}
            >
              {Math.round(r * 100)}%
            </button>
          ))}
        </div>
        <p className="text-xs mb-4" style={{ color: MUTED }}>
          販売価格 = 原価合計 ÷ (1 − 粗利率) で算出しています(原価に定額を上乗せる方式ではなく、販売価格に対する粗利率として管理する方式です)。
        </p>
        <div className="grid grid-cols-2 gap-6 pt-3" style={{ borderTop: `1px solid ${RULE}` }}>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>販売価格(税別)</div>
            <div className="font-mono text-2xl" style={{ color: INK }}>{yen(sell)}</div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: MUTED }}>利益額</div>
            <div className="font-mono text-2xl" style={{ color: COOL }}>{yen(profit)}</div>
          </div>
        </div>
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs px-3 py-2" style={{ border: `1px solid ${RULE}`, color: INK }}>← 工事費概算に戻る</button>
        <button onClick={onNext} className="text-sm px-4 py-2" style={{ background: INK, color: PAPER }}>客先向け見積を見る →</button>
      </div>
    </div>
  );
}

// =====================================================================
// STEP: 客先提示見積
// =====================================================================
function CustomerScreen({ buildingType, region, floorArea, occupants, selection, costs, marginRate, onBack }) {
  const factor = 1 / (1 - marginRate);
  const rows = [
    { label: "空調機器", value: costs.equipment * factor },
    { label: "空調設備工事", value: costs.install * factor },
    { label: "電気工事", value: costs.electric * factor },
    { label: "配管工事", value: costs.piping * factor },
    { label: "諸経費(送料等)", value: (costs.shipping + costs.other) * factor },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <StepHeader n={6} total={6} title="概算見積書(客先提示用)" />
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          {buildingType.label} / 延床{floorArea}m² / {occupants}人 / {region.label} / {selection.size.toFixed(1)}kW×{selection.count}台
        </p>

        <table className="w-full text-sm mb-4">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td className="py-3" style={{ color: INK }}>{r.label}</td>
                <td className="py-3 text-right font-mono">{yen(r.value)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-4 font-sans font-semibold" style={{ color: INK }}>概算合計金額(税別)</td>
              <td className="py-4 text-right font-mono text-2xl" style={{ color: INK }}>{yen(total)}</td>
            </tr>
          </tbody>
        </table>

        <Banner color={HEAT}>
          本見積は初期概算であり、正式な見積書ではありません。機器の型式・価格・在庫・納期は現時点でサンプルデータを含みます。現地調査・仕様確定後に正式な見積金額が確定します。
        </Banner>
      </Panel>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs px-3 py-2" style={{ border: `1px solid ${RULE}`, color: INK }}>← 原価・利益率設定に戻る</button>
      </div>
    </div>
  );
}

// =====================================================================
// メイン
// =====================================================================
export default function HVACCalculator() {
  const [screen, setScreen] = useState("calc");

  const [buildingTypeId, setBuildingTypeId] = useState("restaurant");
  const [regionId, setRegionId] = useState("kanto");
  const [floorArea, setFloorArea] = useState(100);
  const [floors, setFloors] = useState(5);
  const [occupants, setOccupants] = useState(30);
  const [coolingSetTemp, setCoolingSetTemp] = useState(26);
  const [heatingSetTemp, setHeatingSetTemp] = useState(22);
  const [marginPct, setMarginPct] = useState(0); // 計画上の余裕(旧SAFETY_FACTORの置き換え。初期値0%)
  const [showBasis, setShowBasis] = useState(false);

  const [selection, setSelection] = useState({ size: 8.0, count: 4 });
  const [marginRate, setMarginRate] = useState(0.20);
  const [construction, setConstruction] = useState({
    acWorkers: 2,
    acDays: 2,
    acLaborRate: 28000,
    acOverheadPct: 15,
    circuits: 4,
    breakerCost: 8000,
    wiringCostPerUnit: 15000,
    elecLaborRate: 30000,
    elecDays: 2,
    elecOverheadPct: 15,
    pipeLengthPerUnit: 5,
    pipeUnitPrice: 3500,
    drainCostPerUnit: 6000,
    insulationCostPerUnit: 3000,
    pipeLaborRate: 28000,
    pipeDays: 2,
    highAltitude: false,
  });

  const buildingType = findBuildingType(buildingTypeId);
  const region = findRegion(regionId);

  // ---- 空調負荷計算(既存ロジック・変更なし) ----
  const result = useMemo(() => {
    // 【計算エンジン統合 2026-09-02】ここから先の計算は一切行わない。
    // 共有ロジックブロック(SHARED-LOGIC-START〜END、engine.jsと同一)の
    // computeLoad/selectEquipment を呼ぶだけの薄いラッパーとする。
    const loadResult = computeLoad({
      buildingTypeId,
      regionId,
      floorAreaTotal: floorArea,
      floors,
      occupants,
      coolingSetTemp,
      heatingSetTemp,
      marginPct,
      includeOccupantLoad: false, // 既定false。出典未確認のため既定では加算しない(正規化仕様の決定事項)
    });

    if (loadResult.status === "invalid") {
      return loadResult;
    }

    const equipmentResult = selectEquipment(loadResult);

    // UI側の既存フィールド名(coolingLoadKW/heatingLoadKW/equipmentOptions等)は
    // 表示ラベルの変更を避けるため据え置き、値はすべてloadResult/equipmentResult由来とする。
    return {
      status: "ok",
      warnings: loadResult.warnings,
      roughLoadCoolingKW: loadResult.roughLoadCoolingKW,
      roughLoadHeatingKW: loadResult.roughLoadHeatingKW,
      occupantSensibleKW: loadResult.occupantSensibleKW,
      occupantLatentKW: loadResult.occupantLatentKW,
      includeOccupantLoad: loadResult.includeOccupantLoad,
      designLoadCoolingKW: loadResult.designLoadCoolingKW,
      designLoadHeatingKW: loadResult.designLoadHeatingKW,
      marginPct: loadResult.marginPct,
      coolingLoadKW: loadResult.designLoadCoolingKW, // 表示名は従来どおり「必要冷房能力」に対応
      heatingLoadKW: loadResult.designLoadHeatingKW,
      basis: loadResult.basis,
      ventilationM3h: loadResult.ventilationM3h,
      ventilationPerArea: loadResult.ventilationPerArea,
      requiredCapacityKW: loadResult.requiredCapacityKW,
      equipmentOptions: equipmentResult.status === "ok" ? equipmentResult.candidates : [],
      recommended: equipmentResult.status === "ok" ? equipmentResult.recommended : null,
      selectionReasonText: equipmentResult.selectionReasonText,
      tempFactorCooling: loadResult.tempFactorCooling,
      tempFactorHeating: loadResult.tempFactorHeating,
    };
  }, [floorArea, floors, occupants, coolingSetTemp, heatingSetTemp, marginPct, buildingTypeId, regionId]);

  const maxLoad = Math.max(result.coolingLoadKW || 0, result.heatingLoadKW || 0, 1);

  // ---- 価格比較(サンプル)計算 ----
  const quotes = useMemo(() => {
    const list = SAMPLE_VENDORS.map((v) => {
      const unitPrice = Math.round((v.pricePerKW * selection.size) / 100) * 100;
      const totalUnitPrice = unitPrice * selection.count;
      const totalWithShipping = totalUnitPrice + v.shipping;
      return { ...v, unitPrice, totalUnitPrice, totalWithShipping };
    });
    const minPrice = Math.min(...list.map((q) => q.totalWithShipping));
    const maxPrice = Math.max(...list.map((q) => q.totalWithShipping));
    const minLead = Math.min(...list.map((q) => q.leadDays));
    const maxLead = Math.max(...list.map((q) => q.leadDays));
    const priceRange = maxPrice - minPrice || 1;
    const leadRange = maxLead - minLead || 1;
    return list.map((q) => {
      const normPrice = (q.totalWithShipping - minPrice) / priceRange;
      const normLead = (q.leadDays - minLead) / leadRange;
      return { ...q, balanceScore: normPrice * 0.5 + normLead * 0.5 };
    });
  }, [selection]);

  const cheapest = quotes.reduce((a, b) => (b.totalWithShipping < a.totalWithShipping ? b : a));
  const fastest = quotes.reduce((a, b) => (b.leadDays < a.leadDays ? b : a));
  const balanced = quotes.reduce((a, b) => (b.balanceScore < a.balanceScore ? b : a));
  const strategies = { cheapest, fastest, balanced };

  const [chosenStrategyKey, setChosenStrategyKey] = useState("balanced");
  const chosenQuote = strategies[chosenStrategyKey] || balanced;

  // ---- 工事費概算 ----
  const costs = useMemo(() => {
    const c = construction;
    const install = c.acWorkers * c.acDays * c.acLaborRate * (1 + c.acOverheadPct / 100);
    const electric =
      (c.circuits * c.breakerCost + selection.count * c.wiringCostPerUnit + c.elecDays * c.elecLaborRate) *
      (1 + c.elecOverheadPct / 100);
    const pipingBase =
      selection.count * c.pipeLengthPerUnit * c.pipeUnitPrice +
      selection.count * (c.drainCostPerUnit + c.insulationCostPerUnit) +
      c.pipeDays * c.pipeLaborRate;
    const piping = pipingBase * (c.highAltitude ? 1.2 : 1);
    const constructionTotal = install + electric + piping;

    const equipment = chosenQuote.totalUnitPrice;
    const shipping = chosenQuote.shipping;
    const other = 0;
    const costTotal = equipment + shipping + install + electric + piping + other;

    return { install, electric, piping, constructionTotal, equipment, shipping, other, costTotal };
  }, [construction, selection, chosenQuote]);

  const goto = (s) => setScreen(s);

  return (
    <div className="min-h-screen w-full" style={{ background: PAPER, color: INK }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-2">
          <h1 className="text-2xl font-sans font-semibold tracking-tight" style={{ color: INK }}>
            設備設計プレゼン用プロトタイプ
          </h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            建物条件 → 空調負荷計算 → 機器選定 → 価格比較 → 工事費概算 → 原価・利益率 → 客先向け概算見積
          </p>
        </div>
        <div
          className="mb-6 px-4 py-3 text-xs leading-relaxed"
          style={{ borderLeft: `3px solid ${HEAT}`, background: PANEL, color: MUTED }}
        >
          本ツールはデモ・プレゼン用のプロトタイプであり、実施設計・正式見積の代替にはなりません。機器の型式・仕様の一部はWeb検索により実在を確認していますが、価格・在庫・納期はサンプルデータまたは「要確認」です。
        </div>

        <Breadcrumb screen={screen} onJump={goto} />

        {screen === "calc" && (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-2/5">
              <Panel>
                <h2 className="text-sm font-sans font-semibold mb-1" style={{ color: INK }}>建物条件</h2>
                <p className="text-xs mb-2" style={{ color: MUTED }}>入力値は即時に反映されます</p>

                <FieldRow label="建物用途">
                  <Select value={buildingTypeId} onChange={setBuildingTypeId} options={BUILDING_TYPES} />
                </FieldRow>
                <FieldRow label="所在地(地域区分)">
                  <Select value={regionId} onChange={setRegionId} options={REGIONS} />
                </FieldRow>
                <FieldRow label="延床面積(合計)" unit="m²">
                  <NumInput value={floorArea} onChange={setFloorArea} step={10} width="w-28" />
                </FieldRow>
                <FieldRow label="階数" unit="階">
                  <NumInput value={floors} onChange={setFloors} min={1} width="w-20" />
                </FieldRow>
                <FieldRow label="在室人数" unit="人">
                  <NumInput value={occupants} onChange={setOccupants} width="w-24" />
                </FieldRow>
                <FieldRow label="冷房設定温度" unit="℃">
                  <NumInput value={coolingSetTemp} onChange={setCoolingSetTemp} width="w-20" />
                </FieldRow>
                <FieldRow label="暖房設定温度" unit="℃">
                  <NumInput value={heatingSetTemp} onChange={setHeatingSetTemp} width="w-20" />
                </FieldRow>
                <FieldRow label="計画上の余裕(任意)" unit="%">
                  <NumInput value={marginPct} onChange={setMarginPct} min={0} width="w-20" />
                </FieldRow>
              </Panel>
              <p className="text-xs mt-2" style={{ color: MUTED }}>
                「延床面積」は建物全体の合計値として1回のみ計算に使用します。「階数」は機種の階別配分表示にのみ使用し、負荷計算そのものには影響しません。「計画上の余裕」は初期値0%で、旧来の一律安全率(1.15倍)は撤廃しています。
              </p>

              <button onClick={() => setShowBasis((v) => !v)} className="mt-3 text-xs underline" style={{ color: MUTED }}>
                {showBasis ? "計算根拠を隠す" : "計算根拠を表示"}
              </button>

              {showBasis && result.status === "ok" && (
                <div className="mt-3 p-4 text-xs leading-relaxed font-mono" style={{ background: PANEL, border: `1px solid ${RULE}`, color: MUTED }}>
                  <div>① 面積ベース冷房負荷原単位: {buildingType.coolingWm2.value} W/m²(<DataTag kind="check" />{buildingType.coolingWm2.status === "provisional" ? " 正式根拠未確認の暫定値" : ""})</div>
                  <div>① 面積ベース暖房負荷原単位: {buildingType.heatingWm2.value} W/m²(<DataTag kind="check" /> 正式根拠未確認の暫定値)</div>
                  <div>① 地域補正(冷房): ×{region.coolingFactor} / (暖房): ×{region.heatingFactor}</div>
                  <div>① 温度設定補正(冷房): ×{result.tempFactorCooling.toFixed(2)} / (暖房): ×{result.tempFactorHeating.toFixed(2)}</div>
                  <div>① 概算負荷(冷房): {result.roughLoadCoolingKW.toFixed(2)} kW(面積ベースのみ)</div>
                  <div>① 概算負荷(暖房): {result.roughLoadHeatingKW.toFixed(2)} kW(面積ベースのみ)</div>
                  <div>参考:人体顕熱 {result.occupantSensibleKW.toFixed(2)} kW(60W/人・実務解説記事の目安値、要確認)</div>
                  <div>参考:人体潜熱 {result.occupantLatentKW.toFixed(2)} kW(50W/人・同上)</div>
                  <div>→ 原単位が人体発熱を含むか未確認のため、既定では上記を設計用必要負荷に加算していません(includeOccupantLoad={String(result.includeOccupantLoad)})</div>
                  <div>③ 設計用必要負荷(冷房): {result.designLoadCoolingKW.toFixed(2)} kW = 概算負荷(冷房)×(1+計画余裕)</div>
                  <div>③ 設計用必要負荷(暖房): {result.designLoadHeatingKW.toFixed(2)} kW = 概算負荷(暖房)×(1+計画余裕)</div>
                  <div>④ 計画上の余裕: +{result.marginPct}%(初期値0%・自動適用なし)</div>
                  <div>⑤ 選定基準: {result.basis === "cooling" ? "冷房負荷が支配的" : "暖房負荷が支配的"}</div>
                  <div>1人あたり換気量: {buildingType.ventPerPerson} m³/h/人</div>
                  {result.warnings.length > 0 && (
                    <div className="mt-2" style={{ color: HEAT }}>
                      {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-full md:w-3/5 flex flex-col gap-6">
              {result.status === "invalid" ? (
                <Panel>
                  <Banner color={HEAT}>{result.reason}</Banner>
                </Panel>
              ) : (
                <>
                  {result.warnings.length > 0 && (
                    <Banner color={HEAT}>
                      {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </Banner>
                  )}

                  <Panel>
                    <h2 className="text-sm font-sans font-semibold mb-4" style={{ color: INK }}>試算結果</h2>
                    <div className="grid grid-cols-2 gap-6 mb-5">
                      <div>
                        <div className="text-xs mb-1" style={{ color: COOL }}>必要冷房能力</div>
                        <div className="font-mono text-3xl" style={{ color: INK }}>
                          {result.coolingLoadKW.toFixed(1)}<span className="text-base ml-1" style={{ color: MUTED }}>kW</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: HEAT }}>必要暖房能力</div>
                        <div className="font-mono text-3xl" style={{ color: INK }}>
                          {result.heatingLoadKW.toFixed(1)}<span className="text-base ml-1" style={{ color: MUTED }}>kW</span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 text-xs" style={{ color: MUTED }}>
                      概算負荷(冷房・面積ベースのみ): {result.roughLoadCoolingKW.toFixed(1)}kW ／ 参考:人体顕熱 {result.occupantSensibleKW.toFixed(1)}kW + 人体潜熱 {result.occupantLatentKW.toFixed(1)}kW(現在の設計用必要負荷には未算入)
                      {result.marginPct > 0 && ` + 計画上の余裕${result.marginPct}%`}
                    </div>

                    <div className="mb-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs w-10" style={{ color: MUTED }}>冷房</span>
                        <div className="flex-1 h-3" style={{ background: PAPER }}>
                          <div className="h-3" style={{ width: `${(result.coolingLoadKW / maxLoad) * 100}%`, background: COOL }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-10" style={{ color: MUTED }}>暖房</span>
                        <div className="flex-1 h-3" style={{ background: PAPER }}>
                          <div className="h-3" style={{ width: `${(result.heatingLoadKW / maxLoad) * 100}%`, background: HEAT }} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${RULE}` }}>
                      <span className="text-sm" style={{ color: INK }}>必要換気量</span>
                      <span className="font-mono text-lg" style={{ color: INK }}>
                        {result.ventilationM3h.toLocaleString()} <span className="text-xs" style={{ color: MUTED }}>m³/h</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: MUTED }}>面積あたり参考値</span>
                      <span className="font-mono text-xs" style={{ color: MUTED }}>{result.ventilationPerArea.toFixed(2)} m³/h/m²</span>
                    </div>
                  </Panel>

                  <Panel>
                    <h2 className="text-sm font-sans font-semibold mb-1" style={{ color: INK }}>推奨設備容量・台数</h2>
                    <p className="text-xs mb-4" style={{ color: MUTED }}>
                      必要能力 {result.requiredCapacityKW.toFixed(1)} kW({result.basis === "cooling" ? "冷房基準" : "暖房基準"})を満たす標準機種の組み合わせ例
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                          <th className="text-left font-normal py-2" style={{ color: MUTED }}>機種容量</th>
                          <th className="text-right font-normal py-2" style={{ color: MUTED }}>台数</th>
                          <th className="text-right font-normal py-2" style={{ color: MUTED }}>1台あたり(参考)</th>
                          <th className="text-right font-normal py-2" style={{ color: MUTED }}>設置合計容量</th>
                          <th className="text-right font-normal py-2" style={{ color: MUTED }}>余裕率</th>
                          <th className="text-left font-normal py-2" style={{ color: MUTED }}>実データ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.equipmentOptions.map((opt) => {
                          const isRecommended = opt.size === result.recommended.size;
                          return (
                            <tr key={opt.size} style={{ borderBottom: `1px solid ${RULE}`, background: isRecommended ? PAPER : "transparent" }}>
                              <td className="py-2 font-mono">
                                {opt.size.toFixed(1)} kW
                                {isRecommended && <span className="ml-2 text-xs" style={{ color: COOL }}>推奨</span>}
                              </td>
                              <td className="py-2 text-right font-mono">{opt.count} 台</td>
                              <td className="py-2 text-right font-mono text-xs" style={{ color: MUTED }}>{opt.perFloor.toFixed(1)} 台/階</td>
                              <td className="py-2 text-right font-mono">{opt.installedKW.toFixed(1)} kW</td>
                              <td className="py-2 text-right font-mono text-xs" style={{ color: MUTED }}>+{opt.surplusPct.toFixed(1)}%</td>
                              <td className="py-2 text-xs">
                                <DataTag kind={opt.selectionType === "formal" ? "real" : "check"} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs mt-3" style={{ color: MUTED }}>
                      ※ 台数は必要能力を機種容量で除した切り上げ計算です。実際の機種選定はゾーニング・配管長・室外機設置スペース等を踏まえて行ってください。
                    </p>
                    <div className="mt-3 p-3 text-xs leading-relaxed" style={{ background: PAPER, color: MUTED }}>
                      <strong style={{ color: INK }}>選定理由:</strong> {result.selectionReasonText}
                    </div>
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${RULE}` }}>
                      <button
                        onClick={() => {
                          setSelection({ size: result.recommended.size, count: result.recommended.count });
                          goto("equipment");
                        }}
                        className="text-sm px-4 py-2"
                        style={{ background: INK, color: PAPER }}
                      >
                        この構成(推奨: {result.recommended.size.toFixed(1)}kW×{result.recommended.count}台)で機器選定へ進む
                      </button>
                    </div>
                  </Panel>
                </>
              )}
            </div>
          </div>
        )}

        {screen === "equipment" && (
          <EquipmentScreen
            calc={result}
            selection={selection}
            setSelection={setSelection}
            onNext={() => goto("pricing")}
            onBack={() => goto("calc")}
          />
        )}

        {screen === "pricing" && (
          <PricingScreen
            selection={selection}
            quotes={quotes}
            strategies={strategies}
            onNext={() => goto("construction")}
            onBack={() => goto("equipment")}
          />
        )}

        {screen === "construction" && (
          <ConstructionScreen
            selection={selection}
            construction={construction}
            setConstruction={setConstruction}
            costs={costs}
            onNext={() => goto("internal")}
            onBack={() => goto("pricing")}
          />
        )}

        {screen === "internal" && (
          <InternalScreen
            selection={selection}
            chosenQuote={chosenQuote}
            costs={costs}
            marginRate={marginRate}
            setMarginRate={setMarginRate}
            onNext={() => goto("customer")}
            onBack={() => goto("construction")}
          />
        )}

        {screen === "customer" && (
          <CustomerScreen
            buildingType={buildingType}
            region={region}
            floorArea={floorArea}
            occupants={occupants}
            selection={selection}
            costs={costs}
            marginRate={marginRate}
            onBack={() => goto("internal")}
          />
        )}
      </div>
    </div>
  );
}
