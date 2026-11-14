process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { entityIdNumeric, entityIdToken, resolveEntityId } = require('../../utilities/entityIds');

const USER_ID = '3b4e44c4-aded-4deb-b7dd-f35ee09c3bed';
const OTHER_ID = 'd4444444-4444-4444-4444-444444444401';

function makeQuery(rows) {
  const query = {
    select: jest.fn(() => query),
    limit: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return query;
}

describe('friendly entity ids', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReturnValue(makeQuery([{ id: USER_ID }, { id: OTHER_ID }]));
  });

  it('matches the client display id format', () => {
    expect(entityIdToken(USER_ID)).toBe('USR-630212');
    expect(entityIdNumeric(USER_ID)).toBe('630212');
  });

  it('resolves a friendly id back to the account uuid', async () => {
    await expect(resolveEntityId('user', 'USR-630212')).resolves.toBe(USER_ID);
  });

  it('passes a uuid through untouched', async () => {
    await expect(resolveEntityId('user', USER_ID)).resolves.toBe(USER_ID);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns null for unknown or malformed ids', async () => {
    await expect(resolveEntityId('user', 'USR-000000')).resolves.toBeNull();
    await expect(resolveEntityId('user', 'not-an-id')).resolves.toBeNull();
    await expect(resolveEntityId('user', null)).resolves.toBeNull();
  });

  it('resolves every entity type from its own table', async () => {
    const cases = [
      ['job', 'job_posts', 'job_post_id', 'JOB-'],
      ['listing', 'equipment_listings', 'listing_id', 'LST-'],
      ['rental', 'equipment_rentals', 'rental_id', 'RNT-'],
      ['transaction', 'transactions', 'id', 'TXN-'],
    ];

    for (const [type, table, column, prefix] of cases) {
      jest.clearAllMocks();
      supabase.from.mockReturnValue(makeQuery([{ [column]: USER_ID }]));
      const token = `${prefix}${entityIdNumeric(USER_ID)}`;

      await expect(resolveEntityId(type, token)).resolves.toBe(USER_ID);
      expect(supabase.from).toHaveBeenCalledWith(table);
    }
  });

  it('refuses ambiguous ids instead of opening the wrong row', async () => {
    // Both uuids hash to USR-998128.
    const first = '74abcdef-0123-4567-8900-000000000000';
    const second = '361abcde-f012-3456-7890-000000000000';
    expect(entityIdNumeric(first)).toBe(entityIdNumeric(second));
    supabase.from.mockReturnValue(makeQuery([{ id: first }, { id: second }]));

    await expect(resolveEntityId('user', 'USR-998128')).resolves.toBeNull();
  });
});
