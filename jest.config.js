/** @type {import('jest').Config} */
const shared = {
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 30000
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/security/**/*.test.js',
        '<rootDir>/tests/*.test.js'
      ],
      collectCoverageFrom: [
        'backend/utils/**/*.js',
        'backend/constants/**/*.js',
        'backend/middleware/autenticacao.js',
        'backend/services/boletim.js',
        'backend/services/promocao.js',
        'backend/services/stripe.js',
        'backend/services/notificacaoDispatcher.js',
        '!**/node_modules/**'
      ]
    },
    {
      ...shared,
      displayName: 'api',
      testMatch: ['<rootDir>/tests/api/**/*.api.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/api/setup.js'],
      testTimeout: 60000,
      forceExit: true
    },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.integration.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/api/setup.js'],
      testTimeout: 60000,
      forceExit: true
    }
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov']
};
