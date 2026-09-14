import assert from "node:assert/strict";
import { buildForecastUrl, cityForRegion, fetchForecast, formatForecastDate, parseForecast, weatherCodeLabel } from "./weather.mjs";

assert.equal(cityForRegion("okinawa").city, "那覇");
assert.equal(cityForRegion("unknown").city, "東京");

const url = buildForecastUrl(cityForRegion("kanto"));
assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
assert.ok(url.includes("timezone=Asia%2FTokyo"));
assert.ok(url.includes("temperature_2m_max"));

assert.equal(weatherCodeLabel(0), "快晴");
assert.equal(weatherCodeLabel(65), "雨");
assert.equal(weatherCodeLabel(1234), "―");

const days = parseForecast({
  daily: {
    time: ["2026-09-15", "2026-09-16"],
    weather_code: [0, 61],
    temperature_2m_max: [30.1, 26.8],
    temperature_2m_min: [22.4, 20.2],
    precipitation_probability_max: [0, 80],
  },
});
assert.equal(days.length, 2);
assert.deepEqual(days[1], { date: "2026-09-16", label: "雨", maxC: 26.8, minC: 20.2, precipitationProbability: 80 });
assert.deepEqual(parseForecast({}), []);
assert.deepEqual(parseForecast(null), []);

assert.equal(formatForecastDate("2026-09-15"), "9/15(火)");
assert.equal(formatForecastDate("不正な日付"), "不正な日付");

const stubFetch = async () => ({ ok: true, json: async () => ({ daily: { time: ["2026-09-15"], weather_code: [3], temperature_2m_max: [25], temperature_2m_min: [18], precipitation_probability_max: [10] } }) });
const result = await fetchForecast("kansai", stubFetch);
assert.equal(result.city, "大阪");
assert.equal(result.days[0].label, "くもり");

await assert.rejects(() => fetchForecast("kanto", async () => ({ ok: false, status: 503 })), /503/);

console.log("weather: PASS");
