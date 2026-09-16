// report-taxonomy.mjs
// 帳票の区分(設計条件9帳票・チェックリスト6帳票)を定義する。
// ここに新しい数値・係数は置かない。すべて detailed レポートの既存値を
// 帳票の区分へ割り付けるだけ。
// 区分の考え方は「建築設備設計基準 令和6年版」第4編第1章第2節の
// 設計条件(屋内条件・屋外条件・外皮・内部発熱・換気・すきま風・運転)に対応する。

const val = (v) => (v === null || v === undefined ? "" : v);
// breakdown の値は "16.4 kW" のように単位付き文字列のため、数値部分だけ取り出す
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// breakdown の並び: 12項目 → 顕熱合計 → 潜熱合計 → 全熱合計
const peakOf = (d, idx) => {
  const rows = d?.breakdown || [];
  const row = rows[rows.length - 4 + idx];
  return row ? num(row[1]) : null;
};
// 集計値のキーは階層で異なる(byRoom は coolingKW / bySystem・byFloor・building は
// designLoadCoolingKW)。どちらでも読めるようにして、0 への取りこぼしを防ぐ。
const aggCooling = (x) => Number(x?.designLoadCoolingKW ?? x?.coolingKW ?? 0) || 0;
const aggHeating = (x) => Number(x?.designLoadHeatingKW ?? x?.heatingKW ?? 0) || 0;
const kw = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));

/** 設計条件9帳票。 */
export const REPORT_R6_SEQUENCE = [
  {
    sheet: "設計条件1 室内条件",
    rows: (d) => [
      ["冷房 室内乾球温度(℃)", val(d?.conditionsEcho?.coolingSetTempC)],
      ["冷房 室内相対湿度(%)", val(d?.conditionsEcho?.indoorRHCooling)],
      ["暖房 室内乾球温度(℃)", val(d?.conditionsEcho?.heatingSetTempC)],
      ["暖房 室内相対湿度(%)", val(d?.conditionsEcho?.indoorRHHeating)],
      ["用途", val(d?.conditionsEcho?.usage)],
    ],
  },
  {
    sheet: "設計条件2 屋外条件",
    rows: (d) => [
      ["冷房 設計外気温度(℃)", val(d?.conditionsEcho?.regionCoolingDB)],
      ["冷房 設計外気相対湿度(%)", val(d?.conditionsEcho?.regionCoolingRH)],
      ["暖房 設計外気温度(℃)", val(d?.conditionsEcho?.heatingOutdoorDB)],
      ["時刻別 外気温度(℃)", (d?.hourlyResults || []).map((h) => `${h.hour}時 ${val(h.outdoorDB)}`).join(" / ")],
      ["時刻別 外気相対湿度(%)", (d?.hourlyResults || []).map((h) => `${h.hour}時 ${val(h.outdoorRH)}`).join(" / ")],
    ],
  },
  {
    sheet: "設計条件3 外皮(壁・屋根・床)",
    rows: (d) => [
      ["外壁 面積合計(m²)", val(d?.areasEcho?.wallAreaM2)],
      ["屋根 面積(m²)", val(d?.areasEcho?.roofAreaM2)],
      ["床 面積(m²)", val(d?.areasEcho?.floorAreaM2)],
      ["設計用地中温度(℃)", val(d?.areasEcho?.groundTemperatureC)],
      ["内壁 面積合計(m²)", val(d?.areasEcho?.interiorWallAreaM2)],
      ["内壁 温度差(K)", val(d?.areasEcho?.interiorDeltaTK)],
    ],
  },
  {
    sheet: "設計条件4 開口部(ガラス面)",
    rows: (d) => [
      ["ガラス面積合計(m²)", val(d?.areasEcho?.windowAreaM2)],
      ["熱貫流率U値(W/m²K)", val(d?.areasEcho?.windowUValue)],
      ["遮蔽係数SC", val(d?.areasEcho?.windowScValue)],
      ["日射遮蔽率(庇・ルーバー)", val(d?.areasEcho?.windowShadeRatio)],
    ],
  },
  {
    sheet: "設計条件5 内部発熱(人体・照明・機器)",
    rows: (d) => [
      ["在室人数(人)", val(d?.conditionsEcho?.occupants)],
      ["人体 顕熱(W/人)", val(d?.conditionsEcho?.occupantSensibleWPerPerson)],
      ["人体 潜熱(W/人)", val(d?.conditionsEcho?.occupantLatentWPerPerson)],
      ["照明原単位(W/m²)", val(d?.conditionsEcho?.lightingWm2)],
      ["機器原単位(W/m²)", val(d?.conditionsEcho?.equipmentWm2)],
      ["その他の室内負荷(件数)", val(d?.conditionsEcho?.othersCount)],
    ],
  },
  {
    sheet: "設計条件6 換気・外気",
    rows: (d) => [
      ["外気量(m³/h)", val(d?.conditionsEcho?.outdoorAirVolumeM3h)],
      ["一人当たり外気量(m³/h・人)", val(d?.conditionsEcho?.perPersonVentilationM3h)],
      ["全熱交換器", d?.conditionsEcho?.heatRecoveryEnabled ? "有" : "無"],
      ["全熱交換効率(%)", val(d?.conditionsEcho?.recoveryEfficiencyPct)],
    ],
  },
  {
    sheet: "設計条件7 すきま風",
    rows: (d) => [
      ["方式", d?.conditionsEcho?.infiltrationMethod === "unit_leakage" ? "単位すきま風量法" : (d?.conditionsEcho?.infiltrationMethod === "air_change" ? "換気回数法" : val(d?.conditionsEcho?.infiltrationMethod))],
      ["風上側", d?.conditionsEcho?.windwardSide ? "該当" : "非該当"],
      ["夏期 換気回数(回/h)", val(d?.conditionsEcho?.airChangeRateCooling)],
      ["冬期 換気回数(回/h)", val(d?.conditionsEcho?.airChangeRateHeating)],
      ["すきま風量(m³/h)", val(d?.infiltrationVolumeM3h)],
    ],
  },
  {
    sheet: "設計条件8 加湿・排水",
    rows: (d) => [
      ["加湿の有無", d?.conditionsEcho?.humidification ? "有" : "無"],
      ["加湿量 相当負荷(kW)", kw(d?.heatingBreakdown?.humidificationKW)],
      ["排水からの負荷(kW)", kw(d?.breakdown?.drainageKW)],
    ],
  },
  {
    sheet: "設計条件9 ダクト・配管・空気漏洩",
    rows: (d) => [
      ["送風機(kW)", val(d?.conditionsEcho?.systemLoss?.fanKW)],
      ["ダクト・配管表面(kW)", val(d?.conditionsEcho?.systemLoss?.ductSurfaceKW)],
      ["空気漏洩(kW)", val(d?.conditionsEcho?.systemLoss?.airLeakageKW)],
      ["間欠空調による蓄熱(kW)", val(d?.conditionsEcho?.systemLoss?.thermalStorageKW)],
      ["合計(kW)", kw(d?.breakdown?.systemLossKW)],
    ],
  },
];

