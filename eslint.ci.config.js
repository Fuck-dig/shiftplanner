// CI lint gate — deliberately NARROW.
//
// `npm run lint` (the full eslint.config.js) currently reports ~140 problems,
// almost all of them cosmetic: 102 no-unused-vars, plus a backlog of
// exhaustive-deps warnings. Gating deploys on all of that would block every
// push on issues that have never actually broken anything, so the full lint
// stays a thing you run and clean up over time rather than a blocker.
//
// This config gates on the one rule whose violations are a guaranteed
// production outage: rules-of-hooks. A hook added below an early return (e.g.
// after `if(loading) return <LoadingScreen/>`) runs on some renders and not
// others, and React responds by throwing "rendered more hooks than during the
// previous render" — which white-screens the app for every user, not just the
// person who wrote it. That exact bug shipped to production on 2026-08-03;
// this rule catches it in under a second.
//
// Adding more rules here is good, as long as they stay in the
// "this breaks at runtime for users" category rather than the style category.
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Added 11 Aug after this gate let an undefined `LOCALE` through in
      // KioskView — a guaranteed ReferenceError the moment the kiosk header
      // rendered. README already described this config as the "undefined
      // identifier gate"; it wasn't one. `vite build` does NOT catch this
      // (it resolves imports, not free variables), so nothing did.
      //
      // Squarely in this file's stated remit: an undefined identifier is not a
      // style problem, it's a screen that doesn't render.
      'no-undef': 'error',
    },
  },
]);
