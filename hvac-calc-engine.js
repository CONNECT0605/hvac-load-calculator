// ============================================================================
// hvac-calc-engine.js  (v3 — 2026-09-02改訂)
// 空調負荷計算・機器選定の純粋計算エンジン(React非依存)
// 同じ入力値なら必ず同じ結果になる決定論的な関数群。
// hvac-load-calculator.jsx 内に埋め込まれているものと同一ロジックです
// (jsxは単一ファイルのブラウザartifactのためexternal importができず、
//  このファイルとjsx内のロジックは手動で同期しています。既知の制約)
//
// 【v3での変更点】
// 1. 「概算負荷(roughLoad)」と「設計用必要負荷(designLoad)」を明確に分離。
//    人体負荷は既定では概算負荷に加算しない(二重計上リスクの回避)。
//    ユーザーが明示的に includeOccupantLoad=true にした場合のみ加算する。
// 2. 面積の定義を明確化するフィールドを追加(floorAreaTotal, areaInputMode)。
// 3. 機種選定結果に selectionType("formal"=実在機器による正式選定 /
//    "provisional"=容量クラス仮選定)を追加し、表示側で混同できない構造にした。
// 4. EQUIPMENT_DBに5.6kWクラス(2馬力/50形)の実在型式を追加。
//    全エントリに source{name, url, confirmedDate} を持たせ追跡可能にした。
// ============================================================================

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

// ============================================================================
// 【第1段階 2026-09-04】プロ仕様データモデル(Project/Room階層)+ アダプター層
// ----------------------------------------------------------------------------
// 重要な設計原則:
// 1. このセクションは上記SHARED-LOGICブロックを一切呼び出し元から変更しない。
//    既存のcomputeLoad/selectEquipment/computeAllの動作・引数・戻り値は不変。
// 2. ここで新設するファクトリ関数は「データ構造を作るだけ」であり、独自の
//    計算式・新しい係数を一切追加しない。数値が未確認のフィールドはnullのまま
//    保持する(根拠のない値を勝手に補完しない、という指示に基づく)。
// 3. 唯一の例外として、人体発熱(occupantSensibleWPerPerson/LatentWPerPerson)は
//    「新しい係数」ではなく、既存のOCCUPANT_HEAT(60W/50W、既存の暫定値)を
//    そのまま参照する。新規の数値発明ではない。
// 4. roomToLegacyLoadInput()は「翻訳」のみを行うアダプターであり、計算は
//    一切行わない。最終的な計算は必ず既存のcomputeLoad/selectEquipment/
//    computeAllに委譲する。
// ============================================================================

/**
 * Project(物件) ファクトリ
 * @param {object} p
 */
function createProject(p = {}) {
  return {
    projectId: p.projectId ?? null,
    projectName: p.projectName ?? null,
    regionId: p.regionId ?? null,         // REGIONSのidを参照する想定(既存の地域係数をそのまま利用)
    floors: p.floors ?? 1,                 // 既存のfloors同様、負荷計算そのものには使用しない(表示・配分用)
    targetFloor: p.targetFloor ?? null,    // 対象階(新規。現状は表示・識別用途のみ、計算には未接続)
    totalFloorArea: p.totalFloorArea ?? null, // 延床面積(新規。Room.floorAreaの合計とは別に保持可能)
    airConditionedArea: p.airConditionedArea ?? null, // 空調対象面積(任意)
    operatingHours: p.operatingHours ?? { start: null, end: null },
    marginPct: p.marginPct ?? 0,           // 既存のmarginPctと同じ意味・同じ既定値(0%)
    rooms: [],
  };
}

/**
 * Projectに複数のRoomを登録する(単純な配列管理。計算は行わない)
 */
function addRoomToProject(project, room) {
  project.rooms.push(room);
  return project;
}

/**
 * Envelope(外皮・構造体) ファクトリ。
 * 数値係数(U値等)は根拠未確認のため、指定がない限りすべてnull。
 */
