function parseMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isTimeInWindow(currentMinutes: number, startStr: string, endStr: string): boolean {
  const start = parseMinutes(startStr);
  const end = parseMinutes(endStr);
  if (start <= end) {
    return currentMinutes >= start && currentMinutes <= end;
  } else {
    return currentMinutes >= start || currentMinutes <= end;
  }
}

export function isWithinKillzone(now: Date = new Date()): { active: boolean; reason: string } {
  if (process.env.ENABLE_KILLZONE !== 'true') {
    return { active: true, reason: 'killzone_disabled' };
  }

  // Use Turkish Time (TRT, UTC+3)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  let weekday = '';
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  // Handle 24:00 which sometimes parses as 24
  if (hour === 24) hour = 0;

  // Check Weekdays (Mon-Fri)
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  if (isWeekend) {
    return { active: false, reason: 'weekend' };
  }

  const currentMinutes = hour * 60 + minute;

  // Slot 1: 10:00 - 13:00 TRT
  const slot1Start = 10 * 60;
  const slot1End = 13 * 60;

  // Slot 2: 15:30 - 18:30 TRT
  const slot2Start = 15 * 60 + 30;
  const slot2End = 18 * 60 + 30;

  if (currentMinutes >= slot1Start && currentMinutes <= slot1End) {
    return { active: true, reason: 'slot1_10_13' };
  }

  if (currentMinutes >= slot2Start && currentMinutes <= slot2End) {
    return { active: true, reason: 'slot2_1530_1830' };
  }

  return { active: false, reason: 'outside_trading_hours' };
}

export type KillzoneFilterMode = {
  active: boolean;
  reason: string;
  profile: 'PRODUCTION' | 'PVP_ACCELERATION';
  filter: 'ACTIVE' | 'BYPASSED';
};

export function evaluateKillzoneFilter(now: Date = new Date()): KillzoneFilterMode {
  const marketWindow = evaluateHardMarketWindow(now);
  if (!marketWindow.active) {
    return {
      ...marketWindow,
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    };
  }

  if (process.env.ENABLE_PVP_KILLZONE_BYPASS === 'true') {
    return {
      active: true,
      reason: 'pvp_killzone_bypass',
      profile: 'PVP_ACCELERATION',
      filter: 'BYPASSED',
    };
  }

  return {
    ...isWithinKillzone(now),
    profile: 'PRODUCTION',
    filter: 'ACTIVE',
  };
}

/**
 * Non-bypassable market closure. PVP acceleration may relax intraday
 * killzones, but it must never create Friday-close/weekend/Monday-pre-open
 * notifications from stale or synthetic candles.
 */
export function evaluateHardMarketWindow(now: Date = new Date()): { active: boolean; reason: string } {
  const newYork = zonedParts(now, 'America/New_York');
  if (newYork.weekday === 'Fri' && newYork.hour >= 17) {
    return { active: false, reason: 'friday_new_york_closed' };
  }
  if (newYork.weekday === 'Sat' || newYork.weekday === 'Sun') {
    return { active: false, reason: 'weekend_market_closed' };
  }

  const london = zonedParts(now, 'Europe/London');
  if (london.weekday === 'Mon' && london.hour < 8) {
    return { active: false, reason: 'monday_before_london_open' };
  }

  return { active: true, reason: 'market_window_open' };
}

function zonedParts(now: Date, timeZone: string): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const parsedHour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  return { weekday, hour: parsedHour === 24 ? 0 : parsedHour };
}
