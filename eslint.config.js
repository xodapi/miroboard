import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      // wasm-bindgen output, generated on every `wasm-pack build`.
      '**/wasm/board-core/**',
      'wasm/**/target/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['*.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/format/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['yjs', 'yjs/**'], message: 'format modules must not depend on Yjs.' },
          { group: ['react', 'react/**'], message: 'format modules must remain DOM-free.' },
          { group: ['../persistence/**', '@/persistence/**'], message: 'format modules must not import persistence.' },
          { group: ['../history/**', '@/history/**'], message: 'format modules must not import history.' },
          { group: ['../App', '../App.*', '@/App', '@/App.*'], message: 'format modules must not import App.' }
        ],
      }],
    },
  },
)