function createEnvelope(e = {}) {
  return {
    wall: e.wall ?? [],           // [{ area, orientation, uValue }] 想定。未指定時は空配列
    roof: e.roof ?? { area: null, uValue: null },
    floor: e.floor ?? { area: null, uValue: null },
    ceiling: e.ceiling ?? { area: null, uValue: null },
    interiorWall: e.interiorWall ?? [], // [{ area, uValue }]
    thermalProperty: e.thermalProperty ?? { note: "構造・断熱区分等は未実装。値はnullのまま。" },
  };
}

/**
 * Window(窓・ガラス) ファクトリ。1室に複数(方位別)持てるよう配列要素として使う想定。
 */
function createWindow(w = {}) {
  return {
    area: w.area ?? null,
    orientation: w.orientation ?? null, // 8方位等の文字列を想定
    glassType: w.glassType ?? null,     // "single" | "double" | "lowE" 等(区分のみ、係数は別途)
    thermalProperty: w.thermalProperty ?? { uValue: null },
    solarProperty: w.solarProperty ?? { scValue: null, etaValue: null },
    shading: w.shading ?? { type: null, present: false },
  };
}

/**
 * InternalHeat(内部発熱) ファクトリ。
 * 人体発熱のみ、既存のOCCUPANT_HEAT(60W/50W、既存の暫定値)を既定値として使用する。
 * 照明・機器・その他は根拠となる原単位が現状存在しないため既定null。
 */
function createInternalHeat(i = {}) {
  return {
    occupantSensibleWPerPerson: i.occupantSensibleWPerPerson ?? OCCUPANT_HEAT.sensibleWPerPerson,
    occupantLatentWPerPerson: i.occupantLatentWPerPerson ?? OCCUPANT_HEAT.latentWPerPerson,
    occupantHeatSource: OCCUPANT_HEAT.source, // 既存の出典情報をそのまま引き継ぐ
    lightingWm2: i.lightingWm2 ?? null,        // 根拠となる原単位未確認のためnull
    equipmentWm2: i.equipmentWm2 ?? null,      // 同上
    otherInternalHeat: i.otherInternalHeat ?? [], // 厨房機器等の積み上げ用、既定は空配列
    schedule: i.schedule ?? null,              // 時刻別スケジュール(第2段階以降)
  };
}

/**
 * OutdoorAirInfiltration(外気・換気・すきま風) ファクトリ。
 * 外気温湿度・熱交換効率等は根拠となる気象データが未接続のためnull。
 */
function createOutdoorAirInfiltration(o = {}) {
  return {
    outdoorAirVolumeM3h: o.outdoorAirVolumeM3h ?? null, // 未指定時は既存ロジック(人数×用途別原単位)側で算出する想定
    ventilationType: o.ventilationType ?? null,          // "type1" | "type2" | "type3" 等
    infiltration: o.infiltration ?? { sashTightness: null, hasExternalDoor: null },
    outdoorTemperature: o.outdoorTemperature ?? { cooling: null, heating: null },
    outdoorHumidity: o.outdoorHumidity ?? { cooling: null, heating: null },
    heatRecovery: o.heatRecovery ?? { enabled: false, efficiency: null },
  };
}

/**
 * Room(室) ファクトリ。
 * volumeはfloorArea×ceilingHeightの単純な自動計算のみ(新しい計算式ではなく幾何学的な定義そのもの)。
 */
function createRoom(r = {}) {
  const floorArea = r.floorArea ?? null;
  const ceilingHeight = r.ceilingHeight ?? null;
  return {
    roomId: r.roomId ?? null,
    roomName: r.roomName ?? null,
    usage: r.usage ?? null,          // BUILDING_TYPESのidを参照する想定
    floorArea,
    ceilingHeight,
    volume: floorArea != null && ceilingHeight != null ? floorArea * ceilingHeight : null,
    indoorTemperature: r.indoorTemperature ?? { cooling: null, heating: null },
    indoorHumidity: r.indoorHumidity ?? { cooling: null, heating: null }, // 現行エンジンは湿度未対応(既存仕様のまま)
    occupancy: r.occupancy ?? null,
    envelope: r.envelope ?? createEnvelope(),
    windows: r.windows ?? [],
    internalHeat: r.internalHeat ?? createInternalHeat(),
    outdoorAir: r.outdoorAir ?? createOutdoorAirInfiltration(),
  };
}

