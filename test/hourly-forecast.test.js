'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getHourlyForecast, getRollingHourlyForecast } = require('../lib/hourly-forecast');
const getDaytimeForecast = (data, now, timeZone = 'Europe/Stockholm', language = 'sv') =>
  getHourlyForecast(data, { startHour: 7, endHour: 17, now, timeZone, language });
const point = (time, temp = 10) => ({ time, data: { air_temperature: temp, precipitation_amount_mean: 0, symbol_code: 1 } });

test('emits exactly eleven local hours, excludes neighbouring days and outside hours', () => {
  const series = Array.from({ length: 48 }, (_, n) => point(new Date(Date.UTC(2026, 9, 23, n)).toISOString(), n));
  const result = getDaytimeForecast({ timeSeries: series }, new Date('2026-10-24T04:00:00Z'));
  assert.equal(result.date, '2026-10-24');
  assert.equal(Object.keys(result).filter(k => k.startsWith('hour_') && result[k] !== '').length, 11);
  assert.equal(result.hour_06, '');
  assert.equal(result.hour_18, '');
  assert.match(result.hour_07, /29°/);
  assert.match(result.hour_17, /39°/);
});

test('matches local hour across daylight-saving change and year boundary', () => {
  for (const [now, instant, expected] of [
    ['2026-10-25T04:00:00Z', '2026-10-25T06:00:00Z', '2026-10-25'],
    ['2026-03-29T04:00:00Z', '2026-03-29T05:00:00Z', '2026-03-29'],
    ['2026-12-31T23:30:00Z', '2027-01-01T06:00:00Z', '2027-01-01'],
  ]) {
    const result = getDaytimeForecast({ timeSeries: [point(instant)] }, new Date(now));
    assert.equal(result.date, expected);
    assert.match(result.hour_07, /10°/);
    assert.match(result.hour_08, /Prognos saknas/);
  }
});

test('does not invent missing weather or precipitation', () => {
  const result = getDaytimeForecast({ timeSeries: [{ time: '2026-10-24T05:00:00Z', data: { air_temperature: 0 } }] }, new Date('2026-10-24T04:00:00Z'));
  assert.match(result.hour_07, /0°/);
  assert.match(result.hour_07, /— mm\/h/);
  assert.match(result.hour_08, /Prognos saknas/);
});

test('uses Homey language for missing-data labels and number formatting', () => {
  const data = { timeSeries: [point('2026-10-24T05:00:00Z', 10.5)] };
  const result = getDaytimeForecast(data, new Date('2026-10-24T04:00:00Z'), 'Europe/Stockholm', 'en');
  assert.match(result.hour_07, /10\.5°/);
  assert.match(result.hour_08, /No forecast/);
});

test('does not label a half-hour forecast as an exact local hour', () => {
  const result = getDaytimeForecast({ timeSeries: [point('2026-10-24T02:00:00Z')] }, new Date('2026-10-24T00:00:00Z'), 'Asia/Kolkata');
  assert.match(result.hour_07, /Prognos saknas/);
});


test('supports a custom evening interval including both endpoints', () => {
  const series = Array.from({ length: 48 }, (_, n) => point(new Date(Date.UTC(2026, 9, 24, n)).toISOString(), n));
  const result = getHourlyForecast({ timeSeries: series }, { startHour: 18, endHour: 23, now: new Date('2026-10-24T04:00:00Z') });
  assert.equal(result.hour_17, '');
  assert.match(result.hour_18, /16°/);
  assert.match(result.hour_23, /21°/);
  assert.equal(result.hour_00, '');
});

test('supports a full day and a single-hour interval', () => {
  const series = Array.from({ length: 48 }, (_, n) => point(new Date(Date.UTC(2026, 9, 23, n)).toISOString(), n));
  const data = { timeSeries: series };
  const now = new Date('2026-10-24T04:00:00Z');
  const full = getHourlyForecast(data, { startHour: 0, endHour: 23, now });
  assert.equal(Object.keys(full).filter(k => k.startsWith('hour_') && full[k] !== '').length, 24);
  const one = getHourlyForecast(data, { startHour: 12, endHour: 12, now });
  assert.equal(Object.keys(one).filter(k => k.startsWith('hour_') && one[k] !== '').length, 1);
  assert.match(one.hour_12, /34°/);
});

test('rejects invalid clock-hour arguments', () => {
  for (const [startHour, endHour] of [[-1, 17], [7, 24], [7.5, 17], [7, NaN], ['7', 17]]) {
    assert.throws(() => getHourlyForecast({ timeSeries: [] }, { startHour, endHour }), RangeError);
  }
});


test('fixed overnight intervals use tomorrow after midnight, including year rollover', () => {
  const data = { timeSeries: [point('2026-12-31T21:00:00Z', 1), point('2026-12-31T23:00:00Z', 2), point('2027-01-01T01:00:00Z', 3), point('2026-12-31T01:00:00Z', 99)] };
  const result = getHourlyForecast(data, { startHour: 22, endHour: 2, now: new Date('2026-12-31T06:00:00Z') });
  const entries = JSON.parse(result.forecast_json);
  assert.deepEqual(entries.map(p => p.hour), [22, 23, 0, 1, 2]);
  assert.equal(result.end_date, '2027-01-01');
  assert.match(result.hour_00, /2°/);
  assert.match(result.hour_02, /3°/);
  assert.equal(result.hour_03, '');
  assert.equal(entries.find(p => p.hour === 2).date, '2027-01-01');
});

