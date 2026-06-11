# CodeMirror 6 — vendored ESM bundle

`codemirror.js` is a single static ESM bundle of CodeMirror 6 + the C++ language,
built once and committed. The frontend imports it with a relative path; the app
has no build step and no CDN dependency.

## Pinned versions

```
@codemirror/state         6.6.0
@codemirror/view          6.43.1
@codemirror/commands      6.10.3
@codemirror/language      6.12.3
@codemirror/search        6.7.0
@codemirror/autocomplete  6.20.3
@codemirror/lang-cpp      6.0.3
@lezer/highlight          1.2.3
```

## How to rebuild

```sh
mkdir cm6build && cd cm6build
npm init -y
npm install @codemirror/state @codemirror/view @codemirror/commands \
            @codemirror/language @codemirror/search @codemirror/autocomplete \
            @codemirror/lang-cpp @lezer/highlight esbuild
# entry.js mirrors what frontend/src/editor-cm.js imports
node_modules/.bin/esbuild entry.js --bundle --format=esm --target=es2020 \
  --minify --outfile=codemirror.js
cp codemirror.js ../usaco-ide-2/frontend/vendor/codemirror/codemirror.js
```

`entry.js` must re-export the same named symbols that `frontend/src/editor-cm.js`
imports — if you add a new import there, add the matching `export` here and
rebuild.
