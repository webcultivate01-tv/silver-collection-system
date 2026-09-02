// Lint rules for the backend.
//
// Deliberately narrow: this is being added to an existing codebase, so it is
// tuned to catch mistakes (an undefined variable, a promise nobody waited for,
// a duplicated object key) rather than to enforce a style the whole project
// would then have to be rewritten to satisfy.

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**", "uploads/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // An unused parameter is often meaningful here - Express identifies an
      // error handler by its arity, so errorHandler's `next` must stay.
      "no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
      // The real bug-catchers.
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      // Off deliberately. It flags the idiomatic Express pattern
      //   req.account = await Model.findById(...)
      // as a race, but every request has its own `req` object, so there is
      // nothing shared to race over. Leaving it on would mean nine suppression
      // comments on correct code.
      "require-atomic-updates": "off",
      eqeqeq: ["warn", "smart"],
      "no-console": "off", // the server logs to the console on purpose
    },
  },
  {
    // Test files are ESM and use Vitest's globals.
    files: ["tests/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, ...globals.vitest },
    },
  },
  {
    files: ["vitest.config.js"],
    languageOptions: { sourceType: "module" },
  },
];
