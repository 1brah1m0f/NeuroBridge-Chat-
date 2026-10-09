// ESLint flat config: the TypeScript chat module (server/, shared/, scripts/, tests/, client/src/)
// and the zero-dependency game in itb/ (classic browser scripts + CommonJS server/tools, no build step).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'itb/tools/out/**'] },

  js.configs.recommended,
  {
    rules: {
      // the sanitizers strip control characters on purpose
      'no-control-regex': 'off',
    },
  },

  // --- TypeScript chat module
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'off', // tests poke at raw socket payloads
    },
  },
  { files: ['client/src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },

  // --- itb game
  {
    files: ['itb/**/*.js'],
    languageOptions: { ecmaVersion: 'latest' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      // existing dead locals are reported but do not fail CI; new code should not add more
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    // browser + shared core: classic scripts that share the global AS namespace
    files: ['itb/js/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, AS: 'writable', module: 'readonly' } },
  },
  {
    // Node server and tools
    files: ['itb/server/**/*.js', 'itb/tools/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // --- this file and other root ESM configs
  { files: ['*.js', '*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.node } } },
);
