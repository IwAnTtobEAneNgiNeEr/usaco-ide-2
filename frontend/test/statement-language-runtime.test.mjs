import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../src/i18n.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const english = '# Sum\nGiven two integers, print their sum.\n\nInput\n```\n1 2\n```\nOutput\n```\n3\n```';
const vietnamese = '# Tổng\nCho hai số nguyên, hãy in tổng của chúng.\n\nInput\n```\n1 2\n```\nOutput\n```\n3\n```';
function harness(saved = {}, translate = async () => ({ statement: vietnamese })) {
  const disk = { statement: english, statementEn: '', statementVi: '', ...saved };
  const writes = [];
  const api = { aiTranslateStatement: translate };
  for (const [method, key] of [['saveStatement', 'statement'], ['saveStatementEn', 'statementEn'], ['saveStatementVi', 'statementVi']]) {
    api[method] = async (id, value) => { writes.push({ id, key, value }); disk[key] = value; };
  }
  api.updateProblem = async (id, patch) => { Object.assign(disk, patch); };
  const field = { value: disk.statement, selectionStart: 0, selectionEnd: disk.statement.length, dispatchEvent() {} };
  const app = { state: { currentId: 'synthetic' }, el: { ioStatement: field, statementStatus: { textContent: '' } }, toast(message) { app.error = message; }, renderStatement() {} };
  const context = vm.createContext({ api, app, localStorage: { getItem: () => 'vi' }, document: {
    body: {}, documentElement: { dataset: {} }, querySelectorAll: () => [], getElementById: () => null,
  }, MutationObserver: class { observe() {} }, Event: class {}, setTimeout, clearTimeout });
  vm.runInContext(source + '\ninitLanguage(app);', context);
  const load = () => {
    field.value = disk.statement;
    app.state.savedStatement = field.value;
    app.setStatementVariants({ ...disk, sourceLanguage: disk.statementSourceLanguage });
    app.state.activeStatementLanguage = app.state.statementVariants.sourceLanguage;
  };
  load();
  return { app, api, disk, writes, field, load };
}

test('legacy English original survives translation, reload, source selection and translation edits', async () => {
  const { app, disk, field, load } = harness();
  await app.applyStatementLanguage();
  assert.equal(field.value, vietnamese);
  assert.equal(disk.statement, english);
  assert.equal(disk.statementVi, vietnamese);
  await app.persistActiveStatementVariant(vietnamese + '\nEdited translation');
  assert.equal(disk.statement, english);
  load();
  await app.applyStatementLanguage();
  app.state.statementLanguageMode = 'source';
  await app.applyStatementLanguage();
  assert.equal(field.value, english);
  await app.persistActiveStatementVariant(english + '\nSource edit');
  assert.equal(disk.statement, english + '\nSource edit');
});

test('Vietnamese source survives English translation and reload', async () => {
  const { app, disk, field, load } = harness({ statement: vietnamese, statementSourceLanguage: 'vi' }, async () => ({ statement: english }));
  app.state.uiLanguage = 'en';
  await app.applyStatementLanguage();
  assert.equal(field.value, english);
  assert.equal(disk.statement, vietnamese);
  load();
  app.state.statementLanguageMode = 'source';
  await app.applyStatementLanguage();
  assert.equal(field.value, vietnamese);
});

for (const result of [null, {}, { statement: '' }, { statement: '   ' }, { statement: {} }]) {
  test(`invalid translation ${JSON.stringify(result)} preserves source and shows error`, async () => {
    const { app, disk, field } = harness({}, async () => result);
    await app.applyStatementLanguage();
    assert.equal(disk.statement, english);
    assert.equal(disk.statementVi, '');
    assert.equal(field.value, english);
    assert.equal(app.state.activeStatementLanguage, 'en');
    assert.ok(app.error);
  });
}

test('provider failure keeps the original readable', async () => {
  const { app, disk, field } = harness({}, async () => { throw new Error('mock provider failure'); });
  await app.applyStatementLanguage();
  assert.equal(field.value, english);
  assert.equal(disk.statement, english);
  assert.ok(app.error);
});

test('late translation cannot write into another problem or replace an edited original', async () => {
  let finish;
  const { app, writes, field } = harness({}, () => new Promise(resolve => { finish = resolve; }));
  const pending = app.applyStatementLanguage();
  await Promise.resolve();
  app.state.currentId = 'different';
  app.setStatementVariants({ statement: 'Other problem', sourceLanguage: 'en' });
  field.value = 'Other problem';
  finish({ statement: vietnamese });
  await pending;
  assert.equal(field.value, 'Other problem');
  assert.equal(writes.length, 0);
});

test('whole-statement paste saves original before translation; failed provider still preserves it', async () => {
  const { app, disk, field } = harness({ statement: '' }, async () => { throw new Error('offline'); });
  field.value = '';
  await app.handleStatementTextPaste(english);
  assert.equal(disk.statement, english);
  assert.equal(disk.statementEn, english);
  assert.equal(disk.statementSourceLanguage, 'en');
  assert.equal(field.value, english);
});