/**
 * 【アダプター】新Room/Projectモデル → 既存computeLoad()入力形式への変換。
 * 計算は一切行わない。既存の入力キー(buildingTypeId等)にそのまま詰め替えるだけ。
 * 未指定の温度はnullのまま既存computeLoad側に渡し、既存のフォールバック処理
 * (Number.isFinite判定→既定値26/22℃)にそのまま委ねる(=ここで新たに26/22という
 * 数値を書かない。既存ロジック側の挙動を1箇所に保つ)。
 */
function roomToLegacyLoadInput(project, room) {
  // 「未指定」(null)と「0℃を明示指定」(数値0)を区別してundefinedに変換する。
  // 既存computeLoad()は Number.isFinite(Number(x)) で有効値判定しており、
  // Number(null)=0(有限)/Number(undefined)=NaN(非有限)という違いがあるため、
  // 「未指定」は必ずundefinedとして渡す(既存側の26℃/22℃フォールバックを
  // このアダプター側で新たに書かず、既存computeLoad自体の挙動にそのまま委ねる)。
  const toLegacyTemp = (v) => (v === null || v === undefined ? undefined : v);

  return {
    buildingTypeId: room.usage,
    regionId: project.regionId,
    floorAreaTotal: room.floorArea,
    floors: project.floors,
    occupants: room.occupancy,
    coolingSetTemp: room.indoorTemperature ? toLegacyTemp(room.indoorTemperature.cooling) : undefined,
    heatingSetTemp: room.indoorTemperature ? toLegacyTemp(room.indoorTemperature.heating) : undefined,
    marginPct: project.marginPct,
    includeOccupantLoad: false, // 既存の既定値と同一。第1段階では変更しない
  };
}

/**
 * 【アダプター経由の計算】新モデルのRoom1件を、既存のcomputeLoad/selectEquipmentに
 * そのまま渡して計算する。新しい計算ロジックは一切含まない(既存関数への委譲のみ)。
 */
function computeRoomLoad(project, room) {
  const legacyInput = roomToLegacyLoadInput(project, room);
  return computeAll(legacyInput); // 既存のcomputeAll(SHARED-LOGICブロック内、不変)をそのまま使用
}

module.exports = {
  BUILDING_TYPES, REGIONS, PACKAGE_SIZES, OCCUPANT_HEAT, EQUIPMENT_DB,
  computeLoad, selectEquipment, computeAll,
  // 【第1段階 追加分】プロ仕様データモデル+アダプター
  createProject, addRoomToProject, createRoom,
  createEnvelope, createWindow, createInternalHeat, createOutdoorAirInfiltration,
  roomToLegacyLoadInput, computeRoomLoad,
};

// ============================================================================
// 244W/m²等の原単位に関する確認結果(2026-09-02)
// ----------------------------------------------------------------------------
// BUILDING_TYPESのcoolingWm2/heatingWm2は、本アプリの開発初期(本セッションの
// 最初のプロトタイプ作成時)に、外部資料を引用せずに設定した「本アプリ独自の
// 概算仮定値」です。特定の公的資料・企業資料から転記した数値ではないため、
// 「人体発熱を含む値かどうか」を確認する外部の原典が存在しません。
// したがって「A:人体発熱を含む」「B:含まない」のいずれかを外部資料と突き合わせて
// 判定することは、今回のセッションでは不可能でした。
// この状態を偽って「Bと判定できた」とはせず、「根拠不明」として扱い、
// 上記のとおり既定では人体負荷を設計用必要負荷に加算しない(=概算負荷を基準とする)
// 設計とし、加算はユーザーの明示的なオプトインによってのみ行われるようにしています。
// ============================================================================
