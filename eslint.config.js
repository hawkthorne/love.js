const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      semi: "error",
      "no-unused-vars": [2, { args: "all", argsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: ["**/*/love.js", "**/*/love.worker.js"],
  },
];
