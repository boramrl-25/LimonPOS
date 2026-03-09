/**
 * Business Day Logic
 * Supports cross-midnight: e.g. Opening 07:00, Closing 01:30 means business day runs from 07:00 to 01:30 next day.
 * Timezone offset (minutes from UTC) is applied to "now" before comparing with opening/closing times.
 */

const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse "HH:mm" to minutes since midnight (0..1439). Returns NaN if invalid.
 */
function parseTimeToMinutes(str) {
  if (typeof str !== "string" || !str.trim()) return NaN;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/**
 * Get offset in ms for timezone (e.g. 180 = GMT+3)
 */
function getOffsetMs(offsetMinutes) {
  return (offsetMinutes || 0) * 60 * 1000;
}

/**
 * Get "local" midnight timestamp for a given UTC timestamp in the store's timezone.
 * Returns start of calendar day in local time, expressed as UTC ms.
 */
function getLocalMidnightFor(utcTs, offsetMinutes) {
  const dayMs = 24 * 60 * 60 * 1000;
  const localMs = utcTs + getOffsetMs(offsetMinutes);
  const localDayStart = Math.floor(localMs / dayMs) * dayMs;
  return localDayStart - getOffsetMs(offsetMinutes);
}

/**
 * Get business day range { startTs, endTs } for a given timestamp.
 * Cross-midnight: if closingMinutes < openingMinutes, day ends next calendar day.
 * @param {number} nowUtc - UTC timestamp (ms)
 * @param {string} openingTime - "HH:mm"
 * @param {string} closingTime - "HH:mm"
 * @param {number} offsetMinutes - timezone offset (e.g. 180 for GMT+3)
 */
function getBusinessDayRange(nowUtc, openingTime, closingTime, offsetMinutes = 0) {
  const openMin = parseTimeToMinutes(openingTime);
  const closeMin = parseTimeToMinutes(closingTime);
  if (isNaN(openMin) || isNaN(closeMin)) return null;

  const localMidnight = getLocalMidnightFor(nowUtc, offsetMinutes);
  const dayMs = 24 * 60 * 60 * 1000;

  const startTs = localMidnight + openMin * 60 * 1000;
  let endTs;

  if (closeMin <= openMin) {
    // Cross-midnight: closing is next day
    endTs = localMidnight + dayMs + closeMin * 60 * 1000;
  } else {
    endTs = localMidnight + closeMin * 60 * 1000;
  }

  const localNow = nowUtc + getOffsetMs(offsetMinutes);
  const localDayStartMs = Math.floor(localNow / dayMs) * dayMs;
  const localDayStartUtc = localDayStartMs - getOffsetMs(offsetMinutes);
  const minutesSinceMidnight = ((localNow - localDayStartMs) / (60 * 1000) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  let rangeStart = localDayStartUtc + openMin * 60 * 1000;
  let rangeEnd = closeMin <= openMin
    ? localDayStartUtc + dayMs + closeMin * 60 * 1000
    : localDayStartUtc + closeMin * 60 * 1000;

  if (closeMin <= openMin && nowUtc < rangeStart) {
    if (minutesSinceMidnight >= closeMin && minutesSinceMidnight < openMin) {
      rangeStart = localDayStartUtc + closeMin * 60 * 1000;
      rangeEnd = localDayStartUtc + dayMs + closeMin * 60 * 1000;
    } else {
      rangeStart = localDayStartUtc - dayMs + openMin * 60 * 1000;
      rangeEnd = localDayStartUtc + closeMin * 60 * 1000;
    }
  }

  return { startTs: rangeStart, endTs: rangeEnd };
}

/**
 * Get a stable key for the business day containing the given timestamp.
 * Format: "YYYY-MM-DD" of the calendar day when the business day OPENS.
 * E.g. Opening 07:00, Closing 01:30: business day opening 2026-03-07 07:00 has key "2026-03-07".
 */
function getBusinessDayKey(nowUtc, openingTime, closingTime, offsetMinutes = 0) {
  const range = getBusinessDayRange(nowUtc, openingTime, closingTime, offsetMinutes);
  if (!range) return null;
  const d = new Date(range.startTs + getOffsetMs(offsetMinutes));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Check if timestamp is within the current business day.
 */
function isWithinBusinessDay(nowUtc, openingTime, closingTime, offsetMinutes = 0) {
  const range = getBusinessDayRange(nowUtc, openingTime, closingTime, offsetMinutes);
  if (!range) return false;
  return nowUtc >= range.startTs && nowUtc < range.endTs;
}

/**
 * Get minutes since local midnight (0–1439). Uses same logic as isInAutoCloseWindow.
 */
function getMinutesSinceLocalMidnight(nowUtc, offsetMinutes = 0) {
  const dayMs = 24 * 60 * 60 * 1000;
  const localNow = nowUtc + getOffsetMs(offsetMinutes);
  return Math.floor((((localNow % dayMs) + dayMs) % dayMs) / (60 * 1000));
}

/**
 * Check if we are at or past the warning time within the current business day.
 * Warning time is compared as "local time" - e.g. 01:00 means when local clock hits 01:00.
 * Only true when within business day AND local time >= warning time.
 */
function isAfterWarningTime(nowUtc, warningTime, openingTime, closingTime, offsetMinutes = 0) {
  const range = getBusinessDayRange(nowUtc, openingTime, closingTime, offsetMinutes);
  if (!range) return false;
  if (nowUtc < range.startTs || nowUtc >= range.endTs) return false;

  const warnMin = parseTimeToMinutes(warningTime);
  if (isNaN(warnMin)) return false;

  const minutesSinceMidnight = getMinutesSinceLocalMidnight(nowUtc, offsetMinutes);
  return minutesSinceMidnight >= warnMin;
}

/**
 * Get business day range for a calendar date (YYYY-MM-DD).
 * Returns the business day that contains noon of that date in local time.
 */
function getBusinessDayRangeForDate(dateStr, openingTime, closingTime, offsetMinutes = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const localNoon = Date.UTC(y, mo, d, 12, 0, 0) - getOffsetMs(offsetMinutes);
  return getBusinessDayRange(localNoon, openingTime, closingTime, offsetMinutes);
}

/**
 * Check if we're in the auto-close window: past (closing + grace) and before opening.
 * Used to auto-close open tables. Window: [closingTime + graceMinutes, openingTime).
 * @param {number} nowUtc - UTC timestamp (ms)
 * @param {string} closingTime - "HH:mm"
 * @param {string} openingTime - "HH:mm"
 * @param {number} graceMinutes - 0-60
 * @param {number} offsetMinutes - timezone offset (e.g. 240 for UAE GMT+4)
 */
function isInAutoCloseWindow(nowUtc, closingTime, openingTime, graceMinutes, offsetMinutes = 0) {
  const closeMin = parseTimeToMinutes(closingTime);
  const openMin = parseTimeToMinutes(openingTime);
  if (isNaN(closeMin) || isNaN(openMin)) return false;

  const minutesSinceMidnight = getMinutesSinceLocalMidnight(nowUtc, offsetMinutes);

  const grace = Math.min(60, Math.max(0, graceMinutes || 0));
  const threshold = closeMin + grace;

  if (closeMin <= openMin) {
    return minutesSinceMidnight >= threshold && minutesSinceMidnight < openMin;
  }
  return minutesSinceMidnight >= threshold;
}

/**
 * Get the business day key for the day we're closing when in auto-close window.
 * Cross-midnight (e.g. 07:00–01:30): when we're in [01:30, 07:00), the closed day opened on the previous calendar day.
 * Same-day (e.g. 09:00–17:00): the closed day opened today.
 */
function getClosedBusinessDayKeyForAutoClose(nowUtc, openingTime, closingTime, offsetMinutes = 0) {
  const closeMin = parseTimeToMinutes(closingTime);
  const openMin = parseTimeToMinutes(openingTime);
  if (isNaN(closeMin) || isNaN(openMin)) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const localNow = nowUtc + getOffsetMs(offsetMinutes);
  const localDayStartMs = Math.floor(localNow / dayMs) * dayMs;
  const minutesSinceMidnight = getMinutesSinceLocalMidnight(nowUtc, offsetMinutes);

  const isCrossMidnight = closeMin <= openMin;
  const isInGap = isCrossMidnight && minutesSinceMidnight >= closeMin && minutesSinceMidnight < openMin;
  const dayStartMs = isInGap ? localDayStartMs - dayMs : localDayStartMs;

  const d = new Date(dayStartMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get all business day ranges that overlap a calendar date range [dateFrom, dateTo].
 * Used for report date ranges.
 */
function getBusinessDayRangesForDateRange(dateFromStr, dateToStr, openingTime, closingTime, offsetMinutes = 0) {
  const ranges = [];
  const from = new Date(dateFromStr + "T00:00:00Z");
  const to = new Date(dateToStr + "T23:59:59Z");
  const openMin = parseTimeToMinutes(openingTime);
  const closeMin = parseTimeToMinutes(closingTime);
  if (isNaN(openMin) || isNaN(closeMin)) return ranges;

  const dayMs = 24 * 60 * 60 * 1000;
  let current = new Date(from);
  const seen = new Set();

  while (current <= to) {
    const y = current.getUTCFullYear();
    const mo = current.getUTCMonth();
    const d = current.getUTCDate();
    const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const r = getBusinessDayRangeForDate(dateStr, openingTime, closingTime, offsetMinutes);
    if (r && !seen.has(r.startTs)) {
      seen.add(r.startTs);
      ranges.push(r);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  ranges.sort((a, b) => a.startTs - b.startTs);
  return ranges;
}

export {
  parseTimeToMinutes,
  getBusinessDayRange,
  getBusinessDayKey,
  isWithinBusinessDay,
  isAfterWarningTime,
  isInAutoCloseWindow,
  getClosedBusinessDayKeyForAutoClose,
  getBusinessDayRangeForDate,
  getBusinessDayRangesForDateRange,
  getLocalMidnightFor,
  getOffsetMs,
};
