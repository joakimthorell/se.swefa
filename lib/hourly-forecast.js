'use strict';

const { precipitationAmountToHourlyRate, getWeatherEmoji, findClosestForecastPoint } = require('./weather-utils');
const { getLocale } = require('./i18n-utils');

function createLocalPartsFormatter(timeZone) {
  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return date => {
    const values = Object.fromEntries(dateFormat.formatToParts(date).map(p => [p.type, p.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
  };
}

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function isValidSmhiNumber(value) {
  return Number.isFinite(value) && value !== 9999;
}

function formatter(language, missingForecastText) {
  const numberFormat = new Intl.NumberFormat(getLocale(language), { maximumFractionDigits: 1 });
  const number = value => numberFormat.format(value);
  return point => {
    const values = point?.data;
    if (!values || !isValidSmhiNumber(values.air_temperature)) return `—<br>${missingForecastText}`;
    const rain = isValidSmhiNumber(values.precipitation_amount_mean)
      ? number(precipitationAmountToHourlyRate(values.precipitation_amount_mean, point)) : '—';
    const symbol = isValidSmhiNumber(values.symbol_code) ? values.symbol_code : null;
    return `${getWeatherEmoji(symbol)}<br>**${number(values.air_temperature)}°**<br>${rain} mm/h`;
  };
}

function metadata(data, date) {
  if (!data || !Array.isArray(data.timeSeries)) throw new Error('No SMHI hourly forecast available');
  return { date, source: 'SMHI', issued_at: String(data.approvedTime || data.referenceTime || '') };
}

function structuredHour(date, hour, point, time = null) {
  const values = point?.data;
  const available = isValidSmhiNumber(values?.air_temperature);
  return {
    date, hour, time: time || point?.time || null, available,
    temperature: available ? values.air_temperature : null,
    symbol: available && isValidSmhiNumber(values.symbol_code) ? values.symbol_code : null,
    precipitation_mm_per_hour: available && isValidSmhiNumber(values.precipitation_amount_mean)
      ? precipitationAmountToHourlyRate(values.precipitation_amount_mean, point) : null,
  };
}

// Inclusive local hours; an earlier end hour continues into tomorrow.
function getHourlyForecast(data, {
  startHour = 0, endHour = 23, now = new Date(), timeZone, language = 'sv', missingForecastText,
} = {}) {
  if (![startHour, endHour].every(hour => Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    throw new RangeError('Start and end hour must be whole hours between 0 and 23');
  }
  const localParts = createLocalPartsFormatter(timeZone);
  const date = localParts(now).date;
  const result = metadata(data, date);
  const endDate = endHour < startHour ? shiftDate(date, 1) : date;
  result.end_date = endDate;
  const points = new Map();
  for (const point of [...data.timeSeries].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const instant = new Date(point.time);
    if (!Number.isFinite(instant.getTime())) continue;
    const local = localParts(instant);
    const key = `${local.date}/${local.hour}`;
    if (local.minute === 0 && instant.getUTCSeconds() === 0 && !points.has(key)) points.set(key, point);
  }
  for (let hour = 0; hour <= 23; hour += 1) result[`hour_${String(hour).padStart(2, '0')}`] = '';
  const format = formatter(language, missingForecastText);
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

// Hourly slots from the SMHI timestamp nearest to now.
function getRollingHourlyForecast(data, {
  hours = 1, now = new Date(), timeZone, language = 'sv', missingForecastText,
} = {}) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    throw new RangeError('Number of hours must be a whole number between 1 and 24');
  }
  const closest = findClosestForecastPoint(data?.timeSeries, now);
  if (!closest) throw new Error('No SMHI hourly forecast available');
  const start = Date.parse(closest.time);
  const localParts = createLocalPartsFormatter(timeZone);
  const result = metadata(data, localParts(new Date(start)).date);
  const points = new Map(data.timeSeries.map(point => [Date.parse(point.time), point]));
  const format = formatter(language, missingForecastText);
  const selected = [];
  for (let index = 0; index < 24; index += 1) {
    const key = `slot_${String(index + 1).padStart(2, '0')}`;
    if (index >= hours) { result[key] = ''; continue; }
    const instant = new Date(start + index * 3600000);
    const local = localParts(instant);
    const point = points.get(instant.getTime());
    result[key] = `**${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}**<br>${format(point)}`;
    selected.push(structuredHour(local.date, local.hour, point, instant.toISOString()));
  }
  result.end_date = selected[selected.length - 1].date;
  result.forecast_json = JSON.stringify(selected);
  return result;
}

module.exports = { getHourlyForecast, getRollingHourlyForecast };
