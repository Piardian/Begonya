import { evaluateKillzoneFilter, isWithinKillzone } from '../server/killzone';

describe('Killzone Filtering System (TRT / UTC+3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should return active: true if ENABLE_KILLZONE is false or unset', () => {
    process.env.ENABLE_KILLZONE = 'false';
    let kz = isWithinKillzone(new Date('2026-07-06T12:00:00+03:00')); // Monday
    expect(kz).toEqual({ active: true, reason: 'killzone_disabled' });

    delete process.env.ENABLE_KILLZONE;
    kz = isWithinKillzone(new Date('2026-07-06T12:00:00+03:00')); // Monday
    expect(kz).toEqual({ active: true, reason: 'killzone_disabled' });
  });

  test('should return active: false with reason weekend on Saturday and Sunday', () => {
    process.env.ENABLE_KILLZONE = 'true';
    
    // 2026-07-11 is a Saturday
    let kz = isWithinKillzone(new Date('2026-07-11T12:00:00+03:00'));
    expect(kz).toEqual({ active: false, reason: 'weekend' });

    // 2026-07-12 is a Sunday
    kz = isWithinKillzone(new Date('2026-07-12T12:00:00+03:00'));
    expect(kz).toEqual({ active: false, reason: 'weekend' });
  });

  test('should return active: true in slot 1 (10:00 - 13:00 TRT) on weekdays', () => {
    process.env.ENABLE_KILLZONE = 'true';
    // 2026-07-06 is a Monday
    
    // Exactly 10:00 TRT
    let kz = isWithinKillzone(new Date('2026-07-06T10:00:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot1_10_13' });

    // 11:30 TRT
    kz = isWithinKillzone(new Date('2026-07-06T11:30:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot1_10_13' });

    // Exactly 13:00 TRT
    kz = isWithinKillzone(new Date('2026-07-06T13:00:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot1_10_13' });
  });

  test('should return active: true in slot 2 (15:30 - 18:30 TRT) on weekdays', () => {
    process.env.ENABLE_KILLZONE = 'true';
    
    // Exactly 15:30 TRT
    let kz = isWithinKillzone(new Date('2026-07-06T15:30:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot2_1530_1830' });

    // 17:00 TRT
    kz = isWithinKillzone(new Date('2026-07-06T17:00:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot2_1530_1830' });

    // Exactly 18:30 TRT
    kz = isWithinKillzone(new Date('2026-07-06T18:30:00+03:00'));
    expect(kz).toEqual({ active: true, reason: 'slot2_1530_1830' });
  });

  test('should return active: false outside configured trading hours on weekdays', () => {
    process.env.ENABLE_KILLZONE = 'true';
    
    // 09:59 TRT (Before Slot 1)
    let kz = isWithinKillzone(new Date('2026-07-06T09:59:00+03:00'));
    expect(kz).toEqual({ active: false, reason: 'outside_trading_hours' });

    // 14:00 TRT (Between Slot 1 and 2)
    kz = isWithinKillzone(new Date('2026-07-06T14:00:00+03:00'));
    expect(kz).toEqual({ active: false, reason: 'outside_trading_hours' });

    // 19:00 TRT (After Slot 2)
    kz = isWithinKillzone(new Date('2026-07-06T19:00:00+03:00'));
    expect(kz).toEqual({ active: false, reason: 'outside_trading_hours' });
  });

  test('keeps production killzone filtering active when bypass is false or unset', () => {
    process.env.ENABLE_KILLZONE = 'true';
    process.env.ENABLE_PVP_KILLZONE_BYPASS = 'false';

    expect(evaluateKillzoneFilter(new Date('2026-07-06T14:00:00+03:00'))).toEqual({
      active: false,
      reason: 'outside_trading_hours',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });

    delete process.env.ENABLE_PVP_KILLZONE_BYPASS;
    expect(evaluateKillzoneFilter(new Date('2026-07-11T12:00:00+03:00'))).toEqual({
      active: false,
      reason: 'weekend_market_closed',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });
  });

  test('bypasses intraday killzones but never bypasses the weekend closure', () => {
    process.env.ENABLE_KILLZONE = 'true';
    process.env.ENABLE_PVP_KILLZONE_BYPASS = 'true';

    expect(evaluateKillzoneFilter(new Date('2026-07-06T14:00:00+03:00'))).toEqual({
      active: true,
      reason: 'pvp_killzone_bypass',
      profile: 'PVP_ACCELERATION',
      filter: 'BYPASSED',
    });
    expect(evaluateKillzoneFilter(new Date('2026-07-11T12:00:00+03:00'))).toEqual({
      active: false,
      reason: 'weekend_market_closed',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });
  });

  test('blocks Friday New York close and Monday before London open', () => {
    process.env.ENABLE_PVP_KILLZONE_BYPASS = 'true';
    expect(evaluateKillzoneFilter(new Date('2026-07-10T17:30:00-04:00')).reason).toBe('friday_new_york_closed');
    expect(evaluateKillzoneFilter(new Date('2026-07-13T07:30:00+01:00')).reason).toBe('monday_before_london_open');
  });
});
