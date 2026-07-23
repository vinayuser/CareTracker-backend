/**
 * Schedule timezone helpers — wall-clock times ↔ UTC instants.
 * Uses Intl only (no luxon/moment dependency).
 */

const pad2 = (n) => String(n).padStart(2, '0');

/** Common IANA zones for agency scheduling dropdowns */
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET) — America/New_York' },
  { value: 'America/Chicago', label: 'Central Time (CT) — America/Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (MT) — America/Denver' },
  { value: 'America/Phoenix', label: 'Arizona (MST) — America/Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) — America/Los_Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time — America/Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time — Pacific/Honolulu' },
  { value: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico) — America/Puerto_Rico' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kolkata', label: 'India (IST) — Asia/Kolkata' },
  { value: 'Europe/London', label: 'UK (GMT/BST) — Europe/London' },
  { value: 'Europe/Paris', label: 'Central Europe — Europe/Paris' },
];

const DEFAULT_TIMEZONE = 'America/New_York';

const addDaysToDateKey = (dateKey, days) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
};

const dateKeyInZone = (date = new Date(), timeZone = DEFAULT_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date instanceof Date ? date : new Date(date));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Convert wall-clock YYYY-MM-DD + HH:mm in `timeZone` to a UTC Date.
 */
const zonedTimeToUtc = (dateKey, hhmm, timeZone = DEFAULT_TIMEZONE) => {
  const tz = timeZone || DEFAULT_TIMEZONE;
  const [y, mo, d] = String(dateKey).split('-').map(Number);
  const [hh, mm] = String(hhmm || '00:00').split(':').map((x) => Number(x) || 0);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const getParts = (ms) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
    };
  };

  let utcMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const got = getParts(utcMs);
    const desiredAsUtc = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
    const gotAsUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second || 0);
    const diff = desiredAsUtc - gotAsUtc;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
};

/** Weekday short name (Mon…Sun) for a calendar date in a timezone */
const weekdayShortInZone = (dateKey, timeZone = DEFAULT_TIMEZONE) => {
  const noon = zonedTimeToUtc(dateKey, '12:00', timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || DEFAULT_TIMEZONE,
    weekday: 'short',
  }).format(noon);
};

module.exports = {
  TIMEZONES,
  DEFAULT_TIMEZONE,
  pad2,
  addDaysToDateKey,
  dateKeyInZone,
  zonedTimeToUtc,
  weekdayShortInZone,
};
