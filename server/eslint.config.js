import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'no-process-exit': 'off',
      'no-case-declarations': 'off', // Allow declarations in case blocks
      'no-empty': 'warn', // Warn on empty blocks instead of error
      'no-prototype-builtins': 'warn', // Warn instead of error
      'no-useless-escape': 'warn', // Warn instead of error
    },
  },
  {
    // queryToTaxonomy.js has intentional duplicate keys for different taxonomy categories
    files: ['**/queryToTaxonomy.js'],
    rules: {
      'no-dupe-keys': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
