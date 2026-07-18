import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat ESLint config (ESLint 9+).
 * - web/src   → browser globals, ES modules
 * - server/src → node globals, ES modules
 * - server/test → node + test globals
 */
export default [
  {
    ignores: ['**/node_modules/**', 'web/dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['web/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['server/test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
