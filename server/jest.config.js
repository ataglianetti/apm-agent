export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js'],
  collectCoverageFrom: ['services/**/*.js', 'routes/**/*.js', '!**/*.test.js'],
  coverageReporters: ['text', 'text-summary', 'html'],
};
