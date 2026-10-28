'use strict';
// Store-only tests: no server, provider, compiler or subprocess imports.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'w0-store-'));
process.env.USACO_IDE_USER_DATA_DIR = root;
const store = require('../src/problemStore');
test.after(() => fs.rm(root, { recursive: true, force: true }));
for (const language of ['en', 'vi']) {
  test(`source language ${language} survives create, update, touch and duplicate`, async () => {
    const meta = await store.createProblem({ title: `synthetic-${language}`, origin: 'imported', statement: 'Original', statementSourceLanguage: language });
    assert.equal((await store.readMeta(meta.id)).statementSourceLanguage, language);
    const next = language === 'en' ? 'vi' : 'en';
    await store.updateProblem(meta.id, { statementSourceLanguage: next });
    await store.setFile(meta.id, 'statementVi', 'Bản dịch');
    assert.equal((await store.readMeta(meta.id)).statementSourceLanguage, next);
    assert.equal((await store.duplicateProblem(meta.id)).statementSourceLanguage, next);
    assert.equal(await store.getFile(meta.id, 'statement'), 'Original');
  });
}
test('legacy metadata remains readable without inventing a source language', async () => {
  const meta = await store.createProblem({ title: 'synthetic-legacy' });
  assert.equal((await store.readMeta(meta.id)).statementSourceLanguage, '');
});

test('metadata language survives an unrelated update and rejects invalid language values', async () => {
  const meta = await store.createProblem({ title: 'synthetic-language-patch' });
  await store.updateProblem(meta.id, { statementSourceLanguage: 'en' });
  await store.updateProblem(meta.id, { title: 'New title', statementSourceLanguage: { invalid: true } });
  assert.equal((await store.readMeta(meta.id)).statementSourceLanguage, 'en');
});
