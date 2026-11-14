process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { createPack, updatePack, deletePack } = require('../gawaPoints');

const EXISTING_PACK = {
  pack_id: 'standard',
  display_name: 'Standard',
  points: 30,
  price_php: 50,
  cost_per_point: 1.67,
  sort_order: 2,
  is_active: true,
};

// The live `gawa_points_packs` table only has these writable columns.
// `cost_per_point` is a GENERATED ALWAYS AS (...) STORED column, so it must
// never appear in an insert or update payload (SQLSTATE 428C9 otherwise).
const WRITABLE_PACK_COLUMNS = [
  'pack_id',
  'display_name',
  'points',
  'price_php',
  'sort_order',
  'is_active',
];

let responses;
let queries;

function makeQuery() {
  const query = {
    op: 'select',
    payload: undefined,
    filters: [],
    ordered: false,
    select: jest.fn(() => query),
    insert: jest.fn((payload) => { query.op = 'insert'; query.payload = payload; return query; }),
    update: jest.fn((payload) => { query.op = 'update'; query.payload = payload; return query; }),
    delete: jest.fn(() => { query.op = 'delete'; return query; }),
    eq: jest.fn((column, value) => { query.filters.push([column, value]); return query; }),
    order: jest.fn(() => { query.ordered = true; return query; }),
    limit: jest.fn(() => query),
    maybeSingle: jest.fn(() => Promise.resolve(query.result())),
    single: jest.fn(() => Promise.resolve(query.result())),
    then: (resolve, reject) => Promise.resolve(query.result()).then(resolve, reject),
    result: () => {
      if (query.op === 'insert') return responses.insert;
      if (query.op === 'update') return responses.update;
      if (query.op === 'delete') return responses.delete;
      // `nextSortOrder` is the only read that sorts; the rest are lookups.
      return query.ordered ? responses.selectOrdered : responses.selectSingle;
    },
  };
  return query;
}

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  queries = [];
  responses = {
    selectSingle: { data: null, error: null },
    selectOrdered: { data: [{ sort_order: 4 }], error: null },
    insert: { data: { ...EXISTING_PACK, pack_id: 'starter-pack' }, error: null },
    update: { data: { ...EXISTING_PACK, is_active: false }, error: null },
    delete: { data: [{ pack_id: 'standard' }], error: null },
  };
  supabase.from.mockImplementation((table) => {
    const query = makeQuery();
    query.table = table;
    queries.push(query);
    return query;
  });
});

function insertPayload() {
  const query = queries.find((q) => q.op === 'insert');
  return query && query.payload;
}

function updatePayload() {
  const query = queries.find((q) => q.op === 'update');
  return query && query.payload;
}

describe('Gawa points packs', () => {
  it('creates a pack using only columns that exist in the table', async () => {
    const res = makeRes();

    await createPack(
      { body: { displayName: 'Starter Pack', points: '30', pricePhp: '50' } },
      res,
    );

    const payload = insertPayload();
    expect(payload).toBeDefined();
    expect(Object.keys(payload).sort()).toEqual([...WRITABLE_PACK_COLUMNS].sort());
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
    // Generated column: writing it fails with SQLSTATE 428C9.
    expect(payload).not.toHaveProperty('cost_per_point');

    // `pack_id` has no database default and must be supplied.
    expect(payload.pack_id).toBe('starter-pack');
    // `sort_order` is NOT NULL + UNIQUE with no default, so the next free
    // slot is picked when the admin leaves it blank.
    expect(payload.sort_order).toBe(5);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a pack without a positive price', async () => {
    const res = makeRes();

    await createPack({ body: { displayName: 'Free', points: '10', pricePhp: '0' } }, res);

    expect(insertPayload()).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('ignores a costPerPoint supplied by an old client', async () => {
    const res = makeRes();

    await createPack(
      { body: { displayName: 'Starter Pack', points: '30', pricePhp: '50', costPerPoint: '9.99' } },
      res,
    );

    expect(insertPayload()).not.toHaveProperty('cost_per_point');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('toggles isActive without writing an updated_at column', async () => {
    responses.selectSingle = { data: EXISTING_PACK, error: null };
    const res = makeRes();

    await updatePack({ params: { id: 'standard' }, body: { isActive: false } }, res);

    const payload = updatePayload();
    expect(payload).toEqual({ is_active: false });
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('description');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Pack updated' }));
  });

  it('never writes the generated cost_per_point column when the price changes', async () => {
    responses.selectSingle = { data: EXISTING_PACK, error: null };
    const res = makeRes();

    await updatePack({ params: { id: 'standard' }, body: { pricePhp: '90' } }, res);

    const payload = updatePayload();
    expect(payload).toEqual({ price_php: 90 });
    expect(payload).not.toHaveProperty('cost_per_point');
  });

  it('ignores an explicit costPerPoint instead of letting the database fail', async () => {
    responses.selectSingle = { data: EXISTING_PACK, error: null };
    const res = makeRes();

    await updatePack({ params: { id: 'standard' }, body: { isActive: false, costPerPoint: 3 } }, res);

    const payload = updatePayload();
    expect(payload).toEqual({ is_active: false });
    expect(payload).not.toHaveProperty('cost_per_point');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Pack updated' }));
  });

  it('reports a real database error instead of a misleading 404', async () => {
    responses.selectSingle = { data: EXISTING_PACK, error: null };
    responses.update = { data: null, error: { code: 'PGRST204', message: "Could not find the 'updated_at' column" } };
    const res = makeRes();

    await updatePack({ params: { id: 'standard' }, body: { isActive: false } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it('returns 404 when the pack to update does not exist', async () => {
    responses.selectSingle = { data: null, error: null };
    const res = makeRes();

    await updatePack({ params: { id: 'missing' }, body: { isActive: false } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(updatePayload()).toBeUndefined();
  });

  it('returns 409 when the sort order is already taken', async () => {
    responses.selectSingle = { data: EXISTING_PACK, error: null };
    responses.update = { data: null, error: { code: '23505', message: 'duplicate key value' } };
    const res = makeRes();

    await updatePack({ params: { id: 'standard' }, body: { sortOrder: 3 } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 404 when deleting a pack that no longer exists', async () => {
    responses.delete = { data: [], error: null };
    const res = makeRes();

    await deletePack({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes an existing pack', async () => {
    const res = makeRes();

    await deletePack({ params: { id: 'standard' } }, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Pack deleted' });
  });
});
