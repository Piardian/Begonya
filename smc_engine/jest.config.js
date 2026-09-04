module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^puppeteer$': '<rootDir>/tests/mocks/puppeteer.ts'
  }
};