test('rolling eleven-hour forecast changes from 07–17 to 08–18 on the hour', () => {
  const data = { timeSeries: [] };
  for (const [instant, first, last] of [['2026-10-24T05:59:59Z', 7, 17], ['2026-10-24T06:00:00Z', 8, 18]]) {
    const result = getRollingHourlyForecast(data, { now: new Date(instant), hours: 11 });
    const entries = JSON.parse(result.forecast_json);
    assert.equal(entries.length, 11);
    assert.equal(entries[0].hour, first);
    assert.equal(entries[10].hour, last);
    assert.equal(result.slot_12, '');
    assert.match(result.slot_01, new RegExp(String(first).padStart(2, '0') + ':00'));
  }
});

test('rolling forecasts preserve order and correct dates across midnight', () => {
  const data = { timeSeries: [point('2026-10-24T22:00:00Z', 8)] };
  const result = getRollingHourlyForecast(data, { now: new Date('2026-10-24T20:15:00Z'), hours: 5 });
  const entries = JSON.parse(result.forecast_json);
  assert.deepEqual(entries.map(p => p.hour), [22, 23, 0, 1, 2]);
  assert.equal(entries[0].date, '2026-10-24');
  assert.equal(entries[2].date, '2026-10-25');
  assert.equal(entries[2].temperature, 8);
});

test('rolling slots distinguish a repeated autumn hour and skip the spring clock gap', () => {
  const data = { timeSeries: [] };
  const autumn = JSON.parse(getRollingHourlyForecast(data, { now: new Date('2026-10-25T00:30:00Z'), hours: 3 }).forecast_json);
  assert.deepEqual(autumn.map(p => p.hour), [2, 2, 3]);
  assert.notEqual(autumn[0].time, autumn[1].time);
  const spring = JSON.parse(getRollingHourlyForecast(data, { now: new Date('2026-03-29T00:30:00Z'), hours: 3 }).forecast_json);
  assert.deepEqual(spring.map(p => p.hour), [1, 3, 4]);
});

test('rolling forecasts support one to twenty-four hours and reject invalid counts', () => {
  for (const hours of [1, 24]) {
    const result = getRollingHourlyForecast({ timeSeries: [] }, { hours });
    assert.equal(JSON.parse(result.forecast_json).length, hours);
  }
  for (const hours of [0, 25, -1, 1.5, '11', NaN]) {
    assert.throws(() => getRollingHourlyForecast({ timeSeries: [] }, { hours }), RangeError);
  }
});

for (const mode of ['fixed', 'rolling']) {
  const forecast = (values, intervalStart = undefined) => {
    const data = { timeSeries: [{
      time: '2026-10-24T05:00:00Z', intervalParametersStartTime: intervalStart,
      data: { air_temperature: 0, precipitation_amount_mean: 0, symbol_code: 1, ...values },
    }] };
    const options = { now: new Date('2026-10-24T05:30:00Z') };
    const result = mode === 'fixed'
      ? getHourlyForecast(data, { ...options, startHour: 7, endHour: 7 })
      : getRollingHourlyForecast(data, { ...options, hours: 1 });
    return {
      text: result[mode === 'fixed' ? 'hour_07' : 'slot_01'],
      hour: JSON.parse(result.forecast_json)[0],
    };
  };

  test(`${mode}: missing temperature sentinel makes the hour unavailable`, () => {
    const { text, hour } = forecast({ air_temperature: 9999 });
    assert.match(text, /Prognos saknas/);
    assert.doesNotMatch(text, /9999/);
    assert.equal(hour.available, false);
    assert.equal(hour.temperature, null);
    assert.equal(hour.symbol, null);
    assert.equal(hour.precipitation_mm_per_hour, null);
  });

  test(`${mode}: missing precipitation sentinel is rejected before rate conversion`, () => {
    const { text, hour } = forecast({ precipitation_amount_mean: 9999 }, '2026-10-24T03:00:00Z');
    assert.match(text, /— mm\/h/);
    assert.doesNotMatch(text, /9999|4999/);
    assert.equal(hour.available, true);
    assert.equal(hour.temperature, 0);
    assert.equal(hour.symbol, 1);
    assert.equal(hour.precipitation_mm_per_hour, null);
  });

  test(`${mode}: missing symbol sentinel is not exposed as an observation`, () => {
    const { text, hour } = forecast({ symbol_code: 9999 });
    assert.match(text, /—<br>\*\*0°\*\*/);
    assert.doesNotMatch(text, /9999|☀️/);
    assert.equal(hour.available, true);
    assert.equal(hour.temperature, 0);
    assert.equal(hour.symbol, null);
    assert.equal(hour.precipitation_mm_per_hour, 0);
  });

  test(`${mode}: valid zero temperature and precipitation remain available`, () => {
    const { text, hour } = forecast({});
    assert.match(text, /☀️<br>\*\*0°\*\*<br>0 mm\/h/);
    assert.equal(hour.available, true);
    assert.equal(hour.temperature, 0);
    assert.equal(hour.precipitation_mm_per_hour, 0);
  });
}


test('defaults to a full fixed day and one rolling hour', () => {
  const options = { now: new Date('2026-10-24T05:30:00Z') };
  const fixed = JSON.parse(getHourlyForecast({ timeSeries: [] }, options).forecast_json);
  assert.deepEqual(fixed.map(entry => entry.hour), Array.from({ length: 24 }, (_, hour) => hour));
  const rolling = getRollingHourlyForecast({ timeSeries: [] }, options);
  assert.deepEqual(JSON.parse(rolling.forecast_json).map(entry => entry.hour), [7]);
  assert.equal(rolling.slot_02, '');
});
