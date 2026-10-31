# SMHI Weather Forecast, Warnings, Fire Risk & Ocean Observations for Homey

Weather forecasts, official weather warnings, fire-risk forecasts and ocean observations from SMHI for Homey. Weather forecasts use **SNOW1gv1**, warnings use SMHI's official impact-based warning feed, fire risk uses the daily **FWIF1G** point forecast, and sea-level/wave devices use SMHI Oceanographic Observations.

## Features

- Create multiple weather devices with independent settings.
- Use Homey's geolocation or a custom latitude/longitude.
- Select forecast offsets from **now up to 36 hours**.
- Weather, temperature and feels-like temperature.
- Wind direction, wind speed and gust speed.
- Relative humidity, air pressure and visibility.
- Thunderstorm probability.
- Total, low, medium and high cloud cover.
- Precipitation type and precipitation statistics.
- Flow triggers for weather changes and selected sensor changes.
- Flow conditions for weather, temperature, wind, cloud cover and precipitation.
- Forecast-oriented conditions such as rain, maximum wind speed and minimum temperature within the next hours.
- A separate **SMHI Weather Warnings** device for official Yellow, Orange and Red warnings at the configured location.
- Warning Flow triggers for issued, updated and ended warnings, plus conditions for current warning state and severity.
- A separate **SMHI Fire Risk** device with daily forest fire risk, grass fire risk and forest fuel dryness forecasts from today through five days ahead.
- Fire-risk Flow triggers for class changes and conditions for minimum risk/dryness levels.
- Separate **SMHI Sea Level** and **SMHI Waves** devices bound to named SMHI ocean observation stations.
- Sea-level RH2000, observation age/quality, significant and maximum wave height, wave period and wave direction where available.
- Ocean Flow cards for sea-level threshold crossings and wave-height thresholds.

The app is intended for locations within SMHI's SNOW forecast area and is primarily presented for Sweden, Norway, Denmark and Finland.

## Weather warnings

v0.9.0 adds a separate **SMHI Weather Warnings** device. It matches the configured/Homey coordinates against SMHI's actual GeoJSON warning areas and exposes the highest-priority matching warning, validity period, warning area, warning count and SMHI as the source.

The driver intentionally handles official **Yellow, Orange and Red** weather warnings. SMHI `MESSAGE` entries are excluded from this device. Official warning text is shown from SMHI without machine translation or rewriting.

## Fire risk

v0.10.0 adds a separate **SMHI Fire Risk** device using SMHI's daily FWIF1G point forecast. It keeps three SMHI concepts separate: **forest fire risk**, **grass fire risk** and **forest fuel dryness**.

The device supports today through five days ahead, Homey's geolocation or custom coordinates, and displays the source approval time. Forest fire risk and forest fuel dryness preserve SMHI's **1–5E** presentation; API class `6` is displayed as `5E`. Missing/off-season model values are not treated as low risk.

If a reliable forecast cannot be obtained for the selected location/day, the device becomes unavailable rather than presenting stale data as current.

**Fire risk is a forecast, not an official fire ban.** Users must follow fire bans and restrictions issued by the responsible authorities.

## Sea level and waves

v0.11.0 adds two station-based ocean observation devices:

- **SMHI Sea Level** — measured sea level in RH2000 from a selected SMHI/Sjöfartsverket station, including observation time, age, quality and source.
- **SMHI Waves** — measured significant wave height from a selected wave buoy/station, with maximum wave height, mean period and wave direction when those measurements are available at the same station.

Pairing lists actual stations rather than silently choosing a nearby station. The station ID is the Homey device identity, and the station name/owner are shown on the device.

Sea Level reads the latest RH2000 minute observations and allows normal publication latency before declaring data stale. Waves requires a recent significant-wave-height measurement; optional wave fields may be absent without making the device unavailable.

Wave direction prefers SMHI's mean direction when fresh and falls back to direction at Tp/peak wave energy when that is the current direction series for the buoy. The displayed compass direction follows SMHI's convention: the direction **from which** the waves come.

