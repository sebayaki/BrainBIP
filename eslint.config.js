import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    'dist/**',
    'test-results/**',
    'playwright-report/**',
    '.cache/**',
    '.local/**',
    '.release/**',
    'coverage/**',
  ]),
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: { 'no-console': 'error' },
  },
  { files: ['src/*.worker.js'], languageOptions: { globals: globals.worker } },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  // Browser callbacks in Playwright tests execute inside the page.
  { files: ['tests/browser/*.js'], languageOptions: { globals: globals.browser } },
]);
