import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        AbortController: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
  {
    files: [
      'scripts/**/*.js',
      'src/common/logger.js',
      'src/infrastructure/database/migrate.js',
      'src/infrastructure/database/seed.js',
      'src/integrations/hcm-mock/main.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];
