const { updateUser } = require('../users');

// Mock the supabase module
jest.mock('../../db/supabase', () => {
  const mockSingle = jest.fn();
  const mockSelect = jest.fn(() => ({ single: mockSingle }));
  const mockUpdate = jest.fn(() => ({ eq: jest.fn(() => ({ select: mockSelect })) }));
  const mockFrom = jest.fn(() => ({ update: mockUpdate }));
  return {
    from: mockFrom,
    auth: { admin: { deleteUser: jest.fn() } },
  };
});

const supabase = require('../../db/supabase');

describe('updateUser controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: { id: 'user-uuid-123' },
      body: {},
      user: { id: 'admin-uuid', role: 'admin' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should update name, phone, and location successfully', async () => {
    req.body = { name: 'New Name', phone: '+63 912 345 6789', location: 'Manila' };

    const mockUpdatedUser = {
      id: 'user-uuid-123',
      name: 'New Name',
      phone: '+63 912 345 6789',
      location: 'Manila',
      email: 'user@email.com',
      role: 'client',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    };

    // Get the mock functions from the chain
    const mockEq = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: mockUpdatedUser, error: null }) })) }));
    const mockUpdate = jest.fn(() => ({ eq: mockEq }));
    supabase.from.mockImplementation(() => ({ update: mockUpdate }));

    await updateUser(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Name',
        phone: '+63 912 345 6789',
        location: 'Manila',
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Name',
          phone: '+63 912 345 6789',
          location: 'Manila',
        }),
        message: 'Profile updated successfully',
      })
    );
  });

  it('should update only provided fields (partial update)', async () => {
    req.body = { name: 'Just Name' };

    const mockUpdatedUser = {
      id: 'user-uuid-123',
      name: 'Just Name',
      phone: '+63 912 345 6789',
      location: 'Manila',
      email: 'user@email.com',
      role: 'client',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    };

    const mockEq = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: mockUpdatedUser, error: null }) })) }));
    const mockUpdate = jest.fn(() => ({ eq: mockEq }));
    supabase.from.mockImplementation(() => ({ update: mockUpdate }));

    await updateUser(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Just Name',
        updated_at: expect.any(String),
      })
    );
    // Phone and location should NOT be in the update object
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('phone');
    expect(updateArg).not.toHaveProperty('location');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Just Name' }),
        message: 'Profile updated successfully',
      })
    );
  });

  it('should return 404 when user is not found', async () => {
    req.body = { name: 'Ghost User' };

    const mockEq = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) })) }));
    const mockUpdate = jest.fn(() => ({ eq: mockEq }));
    supabase.from.mockImplementation(() => ({ update: mockUpdate }));

    await updateUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('should update only phone when only phone is provided', async () => {
    req.body = { phone: '+63 999 888 7777' };

    const mockUpdatedUser = {
      id: 'user-uuid-123',
      name: 'Existing Name',
      phone: '+63 999 888 7777',
      location: 'Bulacan',
      email: 'user@email.com',
      role: 'client',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    };

    const mockEq = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: mockUpdatedUser, error: null }) })) }));
    const mockUpdate = jest.fn(() => ({ eq: mockEq }));
    supabase.from.mockImplementation(() => ({ update: mockUpdate }));

    await updateUser(req, res);

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.phone).toBe('+63 999 888 7777');
    expect(updateArg).not.toHaveProperty('name');
    expect(updateArg).not.toHaveProperty('location');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Profile updated successfully' })
    );
  });

  it('should handle Supabase error gracefully', async () => {
    req.body = { name: 'Test' };

    const mockEq = jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }) })) }));
    const mockUpdate = jest.fn(() => ({ eq: mockEq }));
    supabase.from.mockImplementation(() => ({ update: mockUpdate }));

    await updateUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });
});
