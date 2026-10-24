'use strict';

const { Driver } = require('homey');
const { isAbove } = require('../../lib/weather-utils');

class WeatherDriver extends Driver {
  async onInit() {
    this.log('SMHI weather driver initiated');
    this.registerFlowTriggers();
    this.registerFlowConditions();
    this.registerFlowActions();
  }

  registerFlowTriggers() {
    this.homey.flow
      .getDeviceTriggerCard('WeatherSituationChangedTo')
      .registerRunListener(async ({ weather_situation_condition }, state) => {
        return state?.toCode === weather_situation_condition;
      });

    this.homey.flow
      .getDeviceTriggerCard('WeatherSituationChangedFromTo')
      .registerRunListener(async ({ from_weather_situation, to_weather_situation }, state) => {
        return state?.fromCode === from_weather_situation && state?.toCode === to_weather_situation;
      });
  }

  registerFlowActions() {
    this.homey.flow.getActionCard('get_rolling_hourly_forecast')
      .registerRunListener(async ({ device, hours = 11 }) => device.getRollingHourlyForecast(hours));
    this.homey.flow.getActionCard('get_daytime_hourly_forecast')
      .registerRunListener(async ({ device, start_hour = 7, end_hour = 17 }) => {
        return device.getHourlyForecast(start_hour, end_hour);
      });
  }

  registerFlowConditions() {
    this.homey.flow
      .getConditionCard('will_rain_in_next_hours')
      .registerRunListener(async ({ device, hours }) => device.willItRainInNextHours(hours));

    this.homey.flow
      .getConditionCard('max_wind_speed_exceeds')
      .registerRunListener(async ({ device, windSpeed, hours }) => {
        const maximum = await device.getMaxWindSpeedInNextHours(hours);
        return maximum !== null && isAbove(maximum, windSpeed);
      });

    this.homey.flow
      .getConditionCard('min_temperature_below')
      .registerRunListener(async ({ device, temperature, hours }) => {
        const minimum = await device.getMinTemperatureInNextHours(hours);
        return minimum !== null && isAbove(temperature, minimum);
      });

    this.homey.flow
      .getConditionCard('will_rain_within_hours')
      .registerRunListener(async ({ device, hours }) => device.willItPrecipitateInNextHours(hours));

    this.homey.flow
      .getConditionCard('measure_weather_situation_cp')
      .registerRunListener(async ({ device, weather_situation_condition }) => {
        return device.matchesWeatherCondition(weather_situation_condition);
      });

    this.homey.flow
      .getConditionCard('measure_air_temperature_cp')
      .registerRunListener(async ({ device, degree }) => {
        return isAbove(device.getCapabilityValue('measure_air_temperature_cp'), degree);
      });

    this.homey.flow
      .getConditionCard('measure_wind_speed_cp')
      .registerRunListener(async ({ device, mps }) => {
        return isAbove(device.getCapabilityValue('measure_wind_speed_cp'), mps);
      });

    this.homey.flow
      .getConditionCard('measure_wind_direction_heading_cp')
      .registerRunListener(async ({ device, direction }) => {
        return device.matchesWindDirection(direction);
      });

    this.homey.flow
      .getConditionCard('measure_wind_direction_cp')
      .registerRunListener(async ({ device, degree }) => {
        return isAbove(device.getCapabilityValue('measure_wind_direction_cp'), degree);
      });

    this.homey.flow
      .getConditionCard('measure_relative_humidity_cp')
      .registerRunListener(async ({ device, percent }) => {
        return isAbove(device.getCapabilityValue('measure_relative_humidity_cp'), percent);
      });

    this.homey.flow
      .getConditionCard('measure_air_pressure_cp')
      .registerRunListener(async ({ device, hpa }) => {
        return isAbove(device.getCapabilityValue('measure_air_pressure_cp'), hpa);
      });

    this.homey.flow
      .getConditionCard('measure_thunder_probability_cp')
      .registerRunListener(async ({ device, percent }) => {
        return isAbove(device.getCapabilityValue('measure_thunder_probability_cp'), percent);
      });

    for (const id of [
      'mean_value_of_total_cloud_cover_cp',
      'mean_value_of_low_level_cloud_cover_cp',
      'mean_value_of_medium_level_cloud_cover_cp',
      'mean_value_of_high_level_cloud_cover_cp',
    ]) {
      this.homey.flow
        .getConditionCard(id)
        .registerRunListener(async ({ device, octas }) => {
          return isAbove(device.getCapabilityValue(id), octas);
        });
    }

    this.homey.flow
      .getConditionCard('wind_gust_speed_cp')
      .registerRunListener(async ({ device, mps }) => {
        return isAbove(device.getCapabilityValue('wind_gust_speed_cp'), mps);
      });

    this.homey.flow
      .getConditionCard('horizontal_visibility_cp')
      .registerRunListener(async ({ device, km }) => {
        return isAbove(device.getCapabilityValue('horizontal_visibility_cp'), km);
      });

    this.homey.flow
      .getConditionCard('measure_precipitation_situation_cp')
      .registerRunListener(async ({ device, precipitation }) => {
        return device.matchesPrecipitation(precipitation);
      });

    this.homey.flow
      .getConditionCard('mean_precipitation_intensity_cp')
      .registerRunListener(async ({ device, mmh }) => {
        return isAbove(device.getCapabilityValue('mean_precipitation_intensity_cp'), mmh);
      });
  }

  async onPairListDevices() {
    return [
      {
        name: 'SMHI weather',
        data: { id: guid() },
        settings: {
          fcTime: '0',
          latitude: '',
          longitude: '',
          usehomeylocation: true,
        },
      },
    ];
  }
}

module.exports = WeatherDriver;

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}