/** チェックリスト6帳票。未確認事項を隠さず出力する。 */
export const CHECKLIST_ITEMS = [
  {
    sheet: "チェックリスト1 入力の網羅",
    rows: ({ detailed }) => [
      ["必須入力の未入力件数", (detailed?.notVerified || []).length],
      ["未入力・要確認の内容", (detailed?.notVerified || []).join(" / ")],
    ],
  },
  {
    sheet: "チェックリスト2 基準値の適用",
    rows: ({ detailed }) => [
      ["基準値・外部データを使用した項目数", (detailed?.defaultedFromR6 || []).length],
      ["内容", (detailed?.defaultedFromR6 || []).join(" / ")],
    ],
  },
  {
    sheet: "チェックリスト3 係数の出典",
    rows: ({ detailed }) => [
      ["出典の数", (detailed?.coefficientSources || []).length],
      // detailed-report は [キー, 名称, ページ, URL, 確認日] の順で1行にまとめている。
      ...((detailed?.coefficientSources || []).map((row, i) => [`出典${i + 1}`, [row[1], row[2], row[3], row[4]].filter((v) => v && v !== "―").join(" ")])),
    ],
  },
  {
    sheet: "チェックリスト4 負荷項目の網羅",
    rows: ({ detailed }) => [
      ...((detailed?.coolingItems || []).map((row) => [`冷房項目${row[0]}`, `${row[1]} ${row[2]}`])),
      ...((detailed?.heatingItems || []).map((row) => [`暖房項目${row[0]}`, `${row[1]} ${row[2]}`])),
    ],
  },
  {
    sheet: "チェックリスト5 内外の整合(顕熱+潜熱=全熱)",
    rows: ({ detailed }) => [
      ["冷房 顕熱(kW)", kw(peakOf(detailed, 1))],
      ["冷房 潜熱(kW)", kw(peakOf(detailed, 2))],
      ["冷房 全熱(kW)", kw(peakOf(detailed, 3))],
      ["内訳合計 との差(kW)", kw(
        (detailed?.breakdown || []).slice(0, 12).reduce((a, row) => a + num(row[1]), 0) - (peakOf(detailed, 3) || 0)
      )],
    ],
  },
  {
    sheet: "チェックリスト6 集計の整合(室→系統→階→建物)",
    rows: ({ aggregate }) => [
      ["室の合計 冷房(kW)", kw((aggregate?.byRoom || []).reduce((a, x) => a + aggCooling(x), 0))],
      ["系統の合計 冷房(kW)", kw((aggregate?.bySystem || []).reduce((a, x) => a + aggCooling(x), 0))],
      ["階の合計 冷房(kW)", kw((aggregate?.byFloor || []).reduce((a, x) => a + aggCooling(x), 0))],
      ["建物 冷房(kW)", kw(aggCooling(aggregate?.building))],
      ["室の合計 暖房(kW)", kw((aggregate?.byRoom || []).reduce((a, x) => a + aggHeating(x), 0))],
      ["系統の合計 暖房(kW)", kw((aggregate?.bySystem || []).reduce((a, x) => a + aggHeating(x), 0))],
      ["階の合計 暖房(kW)", kw((aggregate?.byFloor || []).reduce((a, x) => a + aggHeating(x), 0))],
      ["建物 暖房(kW)", kw(aggHeating(aggregate?.building))],
    ],
  },
];
