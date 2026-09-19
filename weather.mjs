// weather.mjs
// 現場周辺の天気予報(施工計画の参考情報)。
//
// 【重要】ここで取得する気象データは「施工日程を検討するための参考情報」であり、
// 空調負荷計算には一切使用しない。設計用外気条件(拡張アメダス気象データ等)は
// 未接続であり、本モジュールの値を負荷計算に流用しない。
// データ提供: Open-Meteo (https://open-meteo.com/) APIキー不要・商用利用可のフリーAPI。

// 地域区分ごとの代表都市(緯度経度は地理的事実。計算には使用しない)
export const REGION_CITIES = {
  hokkaido: { city: "札幌", latitude: 43.06, longitude: 141.35 },
  tohoku: { city: "仙台", latitude: 38.27, longitude: 140.87 },
  kanto: { city: "東京", latitude: 35.69, longitude: 139.69 },
  chubu: { city: "名古屋", latitude: 35.18, longitude: 136.91 },
  kansai: { city: "大阪", latitude: 34.69, longitude: 135.5 },
  chugoku_shikoku: { city: "広島", latitude: 34.39, longitude: 132.46 },
  kyushu: { city: "福岡", latitude: 33.59, longitude: 130.4 },
  okinawa: { city: "那覇", latitude: 26.21, longitude: 127.68 },
};

// WMO Weather interpretation codes (Open-Meteo 公式ドキュメントの区分)
const WEATHER_CODE_LABELS = [
  { codes: [0], label: "快晴" },
  { codes: [1, 2], label: "晴れ時々くもり" },
  { codes: [3], label: "くもり" },
  { codes: [45, 48], label: "霧" },
  { codes: [51, 53, 55, 56, 57], label: "霧雨" },
  { codes: [61, 63, 65, 66, 67], label: "雨" },
  { codes: [71, 73, 75, 77], label: "雪" },
  { codes: [80, 81, 82], label: "にわか雨" },
  { codes: [85, 86], label: "にわか雪" },
  { codes: [95, 96, 99], label: "雷雨" },
];

export function weatherCodeLabel(code) {
  const hit = WEATHER_CODE_LABELS.find((entry) => entry.codes.includes(Number(code)));
  return hit ? hit.label : "―";
}

export function cityForRegion(regionId) {
  return REGION_CITIES[regionId] || REGION_CITIES.kanto;
}

export function buildForecastUrl({ latitude, longitude }, days = 5) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Tokyo",
    forecast_days: String(days),
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function parseForecast(payload) {
  const daily = payload && payload.daily;
  if (!daily || !Array.isArray(daily.time)) return [];
  return daily.time.map((date, i) => ({
    date,
    label: weatherCodeLabel(daily.weather_code?.[i]),
    maxC: daily.temperature_2m_max?.[i] ?? null,
    minC: daily.temperature_2m_min?.[i] ?? null,
    precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
  }));
}

export async function fetchForecast(regionId, fetchImpl = globalThis.fetch) {
  const city = cityForRegion(regionId);
  const response = await fetchImpl(buildForecastUrl(city));
  if (!response.ok) throw new Error(`天気予報の取得に失敗しました (HTTP ${response.status})`);
  return { city: city.city, days: parseForecast(await response.json()) };
}

export function formatForecastDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!match) return iso;
  const [, year, month, day] = match;
  // 実行環境のタイムゾーンに依存しないよう、日付文字列をそのままUTCとして解釈する。
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${weekday})`;
}
