const {
  sanitizeSearchTerm,
  sanitizeEntityFilter,
  calculatePagination,
  sendError,
  isUuid,
} = require('../helpers');

describe('sanitizeSearchTerm', () => {
  it('keeps ordinary names and email fragments searchable', () => {
    expect(sanitizeSearchTerm('john')).toBe('john');
    expect(sanitizeSearchTerm('john.doe@example.com')).toBe('john.doe@example.com');
    expect(sanitizeSearchTerm('  Ada  Lovelace ')).toBe('Ada Lovelace');
    expect(sanitizeSearchTerm("O'Brien-Smith")).toBe("O'Brien-Smith");
  });

  it('neutralises PostgREST filter syntax', () => {
    // A comma opens a new predicate, parentheses delimit a group and a
    // colon introduces a cast. None of them may survive.
    const attacks = [
      'x%,complete_address.ilike.%a',
      'x%),and(is_verified.eq.true',
      'x%25,id.not.is.null',
      'x):or(role.eq.admin',
      'x%3A%3Aint',
      'x%2Cpassword.not.is.null',
    ];
    for (const attack of attacks) {
      const result = sanitizeSearchTerm(attack);
      expect(result).not.toContain(',');
      expect(result).not.toContain('(');
      expect(result).not.toContain(')');
      expect(result).not.toContain(':');
      expect(result).not.toContain('%');
    }
  });

  it('strips wildcard characters that would widen the match', () => {
    expect(sanitizeSearchTerm('%')).toBe('');
    expect(sanitizeSearchTerm('%john%')).toBe('john');
    // `_` is a single-character wildcard: it is escaped, not passed through.
    expect(sanitizeSearchTerm('j_hn')).toBe('j\\_hn');
  });

  it('bounds the length of the term', () => {
    expect(sanitizeSearchTerm('a'.repeat(500))).toHaveLength(100);
  });

  it('returns an empty string for missing input', () => {
    expect(sanitizeSearchTerm(undefined)).toBe('');
    expect(sanitizeSearchTerm(null)).toBe('');
  });
});

describe('sanitizeEntityFilter', () => {
  it('accepts a UUID', () => {
    expect(sanitizeEntityFilter('11111111-1111-4111-8111-111111111111'))
      .toBe('11111111-1111-4111-8111-111111111111');
  });

  it('accepts a friendly entity id', () => {
    expect(sanitizeEntityFilter('USR-123456')).toBe('USR-123456');
    expect(sanitizeEntityFilter('JOB-000042')).toBe('JOB-000042');
  });

  it('rejects anything that could carry filter syntax', () => {
    expect(sanitizeEntityFilter('x),and(role.eq.admin')).toBe('');
    expect(sanitizeEntityFilter("1' OR '1'='1")).toBe('');
    expect(sanitizeEntityFilter('not-a-uuid')).toBe('');
    expect(sanitizeEntityFilter(undefined)).toBe('');
  });
});

describe('isUuid', () => {
  it('recognises well-formed UUIDs only', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid('11111111-1111-4111-8111-111111111111; DROP TABLE')).toBe(false);
  });
});

describe('calculatePagination', () => {
  it('defaults to a safe page size', () => {
    expect(calculatePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('clamps the limit so a caller cannot request the whole table', () => {
    expect(calculatePagination(1, 10000000).limit).toBe(100);
    expect(calculatePagination(1, 0).limit).toBe(1);
    expect(calculatePagination(1, -5).limit).toBe(1);
    expect(calculatePagination(1, 'abc').limit).toBe(20);
  });

  it('honours an explicitly raised ceiling', () => {
    expect(calculatePagination(1, 500, 500).limit).toBe(500);
    expect(calculatePagination(1, 5000, 500).limit).toBe(500);
  });

  it('computes the offset from the clamped page', () => {
    expect(calculatePagination(3, 20)).toEqual({ page: 3, limit: 20, offset: 40 });
    expect(calculatePagination(0, 20).page).toBe(1);
  });
});

describe('sendError', () => {
  function makeRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
  }

  it('does not return driver detail to the caller', () => {
    const res = makeRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    sendError(res, { message: 'relation "public.users_table" does not exist', code: '42P01' }, { status: 500 });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('users_table'),
    }));
    // The detail still reaches the server log.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses the supplied fallback message', () => {
    const res = makeRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    sendError(res, new Error('boom'), { status: 400, fallback: 'Could not update the password.' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Could not update the password.' });
    spy.mockRestore();
  });
});
