/** ESLint flat config — Node/CommonJS (VEHO Edu). */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'uploads/**',
      'private/**',
      'tools/**',
      'tests/**/results/**',
      'tests/**/playwright-report/**',
      'tests/**/test-results/**',
      'tests/performance/k6/**',
      'tests/preprod/results/**',
      'frontend/**',
      '**/*.min.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', 'database/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  }
];