## Flow cards

Existing Flow card IDs and capability IDs are preserved for backwards compatibility. v0.8.0 also adds:

- **Weather changes to ...**
- **Weather changes from ... to ...**
- Forecast conditions for rain, maximum wind speed and minimum temperature in the coming hours.
- A **Severe weather condition** trigger based on forecast symbols. This is an app-level condition and **not an official SMHI weather warning**.

## Important upgrade note for v0.8.0

v0.8.0 corrects several interpretation problems introduced during the v0.7.0 migration to SNOW1gv1, including wind heading and precipitation classification.

If you changed a Flow to compensate for incorrect values in v0.7.0, review that Flow after upgrading. For example, a wind direction that was previously shown with the wrong compass heading is now mapped correctly.

## Data source and update behavior

Weather data is fetched from SMHI's SNOW1gv1 point forecast API. Each device refreshes automatically and also refreshes immediately when its forecast time or location settings change.

Transient API/network failures are retried. If a fetch fails completely, the app keeps the last successfully received capability values and logs the error.

## Dependency policy

The app has **zero third-party runtime dependencies**. Network access uses Node's built-in HTTPS module and the feels-like calculation is implemented locally with regression tests.

`package-lock.json` is intentionally kept even with zero dependencies so CI can verify the dependency graph deterministically. `.npmrc` uses `save-exact=true` so any future dependency must be added explicitly and pinned.

## Development

Before switching branches or starting a new test cycle, verify that the local working tree is clean:

```bash
npm run clean-check
```

Then prepare npm metadata and run the regression tests:

```bash
npm ci
npm test
```

Run the app on a connected Homey:

```bash
homey app run
```

## Feedback

