import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        // ugly platform-dependant classes and objects
        DecompressionStream: "readonly",
        Response: "readonly",
        TextDecoder: "readonly",
        SVGPathElement: "readonly",
        DOMParser: "readonly",
        Image: "readonly",
        document: "readonly",
        globalThis: "readonly",
        performance: "readonly",
        window: "readonly",
        Blob: "readonly",
        XMLHttpRequest: "readonly",
        fetch: "readonly",
      }
    },
    plugins: {
      jsdoc
    },
    settings: {
      jsdoc: {
        mode: "typescript",
        preferredTypes: {
          any: {
            message: "Use a specific type or define a @typedef instead of `any`.",
            replacement: false
          },
          Object: {
            message: "Use `Record<string, X>` or define a @typedef instead of bare `Object`.",
            replacement: false
          }
        }
      }
    },
    rules: {
      "jsdoc/check-types": ["error", {
        "noDefaults": true,
        "unifyParentAndChildTypeChecks": true
      }],
      "indent": [
        "error",
        4,
        {
          "SwitchCase": 1
        }
      ],
      "linebreak-style": [
        "error",
        "unix"
      ],
      "quotes": [
        "error",
        "single"
      ],
      "semi": [
        "error",
        "always"
      ],
      "no-restricted-syntax": [
        "error",
        {
          "message": "For consistency, Use `for()` loops instead of `.forEach()`",
          "selector": "MemberExpression > Identifier[name=\"forEach\"]"
        }
      ]
    }
  }
]
