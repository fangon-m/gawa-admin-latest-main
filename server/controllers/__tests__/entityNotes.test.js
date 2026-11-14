process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const JOB_ID = '803a938f-775c-4e28-a757-42254100a3ce';
const mockInserts = [];

jest.mock('../../db/supabase', () => ({
  from: jest.fn(() => {
    const query = {
      select: jest.fn(() => query),
      insert: jest.fn((values) => {
        mockInserts.push(values);
        return query;
      }),
      delete: jest.fn(() => query),
      eq: jest.fn(() => query),
      in: jest.fn(() => query),
      order: jest.fn(() => query),
      single: jest.fn(() => Promise.resolve({ data: { id: 'note-1', entity_type: 'job_posts', entity_id: 'job-1', content: 'Checked the work', author_id: 'admin-1', created_at: '2026-01-01T00:00:00Z' }, error: null })),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  }),
  auth: { admin: {} },
}));

jest.mock('../../utilities/entityIds', () => ({
  resolveEntityId: jest.fn(),
}));

const { resolveEntityId } = require('../../utilities/entityIds');
const { listNotes, addNote, deleteNote, resolveEntityType } = require('../entityNotes');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInserts.length = 0;
  resolveEntityId.mockResolvedValue(JOB_ID);
});

describe('entity notes', () => {
  it('accepts the table name the client sends', () => {
    // The Job Detail page sends 'job_posts'; the friendly 'job' works too.
    expect(resolveEntityType('job_posts')).toEqual({ table: 'job_posts', entity: 'job' });
    expect(resolveEntityType('job')).toEqual({ table: 'job_posts', entity: 'job' });
    expect(resolveEntityType('users_table')).toEqual({ table: 'users_table', entity: 'user' });
  });

  it('rejects an unknown entity type', () => {
    expect(resolveEntityType('payments')).toBeNull();
    expect(resolveEntityType('users_table; drop table users_table')).toBeNull();
    expect(resolveEntityType(undefined)).toBeNull();
  });

  it('lists the notes of an entity', async () => {
    const res = makeRes();

    await listNotes({ params: { entityType: 'job_posts', entityId: JOB_ID } }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('resolves a short entity id to the underlying uuid', async () => {
    const res = makeRes();

    await listNotes({ params: { entityType: 'job_posts', entityId: 'JOB-350252' } }, res);

    expect(resolveEntityId).toHaveBeenCalledWith('job', 'JOB-350252');
  });

  it('answers 400 for an unknown entity type', async () => {
    const res = makeRes();

    await listNotes({ params: { entityType: 'payments', entityId: JOB_ID } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported entity type or unknown entity' });
  });

  it('answers 400 when the entity cannot be resolved', async () => {
    resolveEntityId.mockResolvedValue(null);
    const res = makeRes();

    await listNotes({ params: { entityType: 'job_posts', entityId: 'JOB-000000' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('adds a note with the shape the notes panel reads', async () => {
    const res = makeRes();

    await addNote(
      { params: { entityType: 'job_posts', entityId: JOB_ID }, body: { content: '  Checked the work  ' }, user: { id: 'admin-1', name: 'Ada' } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    // The note is stored trimmed, against the resolved uuid.
    expect(mockInserts[0]).toEqual({
      entity_type: 'job_posts',
      entity_id: JOB_ID,
      content: 'Checked the work',
      author_id: 'admin-1',
    });
    // The shared NotesPanel reads `text`, not `content`.
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.text).toBe('Checked the work');
    expect(payload.data.author).toBe('Ada');
  });

  it('refuses a note with no content', async () => {
    const res = makeRes();

    await addNote({ params: { entityType: 'job_posts', entityId: JOB_ID }, body: { content: '  ' }, user: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Note content is required' });
  });

  it('deletes a note', async () => {
    const res = makeRes();

    await deleteNote({ params: { entityType: 'job_posts', entityId: JOB_ID, noteId: 'note-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Note deleted' });
  });
});