- Community discussion: [Swedish Weather Forecast](https://community.athom.com/t/swedish-weather-forecast/)
- Bugs and feature requests: [GitHub Issues](https://github.com/JohanBendz/se.swefa/issues)

## Change log

### v0.11.0

- Added separate **SMHI Sea Level** and **SMHI Waves** devices.
- Pairing uses named active ocean observation stations and wave buoys.
- Sea Level exposes measured RH2000 level, station, observation time/age, quality and source.
- Waves exposes significant and maximum wave height, mean wave period and wave direction where supported.
- Wave direction falls back from mean direction to direction at Tp/peak energy when needed.
- Added Flow triggers for sea-level threshold crossings and wave-height threshold crossings.
- Added corresponding conditions for current sea level and wave height.
- Added freshness handling so stale primary measurements make the relevant device unavailable.
- Added dedicated ocean, sea-level and wave icons plus regression coverage for station selection, observation age and direction fallback.

### v0.10.0

- Added a separate **SMHI Fire Risk** device.
- Daily forecasts for today through five days ahead.
- Shows forest fire risk, grass fire risk and forest fuel dryness as separate SMHI model outputs.
- Preserves SMHI's 1–5E presentation for forest fire risk and fuel dryness.
- Added Flow triggers when a fire-risk/dryness class changes to a selected level.
- Added Flow conditions for minimum forest-fire risk, grass-fire risk and forest dryness.
- Added point-response caching, source freshness validation and safe unavailable handling when reliable data is missing.
- Added dedicated fire-risk icons and regression tests.
- Fire-risk forecasts are explicitly kept separate from official fire bans.

### v0.9.0

- Added a separate **SMHI Weather Warnings** device.
- Matches locations against SMHI GeoJSON warning polygons, including marine warning areas.
- Supports official Yellow, Orange and Red warning levels.
- Shows warning status, level, event, area, validity period, count and source.
- Added Flow triggers for warning issued, updated and ended.
- Added Flow conditions for warning present, active now and minimum warning level.
- Added shared warning-feed caching and regression tests for geometry and state transitions.
- Added dedicated warning icons.
- Added `npm run clean-check` to prevent branch/test work from starting with a dirty working tree.

### v0.8.1

- Removed all third-party runtime dependencies.
- Replaced `node-fetch` with Node's built-in HTTPS module.
- Replaced `feels` with a local implementation that preserves the previous formulas and outputs.
- Added regression coverage for feels-like calculations and a CI guard enforcing zero runtime dependencies.
- Updated to npm lockfile version 3 and added exact-version policy for any future dependencies.

### v0.8.0

- Stabilized the SNOW1gv1 migration.
- Corrected wind direction headings and precipitation type handling.
- Corrected cloud-cover handling.
- Fixed forecast settings being applied one change late.
- Completed previously declared forecast Flow conditions and severe-weather trigger.
- Added weather changed-to and changed-from/to triggers.
- Improved retry, timeout, timer and timezone handling.
- Added regression tests and GitHub Actions CI.
- Removed committed dependencies from the repository.
- **Compatibility note:** Flows created to compensate for incorrect v0.7.0 wind headings or precipitation classification may need review.

### v0.7.0

- Migrated the weather backend from the retired PMP3gv2 API to SMHI SNOW1gv1.

### Earlier releases

See the Git history and Homey changelog for older release notes.

## Hourly forecast Flow actions

Two weather-device actions expose the cached SMHI forecast for dashboard displays and other flows:

* **Get hourly forecast for a time interval** accepts start and end clock hours (00–23), both inclusive. The interval starts on the current local calendar date. An earlier end hour means the next day: 22–02 selects 22, 23, 00, 01 and 02. Equal start/end selects one hour; 00–23 selects a full day. The default interval is 00–23.
* **Get hourly forecast from now** accepts a count of 1–24 hours, defaulting to one hour. The start point is selected with `findClosestForecastPoint()`, the same helper used for the weather device's forecast: it chooses the available SMHI timestamp nearest to now, before or after it. With points for both 11:00 and 12:00, ten hours at 11:20 selects 11–20, while at 11:40 it selects 12–21. If only future points are available, the closest future point is used. Equal-distance ties select the first point in SMHI response order (normally the earlier timestamp). This action targets now directly; the device's `fcTime` setting does not offset the window. The start date is the date of the selected first point. Hours continue across midnight. Rolling slots represent successive actual hours, so they distinguish a repeated autumn hour and skip a nonexistent spring hour.

Both actions return the start date, end date, source, issue time and `forecast_json`, an ordered array containing each selected hour's local date, hour, UTC timestamp, availability and numeric weather values. The fixed-interval action also returns `hour_00` through `hour_23` text tokens (unselected hours are empty). The rolling action returns `slot_01` through `slot_24` text tokens, each including its clock-hour label; slots beyond the requested count are empty. Fixed clock-hour tokens use the earliest available point when multiple timestamps share the same local clock hour. Rolling text labels preserve the actual local minutes, including time zones with half-hour or quarter-hour offsets.

Hourly text contains a weather symbol, temperature and mean precipitation intensity (mm/h), formatted as Markdown/HTML line breaks for dashboard text widgets. Labels and number formatting follow Homey's English, Swedish or Norwegian language setting.

Selection matches the SMHI point's `time` exactly. Points are never moved to the start of their precipitation interval or reused for missing hours. For example, a point with `time` 11:00 and `intervalParametersStartTime` 10:00 is displayed at 11:00: the temperature is valid at 11:00, while precipitation covers 10:00–11:00. Past hours and the ongoing hour may be absent from the latest response; selected missing hours show an unavailable label. The fixed interval retains its requested clock hours; the rolling window starts at the nearest available forecast timestamp and then advances in exact one-hour steps. Missing later slots are not filled with neighbouring points. If the response contains no valid forecast timestamps, the rolling action fails with an unavailable-forecast error.

Each JSON entry includes `time`, the UTC timestamp of the selected forecast point. For missing data, fixed entries use null while rolling entries retain the slot timestamp. Rolling slots preserve distinct occurrences of repeated local hours and use actual elapsed time across clock changes.

Both Flow cards are introduced by this contribution. The fixed-interval card defaults to 00–23. Time selection is independent of dashboard layout. No extra service or API credentials are required.
