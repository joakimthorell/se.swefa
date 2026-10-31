'use strict';

const { Device } = require('homey');
const { getLocale } = require('../../lib/i18n-utils');
const { formatCoordinate } = require('../../lib/weather-utils');
const {
  getLevelRank,
  getWeatherWarningsForPoint,
  isWarningActiveNow,
  localizedOfficialText,
  diffWarnings,
} = require('../../lib/warning-utils');

class WarningDevice extends Device {
  constructor(...args) {
    super(...args);

    this.pollInterval = 30 * 60 * 1000;
    this._refreshPromise = null;
    this._knownWarnings = null;
    this._currentWarnings = [];
  }

  async onInit() {
    this.log('SMHI Weather Warning Device initialized');

    this._flowWarningIssued = this.homey.flow.getDeviceTriggerCard('SmhiWarningIssued');
    this._flowWarningUpdated = this.homey.flow.getDeviceTriggerCard('SmhiWarningUpdated');
    this._flowWarningEnded = this.homey.flow.getDeviceTriggerCard('SmhiWarningEnded');

    await this.refreshWarnings({ resetBaseline: true });

    this._warningInterval = this.homey.setInterval(() => {
      this.refreshWarnings().catch(err => this.error(err));
    }, this.pollInterval);
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys?.length) {
      await this.refreshWarnings({
        settingsOverride: newSettings,
        resetBaseline: true,
      });
    }
  }

  async refreshWarnings({
    settingsOverride = null,
    resetBaseline = false,
  } = {}) {
    if (this._refreshPromise) {
      await this._refreshPromise;
    }

    this._refreshPromise = this._refreshWarnings({
      settingsOverride,
      resetBaseline,
    }).finally(() => {
      this._refreshPromise = null;
    });

    return this._refreshPromise;
  }

  async _refreshWarnings({ settingsOverride, resetBaseline }) {
    try {
      const { longitude, latitude } = this.getCoordinatesFromSettings(settingsOverride);
      const payload = await this.homey.app.getSmhiWarnings();
      const warnings = getWeatherWarningsForPoint(payload, longitude, latitude);

      await this.updateCapabilities(warnings);
      await this.processWarningChanges(warnings, { resetBaseline });

      this._currentWarnings = warnings;
    } catch (error) {
      this.error('Failed to update SMHI weather warnings:', error);
    }
  }

  getCoordinatesFromSettings(settingsOverride = null) {
    const settings = settingsOverride || this.getSettings();

    const longitude = settings.usehomeylocation
      ? this.homey.geolocation.getLongitude()
      : Number.parseFloat(settings.longitude);

    const latitude = settings.usehomeylocation
      ? this.homey.geolocation.getLatitude()
      : Number.parseFloat(settings.latitude);

    return {
      longitude: Number(formatCoordinate(longitude, 'longitude')),
      latitude: Number(formatCoordinate(latitude, 'latitude')),
    };
  }

  getOfficialLanguage() {
    return this.homey.i18n.getLanguage() === 'sv' ? 'sv' : 'en';
  }

  formatDateTime(value) {
    if (!value) return '';

    const date = new Date(value);
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

  getDisplayValues(warnings) {
    const primary = warnings[0] ?? null;

    if (!primary) {
      return {
        status: this.homey.__('smhi_warning_status_none'),
        level: this.homey.__('smhi_warning_level_none'),
        event: '',
        area: '',
        validFrom: '',
        validTo: '',
        count: 0,
        source: 'SMHI',
      };
    }

    const language = this.getOfficialLanguage();

    return {
      status: isWarningActiveNow(primary)
        ? this.homey.__('smhi_warning_status_active')
        : this.homey.__('smhi_warning_status_upcoming'),
      level: localizedOfficialText(primary.level, language),
      event: localizedOfficialText(primary.eventDescription, language)
        || localizedOfficialText(primary.event, language),
      area: localizedOfficialText(primary.areaName, language),
      validFrom: this.formatDateTime(primary.start),
      validTo: this.formatDateTime(primary.end),
      count: warnings.length,
      source: 'SMHI',
    };
  }

  async updateCapabilities(warnings) {
    const values = this.getDisplayValues(warnings);

    await Promise.all([
      this.setCapabilityValue('smhi_warning_status_cp', values.status),
      this.setCapabilityValue('smhi_warning_level_cp', values.level),
      this.setCapabilityValue('smhi_warning_event_cp', values.event),
      this.setCapabilityValue('smhi_warning_area_cp', values.area),
      this.setCapabilityValue('smhi_warning_valid_from_cp', values.validFrom),
      this.setCapabilityValue('smhi_warning_valid_to_cp', values.validTo),
      this.setCapabilityValue('smhi_warning_count_cp', values.count),
      this.setCapabilityValue('smhi_warning_source_cp', values.source),
    ].map(promise => promise.catch(err => this.error(err))));
  }

  async processWarningChanges(warnings, { resetBaseline = false } = {}) {
    if (resetBaseline || this._knownWarnings === null) {
      this._knownWarnings = warnings;
      return;
    }

    const changes = diffWarnings(this._knownWarnings, warnings);

    for (const warning of changes.issued) {
      await this.triggerWarning(this._flowWarningIssued, warning);
    }

    for (const warning of changes.updated) {
      await this.triggerWarning(this._flowWarningUpdated, warning);
    }

    for (const warning of changes.ended) {
      await this.triggerWarning(this._flowWarningEnded, warning);
    }

    this._knownWarnings = warnings;
  }

  async triggerWarning(card, warning) {
    const language = this.getOfficialLanguage();
    const tokens = {
      warning_id: warning.id,
      warning_level: localizedOfficialText(warning.level, language),
      warning_level_code: warning.levelCode,
      warning_event: localizedOfficialText(warning.eventDescription, language)
        || localizedOfficialText(warning.event, language),
      warning_event_code: warning.event?.code ?? '',
      warning_area: localizedOfficialText(warning.areaName, language),
      warning_start: warning.start ?? '',
      warning_end: warning.end ?? '',
      source: 'SMHI',
    };

    await card.trigger(this, tokens, {}).catch(err => this.error(err));
  }

  hasWarning() {
    return this._currentWarnings.length > 0;
  }

  hasActiveWarning() {
    return this._currentWarnings.some(warning => isWarningActiveNow(warning));
  }

  getHighestWarningRank() {
    return this._currentWarnings.reduce(
      (highest, warning) => Math.max(highest, getLevelRank(warning.levelCode)),
      0,
    );
  }

  onDeleted() {
    this.log('SMHI Weather Warning Device deleted');

    if (this._warningInterval) {
      this.homey.clearInterval(this._warningInterval);
      this._warningInterval = null;
    }
  }
}

module.exports = WarningDevice;
