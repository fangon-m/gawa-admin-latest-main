process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

const { generateTempPassword } = require('../tempPasswords');

describe('generateTempPassword', () => {
  it('defaults to 12 characters and honours an explicit length', () => {
    expect(generateTempPassword()).toHaveLength(12);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it('always contains upper, lower, digit and symbol characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateTempPassword();
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%&*?]/);
    }
  });

  it('avoids visually ambiguous characters', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateTempPassword(32)).not.toMatch(/[0O1lI]/);
    }
  });

  it('never repeats a password across draws', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(drawn.size).toBe(200);
  });
});
