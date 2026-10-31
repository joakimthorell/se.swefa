'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function actionListeners() {
  const filename = path.join(__dirname, '../drivers/weather/driver.js');
  const localRequire = createRequire(filename);
  const context = {
    module: { exports: {} },
    require: name => name === 'homey' ? { Driver: class {} } : localRequire(name),
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const driver = new context.module.exports();
  const listeners = new Map();
  driver.homey = { flow: { getActionCard: id => ({
    registerRunListener: listener => listeners.set(id, listener),
  }) } };
  driver.registerFlowActions();
  return listeners;
}

test('fixed Flow action defaults match the full-day manifest defaults', async () => {
  const manifest = require('../drivers/weather/driver.flow.compose.json');
  const card = manifest.actions.find(card => card.id === 'get_daytime_hourly_forecast');
  const expected = ['start_hour', 'end_hour'].map(name => card.args.find(arg => arg.name === name).default);
  let received;
  const result = await actionListeners().get(card.id)({ device: {
    getHourlyForecast: (...hours) => { received = hours; return { forecast_json: '[]' }; },
  } });
  assert.deepEqual(received, expected);
  assert.deepEqual(received, [0, 23]);
  assert.deepEqual(result, { forecast_json: '[]' });
});

test('fixed Flow action forwards explicit hours, including midnight', async () => {
  let received;
  await actionListeners().get('get_daytime_hourly_forecast')({
    start_hour: 22, end_hour: 0,
    device: { getHourlyForecast: (...hours) => { received = hours; } },
  });
  assert.deepEqual(received, [22, 0]);
});
