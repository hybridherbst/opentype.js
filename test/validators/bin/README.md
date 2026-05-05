# Local Validator Binaries

This directory is the default location for validator executables used by the
explicit validation runners. The binaries are intentionally not committed.

Expected layout:

```text
test/validators/bin/
  fontspector
  ots/
    ots-sanitize
```

You can also keep the tools elsewhere and point the runners at them:

```sh
FONTSPECTOR_BIN=/path/to/fontspector npm run test:validate -- --tool fontspector
OTS_SANITIZE_BIN=/path/to/ots-sanitize npm run test:validate -- --tool ots
FONTTOOLS_PYTHON=/path/to/python3 npm run test:validate -- --tool fonttools
```

Install sources:

- Fontspector: https://github.com/fonttools/fontspector
- FontTools: `python3 -m pip install fonttools`
- OpenType Sanitizer / `ots-sanitize`: https://github.com/khaledhosny/ots/releases

These validators are not part of `npm test` because they rely on external tools.
The explicit `npm run test:validate` command fails with a setup message if a
requested validator is missing.
