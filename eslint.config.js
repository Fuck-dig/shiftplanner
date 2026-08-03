import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// eslint-plugin-react is here for ONE rule that matters: jsx-uses-vars.
// Without it, plain no-unused-vars can't see that a component referenced only
// inside JSX (<Btn/>, <WeekView/>) is used at all — which reported ~100 bogus
// "defined but never used" errors and made `npm run lint` useless noise. The
// rest of the plugin's stylistic rules are deliberately NOT enabled; this is
// about making the existing rules tell the truth, not adding new opinions.
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Every empty catch in this codebase is a deliberate best-effort
      // cleanup — removing a <style>/<link> the effect added, or a
      // localStorage write in a browser that blocks it. There is genuinely
      // nothing to do on failure, and forcing a no-op body just to satisfy
      // the rule would be noise.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // The print/export views build an HTML document as a string containing
      // <\/script>. The backslash is REQUIRED: an unescaped </script> inside
      // that string would terminate the surrounding script tag when the
      // document is written out. ESLint can't see that context.
      'no-useless-escape': 'off',
    },
  },
  {
    // Tests run in Node under vitest and use its globals.
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
])
