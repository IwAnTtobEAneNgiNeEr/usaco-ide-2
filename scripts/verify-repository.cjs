#!/usr/bin/env node
'use strict';
// Built-ins only. Never import/evaluate application or fixture modules.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const deadline = Date.now() + 240000;
const failures = [];
const stats = { files: 0, javascriptSyntax: 0, json: 0, credentialShapeMatches: 0 };
const ignoredDirectories = new Set(['.git', 'node_modules']);
const runtimeRoots = new Set(['workspace', 'user-data', 'test-data', 'runtime', '.runtime', '.local', 'temp', 'tmp', 'cache', 'runs', 'usaco-audit-kit', 'evidence', 'screenshots', 'reports', 'browser-output']);
const secretShapes = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['provider-token', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{40,}\b/],
  ['aws-access-id', /\bAKIA[A-Z0-9]{16}\b/],
  ['credential-url', /https?:\/\/[A-Za-z0-9._~-]+:[A-Za-z0-9._~%!-]{8,}@/],
];
function fail(file, reason) { failures.push({ path: file, reason }); }
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    if (Date.now() > deadline) throw Error('Static-check deadline exceeded');
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const top = relative.split('/')[0];
    if (entry.isSymbolicLink()) { fail(relative, 'Symlink requires separate containment review'); continue; }
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      if (runtimeRoots.has(top) || /^browser-profile/.test(top) || /^desktop\/(dist|out)(\/|$)/.test(relative)) {
        fail(relative, 'Runtime/generated directory present in intended source tree'); continue;
      }
      walk(absolute); continue;
    }
    if (!entry.isFile()) { fail(relative, 'Non-regular source entry'); continue; }
    stats.files++;
    if (stats.files > 4000) throw Error('Source file budget exceeded');
    const size = fs.statSync(absolute).size;
    if (size > 5 * 1024 * 1024) { fail(relative, 'File exceeds 5 MiB review budget'); continue; }
    if ((top === 'data' && !/^data\/[^/]+\.example\.json$/.test(relative)) ||
        (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') ||
        /\.(?:pem|key|p12|pfx|kdbx)$/i.test(entry.name) ||
        /^[^/]+\.(?:zip|exe|dll|o|obj|gch)$/i.test(relative) ||
        (entry.name === '.npmrc')) fail(relative, 'Credential/runtime/build path disallowed');
    const buffer = fs.readFileSync(absolute);
    if (!buffer.includes(0)) {
      const text = buffer.toString('utf8');
      for (const [name, pattern] of secretShapes) {
        if (pattern.test(text)) { stats.credentialShapeMatches++; fail(relative, 'Potential '+name+'; value withheld'); }
      }
      if (/\.json$/i.test(entry.name)) {
        try { JSON.parse(text.replace(/^\uFEFF/, '')); stats.json++; }
        catch { fail(relative, 'Invalid JSON'); }
      }
      if (/\.(?:js|cjs|mjs)$/i.test(entry.name)) {
        const result = cp.spawnSync(process.execPath, ['--check', absolute], {
          cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 100000,
          env: process.env,
        });
        // Do not echo arbitrary source lines or file contents into logs.
        if (result.status !== 0) fail(relative, 'JavaScript syntax check failed or timed out');
        else stats.javascriptSyntax++;
      }
    }
  }
}
try {
  walk(root);
  for (const required of ['AGENTS.md','SECURITY.md','README.md','.gitignore','.gitattributes','.editorconfig','backend/package-lock.json','docs/security/truth-core.md','docs/operations/development.md']) {
    if (!fs.existsSync(path.join(root,required))) fail(required,'Required governance file absent');
  }
  const workflow = fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
  if (/pull_request_target:|secrets\.|npm (?:ci|install|test)|contents:\s*write|id-token:\s*write/.test(workflow)) fail('.github/workflows/ci.yml','Disallowed CI token/install/runtime behavior');
  const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(m=>m[1]);
  if (uses.length !== 2 || uses.some(s=>!/^actions\/(?:checkout|setup-node)@[a-f0-9]{40}$/.test(s))) fail('.github/workflows/ci.yml','Expected two full-SHA official action pins');
  if (!workflow.includes('persist-credentials: false') || !workflow.includes('contents: read') || !workflow.includes('timeout-minutes: 6')) fail('.github/workflows/ci.yml','Missing explicit CI restrictions');
} catch (error) { fail('<checker>',error.message); }
console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', ...stats, failures, limitations: 'Heuristic shape/path checks; no Git history/index scan, OS isolation, YAML schema validation, dependency or runtime test coverage.' }, null, 2));
process.exitCode = failures.length ? 1 : 0;
