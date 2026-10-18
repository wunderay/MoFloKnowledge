import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import sonarjs from "eslint-plugin-sonarjs";

const typedFiles = ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"];

// typescript-eslint strict + stylistic, both type-aware, scoped to src/ and tests/.
const typed = [...tsPlugin.configs["flat/strict-type-checked"], ...tsPlugin.configs["flat/stylistic-type-checked"]].map(
  (config) => ({ ...config, files: typedFiles }),
);

export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  ...typed,
  {
    files: typedFiles,
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin, sonarjs },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description" }],
      // `typeof import("x")` annotations are the idiomatic way to type vi.importActual / dynamic imports.
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
      // Numbers in template literals are fine and ubiquitous; every other non-string type is still reported.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // React event handlers are routinely async (`onClick={async () => ...}`); void-return checks stay on elsewhere.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // `signal.reason` (AbortSignal) is typed `any` and a caught error is `unknown`; both are forwarded as-is.
      "@typescript-eslint/prefer-promise-reject-errors": ["error", { allowThrowingAny: true, allowThrowingUnknown: true }],
      // `"/" + index` style string building with numbers is fine.
      "@typescript-eslint/restrict-plus-operands": ["error", { allowNumberAndString: true }],
      // `a || b` on strings/numbers/booleans deliberately falls back on "" / 0 / false too; `??` would change behaviour.
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { string: true, number: true, boolean: true, bigint: true } },
      ],

      // Left off: ~105 hits are deliberate runtime guards for JSON/DB rows and values mutated in
      // closures (flags TS cannot see change). Removing them would change behaviour.
      "@typescript-eslint/no-unnecessary-condition": "off",

      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "no-useless-return": "error",
      "no-else-return": "error",
      "no-lonely-if": "error",
      // `== null` is the idiomatic null-or-undefined check; every other loose comparison is reported.
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-duplicate-string": ["error", { threshold: 5 }],
      "sonarjs/cognitive-complexity": ["warn", 25],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx"], location: "anywhere" }],
    },
  },
  {
    // Tests drive mocks, fixtures and untyped JSON (`as any`, `!`), so the unsafe-* family and a few noisy
    // strictness rules are relaxed here only. src/ keeps the full strict set.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/restrict-plus-operands": ["error", { allowNumberAndString: true, allowAny: true }],
      "sonarjs/no-duplicate-string": "off",
    },
  },
];
