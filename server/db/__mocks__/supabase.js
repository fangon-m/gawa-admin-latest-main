// Mock Supabase client factory
const mockChainable = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockReturnThis(),
};

const mockFrom = jest.fn(() => ({
  ...mockChainable,
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: new Error('Not found') }),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
}));

const mockAdmin = {
  deleteUser: jest.fn(),
  createUser: jest.fn(),
  listUsers: jest.fn(),
};

const supabase = {
  from: mockFrom,
  auth: {
    admin: mockAdmin,
  },
};

module.exports = supabase;
module.exports.__mockChainable = mockChainable;
module.exports.__mockFrom = mockFrom;
module.exports.__mockAdmin = mockAdmin;
