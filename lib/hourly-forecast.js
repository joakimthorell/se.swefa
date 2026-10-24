'use strict';

const { precipitationAmountToHourlyRate } = require('./weather-utils');

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

function weatherIcon(code) {
  const n = Number(code);
  if (n === 1) return '☀️';
  if (n === 2) return '🌤️';
  if (n === 3 || n === 4) return '⛅';
  if (n === 5 || n === 6) return '☁️';
  if (n === 7) return '🌫️';
  if (n === 11 || n === 21) return '⛈️';
  if ([12, 13, 14, 22, 23, 24].includes(n)) return '🌨️';
  if ([15, 16, 17, 25, 26, 27].includes(n)) return '❄️';
  if ([8, 9, 10, 18, 19, 20].includes(n)) return '🌧️';
  return '—';
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function formatter(language) {
  const locale = language === 'sv' ? 'sv-SE' : language === 'no' ? 'nb-NO' : 'en-GB';
  const missing = language === 'sv' ? 'Prognos saknas' : language === 'no' ? 'Ingen prognose' : 'No forecast';
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return point => {
    const values = point?.data;
    if (!values || !Number.isFinite(values.air_temperature)) return `—<br>${missing}`;
    const rain = Number.isFinite(values.precipitation_amount_mean)
      ? number(precipitationAmountToHourlyRate(values.precipitation_amount_mean, point)) : '—';
    return `${weatherIcon(values.symbol_code)}<br>**${number(values.air_temperature)}°**<br>${rain} mm/h`;
  };
}

function metadata(data, date) {
  if (!data || !Array.isArray(data.timeSeries)) throw new Error('No SMHI hourly forecast available');
  return { date, source: 'SMHI', issued_at: String(data.approvedTime || data.referenceTime || '') };
}

function structuredHour(date, hour, point, time = null) {
  const values = point?.data;
  const available = Number.isFinite(values?.air_temperature);
  return {
    date, hour, time: time || point?.time || null, available,
    temperature: available ? values.air_temperature : null,
    symbol: available && Number.isFinite(values.symbol_code) ? values.symbol_code : null,
    precipitation_mm_per_hour: available && Number.isFinite(values.precipitation_amount_mean)
      ? precipitationAmountToHourlyRate(values.precipitation_amount_mean, point) : null,
  };
}

// Fixed local clock interval, inclusive at both ends. An earlier end hour means tomorrow.
// Missing hours never borrow a point from another hour/date. On an autumn repeated
// clock hour, hour_HH is the first occurrence; rolling slots distinguish both occurrences.
function getHourlyForecast(data, {
  startHour = 7, endHour = 17, now = new Date(), timeZone = 'Europe/Stockholm', language = 'sv',
} = {}) {
  if (![startHour, endHour].every(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    throw new RangeError('Start and end hour must be whole hours between 0 and 23');
  }
  const date = localParts(now, timeZone).date;
  const result = metadata(data, date);
  const endDate = endHour < startHour ? shiftDate(date, 1) : date;
  result.end_date = endDate;
  const points = new Map();
  for (const point of [...data.timeSeries].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const instant = new Date(point.time);
    if (!Number.isFinite(instant.getTime())) continue;
    const local = localParts(instant, timeZone);
    const key = `${local.date}/${local.hour}`;
    if (local.minute === 0 && instant.getUTCSeconds() === 0 && !points.has(key)) points.set(key, point);
  }
  for (let hour = 0; hour <= 23; hour += 1) result[`hour_${String(hour).padStart(2, '0')}`] = '';
  const format = formatter(language);
  const hours = [];
  const count = (endHour - startHour + 24) % 24 + 1;
  for (let offset = 0; offset < count; offset += 1) {
    const hour = (startHour + offset) % 24;
    const pointDate = startHour + offset >= 24 ? endDate : date;
    const point = points.get(`${pointDate}/${hour}`);
    result[`hour_${String(hour).padStart(2, '0')}`] = format(point);
    hours.push(structuredHour(pointDate, hour, point));
  }
  result.forecast_json = JSON.stringify(hours);
  return result;
}

// Count actual successive hours from the beginning of the current local hour.
// UTC instants keep rolling slots correct when a local hour repeats or is skipped.
function getRollingHourlyForecast(data, {
  hours = 11, now = new Date(), timeZone = 'Europe/Stockholm', language = 'sv',
} = {}) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    throw new RangeError('Number of hours must be a whole number between 1 and 24');
  }
  const localNow = localParts(now, timeZone);
  const result = metadata(data, localNow.date);
  const start = now.getTime() - localNow.minute * 60000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
  const points = new Map(data.timeSeries.map(point => [Date.parse(point.time), point]));
  const format = formatter(language);
  const selected = [];
  for (let index = 0; index < 24; index += 1) {
    const key = `slot_${String(index + 1).padStart(2, '0')}`;
    if (index >= hours) { result[key] = ''; continue; }
    const instant = new Date(start + index * 3600000);
    const local = localParts(instant, timeZone);
    const point = points.get(instant.getTime());
    result[key] = `**${String(local.hour).padStart(2, '0')}:00**<br>${format(point)}`;
    selected.push(structuredHour(local.date, local.hour, point, instant.toISOString()));
  }
  result.end_date = selected[selected.length - 1].date;
  result.forecast_json = JSON.stringify(selected);
  return result;
}

module.exports = { getHourlyForecast, getRollingHourlyForecast };
