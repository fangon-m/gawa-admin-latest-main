module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server/controllers', '<rootDir>/server/routes', '<rootDir>/server/services'],
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
  ],
};