test('changed fenced sample is rejected without saving a translation', async () => {
  const { app, disk } = harness({}, async () => ({ statement: vietnamese.replace('1 2', '5 6') }));
  await app.applyStatementLanguage();
  assert.equal(disk.statementVi, '');
  assert.ok(app.error);
});

test('source edits invalidate the previous translation on disk', async () => {
  const { app, disk } = harness({ statementEn: english, statementVi: vietnamese });
  await app.persistActiveStatementVariant(english + '\nNew requirement');
  assert.equal(disk.statementVi, '');
});

test('translation/reload lifecycle through the real store preserves source and sample receipt', async () => {
  const { createRequire } = await import('node:module');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'w0-lifecycle-'));
  process.env.USACO_IDE_USER_DATA_DIR = root;
  const require = createRequire(import.meta.url);
  const store = require('../../backend/src/problemStore.js');
  try {
    const meta = await store.createProblem({ title: 'Synthetic translation lifecycle', origin: 'imported', statement: english });
    await store.addTest(meta.id, { input: '1 2\n', expected: '3\n', generatedBy: 'ai' });
    const before = await store.listTests(meta.id);
    assert.equal(before[0].oracle.method, 'statement-sample');
    assert.equal(before[0].oracle.state, 'trusted');
    const { app, api } = harness();
    app.state.currentId = meta.id;
    for (const [method, kind] of [['saveStatement', 'statement'], ['saveStatementEn', 'statementEn'], ['saveStatementVi', 'statementVi']]) {
      api[method] = (id, text) => store.setFile(id, kind, text);
    }
    api.updateProblem = (id, patch) => store.updateProblem(id, patch);
    await app.applyStatementLanguage();
    await app.persistActiveStatementVariant(vietnamese);
    const persisted = {
      statement: await store.getFile(meta.id, 'statement'),
      statementEn: await store.getFile(meta.id, 'statementEn'),
      statementVi: await store.getFile(meta.id, 'statementVi'),
      statementSourceLanguage: (await store.readMeta(meta.id)).statementSourceLanguage,
    };
    assert.equal(persisted.statement, english);
    assert.equal(persisted.statementVi, vietnamese);
    assert.equal(persisted.statementSourceLanguage, 'en');
    const reopened = harness(persisted);
    await reopened.app.applyStatementLanguage();
    reopened.app.state.statementLanguageMode = 'source';
    await reopened.app.applyStatementLanguage();
    assert.equal(reopened.field.value, english);
    assert.deepEqual((await store.listTests(meta.id)).map(t => t.oracle), before.map(t => t.oracle));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('typing during a pending translation prevents stale display and disk writes', async () => {
  let finish;
  const { app, writes, field } = harness({}, () => new Promise(resolve => { finish = resolve; }));
  const pending = app.applyStatementLanguage();
  field.value = english + '\nUnsaved edit';
  finish({ statement: vietnamese });
  await pending;
  assert.equal(field.value, english + '\nUnsaved edit');
  assert.equal(writes.length, 0);
});

test('switching to the source persists unsaved translation edits without replacing the original', async () => {
  const { app, disk, field } = harness({ statementVi: vietnamese });
  await app.applyStatementLanguage();
  field.value += '\nTranslation edit';
  app.state.statementLanguageMode = 'source';
  await app.applyStatementLanguage();
  assert.equal(disk.statement, english);
  assert.equal(disk.statementVi, vietnamese + '\nTranslation edit');
  assert.equal(field.value, english);
});

test('the actual analysis pipeline sends source text while retaining the displayed translation', async () => {
  const { app, api, disk, field } = harness({ statementVi: vietnamese });
  await app.applyStatementLanguage();
  let payload;
  api.aiProcess = async body => { payload = body; return { samples: [], tests: [] }; };
  app.el.genTestsCard = { classList: { add() {}, remove() {} }, innerHTML: '' };
  app.getEditorValue = () => '// synthetic';
  const pipelineSource = await fs.readFile(new URL('../src/statement.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    app, api, AbortController, hashOf: text => text, busyStatus() {}, renderStatement() {},
    refreshExamples() {}, renderExamples() {}, renderGenTests() {}, status() {}, escapeHtml: text => text,
  });
  vm.runInContext(pipelineSource.slice(pipelineSource.indexOf('async function runPipeline('), pipelineSource.indexOf('// OCR an image/PDF'))
    + '\nglobalThis.finished = runPipeline(app);', context);
  await context.finished;
  assert.equal(payload.statement, english);
  assert.equal(field.value, vietnamese);
  assert.equal(app.state.savedStatement, vietnamese);
  assert.equal(disk.statement, english);
});

test('typing the first Vietnamese source records its language rather than the empty default', async () => {
  const { app, disk } = harness({ statement: '' });
  await app.persistActiveStatementVariant(vietnamese);
  assert.equal(disk.statement, vietnamese);
  assert.equal(disk.statementSourceLanguage, 'vi');
  assert.equal(disk.statementVi, vietnamese);
});
