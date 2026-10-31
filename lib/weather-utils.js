'use strict';

const WEATHER_CONDITION_CODES = Object.freeze([
  'Clearsky',
  'Nearlyclearsky',
  'Variablecloudiness',
  'Halfclearsky',
  'Cloudysky',
  'Overcast',
  'Fog',
  'Lightrainshowers',
  'Moderaterainshowers',
  'Heavyrainshowers',
  'Thunderstorm',
  'Lightsleetshowers',
  'Moderatesleetshowers',
  'Heavysleetshowers',
  'Lightsnowshowers',
  'Moderatesnowshowers',
  'Heavysnowshowers',
  'Lightrain',
  'Moderaterain',
  'Heavyrain',
  'Thunder',
  'Lightsleet',
  'Moderatesleet',
  'Heavysleet',
  'Lightsnowfall',
  'Moderatesnowfall',
  'Heavysnowfall',
]);

const WIND_DIRECTION_CODES = Object.freeze([
  'North',
  'North-East',
  'East',
  'South-East',
  'South',
  'South-West',
  'West',
  'North-West',
]);

const SEVERE_WEATHER_SYMBOLS = new Set([10, 11, 14, 17, 20, 21, 24, 27]);

const RAIN_TYPES = new Set([1, 2, 3, 4, 6, 7, 11, 12]);
const SNOW_TYPES = new Set([4, 5, 6, 7, 8, 9]);

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isAbove(value, threshold) {
  if (!isFiniteNumber(value) || !isFiniteNumber(threshold)) return false;
  return Number(value) > Number(threshold);
}

function formatCoordinate(value, label = 'coordinate') {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return number.toFixed(6);
}

function normalizeOctas(value) {
  if (!isFiniteNumber(value)) return null;
  const octas = Number(value);
  if (octas < 0 || octas > 8) return null;
  return octas;
}

function getWeatherConditionCode(symbolCode) {
  const index = Number(symbolCode) - 1;
  return WEATHER_CONDITION_CODES[index] ?? null;
}

function getWeatherEmoji(code) {
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

function getWindDirectionCode(angle) {
  if (!isFiniteNumber(angle)) return null;
  const normalized = ((Number(angle) % 360) + 360) % 360;
  return WIND_DIRECTION_CODES[Math.round(normalized / 45) % 8];
}

function getPrecipitationTranslationKey(category, amount = 1) {
  const code = Number(category);
  if (!isAbove(amount, 0) || code === 0) return 'precipitation_situation0';

  switch (code) {
    case 1: return 'precipitation_situation3';
    case 2: return 'precipitation_situation10';
    case 3: return 'precipitation_situation5';
    case 4: return 'precipitation_situation2';
    case 5: return 'precipitation_situation1';
    case 6: return 'precipitation_situation2';
    case 7: return 'precipitation_situation2';
    case 8: return 'precipitation_situation8';
    case 9: return 'precipitation_situation9';
    case 10:
    case 13:
    case 14:
      return 'precipitation_situation7';
    case 11: return 'precipitation_situation4';
    case 12: return 'precipitation_situation6';
    default: return 'precipitation_situation';
  }
}

function isPrecipitationMatch(category, selection, amount = 1) {
  if (!isAbove(amount, 0)) return false;

  const code = Number(category);
  if (!Number.isFinite(code) || code <= 0 || code === 255) return false;

  if (selection === 'RainSnow') return true;
  if (selection === 'Rain') return RAIN_TYPES.has(code);
  if (selection === 'Snow') return SNOW_TYPES.has(code);
  return false;
}

function getIntervalHours(dataPoint) {
  const end = new Date(dataPoint?.time).getTime();
  const start = new Date(dataPoint?.intervalParametersStartTime).getTime();
  const hours = (end - start) / 3600000;
  return Number.isFinite(hours) && hours > 0 ? hours : 1;
}

function precipitationAmountToHourlyRate(amount, dataPoint) {
  if (!isFiniteNumber(amount)) return 0;
  return Number(amount) / getIntervalHours(dataPoint);
}

function findClosestForecastPoint(timeSeries, targetTime) {
  if (!Array.isArray(timeSeries) || timeSeries.length === 0) return null;

  const targetMs = new Date(targetTime).getTime();
  if (!Number.isFinite(targetMs)) return null;

  let closest = null;
  let smallestDiff = Infinity;

  for (const point of timeSeries) {
    const pointMs = new Date(point?.time).getTime();
    if (!Number.isFinite(pointMs)) continue;

    const diff = Math.abs(pointMs - targetMs);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = point;
    }
  }

  return closest;
}

function isSevereWeatherSymbol(symbolCode) {
  return SEVERE_WEATHER_SYMBOLS.has(Number(symbolCode));
}

module.exports = {
  WEATHER_CONDITION_CODES,
  WIND_DIRECTION_CODES,
  formatCoordinate,
  normalizeOctas,
  getWeatherConditionCode,
  getWeatherEmoji,
  getWindDirectionCode,
  getPrecipitationTranslationKey,
  isPrecipitationMatch,
  precipitationAmountToHourlyRate,
  findClosestForecastPoint,
  isSevereWeatherSymbol,
  isAbove,
};
