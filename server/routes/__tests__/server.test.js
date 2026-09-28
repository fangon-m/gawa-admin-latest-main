process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const { scheduleAutoProcessExpiredReviews } = require('../../server');

describe('scheduleAutoProcessExpiredReviews', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers the first run until after the startup warmup period', () => {
    const onTick = jest.fn();

    scheduleAutoProcessExpiredReviews({ startupDelayMs: 1000, intervalMs: 60000, onTick });

    expect(onTick).not.toHaveBeenCalled();

    jest.advanceTimersByTime(999);
    expect(onTick).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
