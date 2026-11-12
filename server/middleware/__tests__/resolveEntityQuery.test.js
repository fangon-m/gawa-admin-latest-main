const { resolveEntityQuery } = require('../resolveEntityQuery');

jest.mock('../../utilities/entityIds', () => ({
  resolveEntityId: jest.fn(),
}));

const { resolveEntityId } = require('../../utilities/entityIds');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

const UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  resolveEntityId.mockResolvedValue(null);
});

describe('resolveEntityQuery', () => {
  it('leaves a uuid alone', async () => {
    const req = { query: { ownerId: UUID } };
    const res = makeRes();
    const next = jest.fn();

    await resolveEntityQuery(['ownerId', 'user'])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(resolveEntityId).not.toHaveBeenCalled();
    expect(req.query.ownerId).toBe(UUID);
  });

  it('resolves a friendly id to the underlying uuid', async () => {
    resolveEntityId.mockResolvedValue(UUID);
    const req = { query: { ownerId: 'USR-123456' } };
    const res = makeRes();
    const next = jest.fn();

    await resolveEntityQuery(['ownerId', 'user'])(req, res, next);

    expect(resolveEntityId).toHaveBeenCalledWith('user', 'USR-123456');
    expect(req.query.ownerId).toBe(UUID);
    expect(next).toHaveBeenCalled();
  });

  it('rejects an id that resolves to nothing', async () => {
    resolveEntityId.mockResolvedValue(null);
    const req = { query: { ownerId: 'USR-999999' } };
    const res = makeRes();
    const next = jest.fn();

    await resolveEntityQuery(['ownerId', 'user'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ownerId' });
    expect(next).not.toHaveBeenCalled();
  });

  it('ignores an empty parameter', async () => {
    const req = { query: { ownerId: '' } };
    const res = makeRes();
    const next = jest.fn();

    await resolveEntityQuery(['ownerId', 'user'])(req, res, next);

    expect(resolveEntityId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('handles several parameters at once', async () => {
    resolveEntityId.mockResolvedValue(UUID);
    const req = { query: { listingId: 'LST-792472', ownerId: 'USR-123456' } };
    const res = makeRes();
    const next = jest.fn();

    await resolveEntityQuery(['listingId', 'listing'], ['ownerId', 'user'])(req, res, next);

    expect(resolveEntityId).toHaveBeenCalledWith('listing', 'LST-792472');
    expect(resolveEntityId).toHaveBeenCalledWith('user', 'USR-123456');
    expect(req.query.listingId).toBe(UUID);
    expect(req.query.ownerId).toBe(UUID);
    expect(next).toHaveBeenCalled();
  });
});
