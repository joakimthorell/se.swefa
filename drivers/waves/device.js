'use strict';

const { Device } = require('homey');
const { getLocale } = require('../../lib/i18n-utils');
const {
  latestObservation,
  waveDirectionCandidates,
  compassDirection,
} = require('../../lib/ocean-utils');
const { WIND_DIRECTION_CODES } = require('../../lib/weather-utils');

const WAVE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

class WavesDevice extends Device {
  constructor(...args) {
    super(...args);

    this.pollInterval = 30 * 60 * 1000;
    this._refreshPromise = null;
    this._current = null;
  }

  async onInit() {
    this.log('SMHI Waves Device initialized');

    this._significantCrossedAbove = this.homey.flow
      .getDeviceTriggerCard('SignificantWaveHeightCrossedAbove');
    this._maximumCrossedAbove = this.homey.flow
      .getDeviceTriggerCard('MaximumWaveHeightCrossedAbove');

    await this.refreshWaves({ resetBaseline: true });

    this._wavesInterval = this.homey.setInterval(() => {
      this.refreshWaves().catch(err => this.error(err));
    }, this.pollInterval);
  }

  async refreshWaves({ resetBaseline = false } = {}) {
    if (this._refreshPromise) {
      await this._refreshPromise;
    }

    this._refreshPromise = this._refreshWaves({ resetBaseline }).finally(() => {
      this._refreshPromise = null;
    });

    return this._refreshPromise;
  }

  async _refreshWaves({ resetBaseline }) {
    try {
      const station = this.getStation();
      const significantPayload = await this.homey.app.getOcobsObservation(
        'significantWaveHeight',
        station.id,
        'latest-day',
      );
      const significant = latestObservation(significantPayload, {
        maxAgeMs: WAVE_MAX_AGE_MS,
      });

      if (!significant) {
        throw new Error('No sufficiently recent significant wave-height observation');
      }

      const [maximum, direction, period] = await Promise.all([
        this.optionalObservation('maximumWaveHeight', station.supportsMaximumWaveHeight),
        this.waveDirectionObservation(),
        this.optionalObservation('meanWavePeriod', station.supportsMeanWavePeriod),
      ]);

      const current = {
        significant,
        maximum,
        direction,
        period,
      };

      await this.updateCapabilities(station, current);

      if (!resetBaseline && this._current) {
        await this.processChanges(station, this._current, current);
      }

      this._current = current;
      await this.setAvailable();
    } catch (error) {
      this.error('Failed to update SMHI waves:', error);
      await this.setUnavailable('No recent SMHI wave observation').catch(err => this.error(err));
    }
  }

  async waveDirectionObservation() {
    const stationId = this.getStation().id;

    try {
      const [meanStations, peakStations] = await Promise.all([
        this.homey.app.getOcobsStations('meanWaveDirection'),
        this.homey.app.getOcobsStations('peakWaveDirection'),
      ]);

      for (const name of waveDirectionCandidates(stationId, meanStations, peakStations)) {
        const payload = await this.homey.app.getOcobsObservation(name, stationId, 'latest-day');
        const observation = latestObservation(payload, { maxAgeMs: WAVE_MAX_AGE_MS });

        if (observation) {
          return {
            ...observation,
            parameter: name,
          };
        }
      }
    } catch (error) {
      this.error('Unable to update wave direction:', error);
    }

    return null;
  }

  async optionalObservation(name, supported) {
    if (!supported) return null;

    try {
      const payload = await this.homey.app.getOcobsObservation(name, this.getStation().id, 'latest-day');
      return latestObservation(payload, { maxAgeMs: WAVE_MAX_AGE_MS });
    } catch (error) {
      this.error(`Unable to update optional wave parameter ${name}:`, error);
      return null;
    }
  }

  getStation() {
    return {
      id: String(this.getStoreValue('stationId') ?? ''),
      name: String(this.getStoreValue('stationName') ?? ''),
      owner: String(this.getStoreValue('stationOwner') ?? ''),
      supportsMaximumWaveHeight: Boolean(this.getStoreValue('supportsMaximumWaveHeight')),
      supportsMeanWavePeriod: Boolean(this.getStoreValue('supportsMeanWavePeriod')),
    };
  }

  stationLabel(station) {
    return station.owner ? `${station.name} (${station.owner})` : station.name;
  }

  qualityLabel(code) {
    const key = {
      G: 'ocean_quality_g',
      Y: 'ocean_quality_y',
      O: 'ocean_quality_o',
    }[String(code ?? '').toUpperCase()];

    return key ? this.homey.__(key) : String(code ?? '');
  }

  directionLabel(angle) {
    const code = compassDirection(angle);
    const index = WIND_DIRECTION_CODES.indexOf(code);

    return index >= 0 ? this.homey.__(`direction${index + 1}`) : '';
  }

  formatDateTime(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';

    const locale = getLocale(this.homey.i18n.getLanguage());

    return new Intl.DateTimeFormat(locale, {
      timeZone: this.homey.clock.getTimezone(),
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  async updateCapabilities(station, current) {
    await Promise.all([
      this.setCapabilityValue('significant_wave_height_cp', current.significant.value),
      this.setCapabilityValue('maximum_wave_height_cp', current.maximum?.value ?? null),
      this.setCapabilityValue('mean_wave_period_cp', current.period?.value ?? null),
      this.setCapabilityValue('mean_wave_direction_cp', current.direction?.value ?? null),
      this.setCapabilityValue(
        'mean_wave_direction_heading_cp',
        current.direction ? this.directionLabel(current.direction.value) : '',
      ),
      this.setCapabilityValue('ocean_station_cp', this.stationLabel(station)),
      this.setCapabilityValue('ocean_observed_at_cp', this.formatDateTime(current.significant.date)),
      this.setCapabilityValue('ocean_observation_age_cp', current.significant.ageMinutes),
      this.setCapabilityValue('ocean_quality_cp', this.qualityLabel(current.significant.quality)),
      this.setCapabilityValue('ocean_source_cp', 'SMHI Open Data'),
    ].map(promise => promise.catch(err => this.error(err))));
  }

  async processChanges(station, previous, current) {
    await Promise.all([
      this.processHeightChange(
        this._significantCrossedAbove,
        station,
        previous.significant,
        current.significant,
      ),
      this.processHeightChange(
        this._maximumCrossedAbove,
        station,
        previous.maximum,
        current.maximum,
      ),
    ]);
  }

  async processHeightChange(card, station, previous, current) {
    if (!previous || !current) return;
    if (previous.date === current.date && previous.value === current.value) return;

    const tokens = {
      wave_height: current.value,
      previous_wave_height: previous.value,
      station: this.stationLabel(station),
      observed_at: this.formatDateTime(current.date),
      quality: this.qualityLabel(current.quality),
      source: 'SMHI Open Data',
    };

    await card.trigger(this, tokens, {
      previous: previous.value,
      current: current.value,
    }).catch(err => this.error(err));
  }

  isSignificantWaveHeightAbove(threshold) {
    if (!this._current?.significant) return false;
    return this._current.significant.value > Number(threshold);
  }

  isMaximumWaveHeightAbove(threshold) {
    if (!this._current?.maximum) return false;
    return this._current.maximum.value > Number(threshold);
  }

  onDeleted() {
    if (this._wavesInterval) {
      this.homey.clearInterval(this._wavesInterval);
      this._wavesInterval = null;
    }
  }
}

module.exports = WavesDevice;
