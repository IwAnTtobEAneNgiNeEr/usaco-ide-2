// Real UI handlers -> real problem store -> real /process handler with mocked
// router, provider and reference verifier. No HTTP server, network or compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { escapeHtml } from '../src/md.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'w1-synth-'));
process.env.USACO_IDE_USER_DATA_DIR = root;
const require = createRequire(import.meta.url);
const store = require('../../backend/src/problemStore.js');
const ai = require('../../backend/src/ai.js');
const trust = require('../../backend/src/trustLayer.js');
const oracle = require('../../backend/src/oracleTrust.js');
test.after(() => fs.rm(root, { recursive: true, force: true }));
const original = '# Sum\nPrint the sum.\n\n## Input\n```\n1 2\n```\n## Output\n```\n3\n```';
const result = { baiNangCap: 'Now sum up to one million integers.', rangBuocMoi: 'N <= 1000000', kyThuatMoi: 'Prefix sum' };
const frontend = (await fs.readFile(new URL('../src/features/synthesizer.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const routes = await fs.readFile(new URL('../../backend/src/routes/ai.js', import.meta.url), 'utf8');
function node() {
  const listeners = new Map();
  const classes = new Set();
  return {
    textContent: 'Synthesize', innerHTML: '', disabled: false,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
    addEventListener(event, fn) { listeners.set(event, fn); },
    click() { if (!this.disabled) return listeners.get('click')?.({ target: this }); },
  };
}
async function fixture() {
  const source = await store.createProblem({ title: 'Synthetic original', source: 'Self authored', statement: original });
  const nodes = Object.fromEntries(['btn-synth', 'synth-modal', 'synth-body', 'synth-create', 'synth-regen', 'synth-close'].map(id => [id, node()]));
  nodes['synth-modal'].querySelector = selector => nodes[selector.slice(1)];
  const created = [];
  const notices = [];
  const api = {
    aiSynthesize: async () => ({ result }),
    createProblem: async body => { const problem = await store.createProblem(body); created.push(problem.id); return { problem }; },
  };
  const app = {
    state: { currentId: source.id, meta: source }, el: { ioStatement: { value: original } },
    refreshProblems: async () => {}, selectProblem: async () => {}, toast: message => notices.push(message),
    runStatementPipeline: () => {},
  };
  vm.runInNewContext(frontend + '\ninitSynthesizer(app);', {
    api, app, escapeHtml, AbortController, document: { getElementById: id => nodes[id] },
  });
  return { source, app, api, created, nodes, notices };
}
function processHandler() {
  const handlers = new Map();
  const router = { post(url, ...callbacks) { handlers.set(url, callbacks.at(-1)); }, get() {} };
  let verified = 0;
  const dependencies = {
    express: { Router: () => router },
    '../settingsStore': { getAiSettings: async () => ({ apiKey: 'mock' }), getSettings: async () => ({}) },
    '../problemStore': store, '../fileStore': {}, '../markitdown': {}, '../ocr': {}, '../illustration': {},
    '../verifyTests': { verifyWithReference: async () => { verified++; return { note: 'Mock: no reference executed' }; } },
    '../config': {}, '../trustLayer': trust, './_util': { asyncHandler: fn => fn },
    '../ai': { extractSamples: ai.extractSamples, log() {}, analyzeStatement: async () => ({}), generateTests: async () => ({
      tests: [{ input: '1 2\n', expected: '3\n', expectedKnown: true, oracleState: 'trusted', verifiedBy: 'client claim', confidence: 1 }], notes: [],
    }) },
    crypto: require('node:crypto'), path: require('node:path'),
  };
  vm.runInNewContext(routes, { module: { exports: {} }, require(name) {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  } });
  return async id => {
    let output;
    const res = { json(value) { output = value; return this; }, status() { return this; } };
    await handlers.get('/process')({ body: { problemId: id } }, res);
    assert.ok(output?.ok);
    return { output, verified };
  };
}

// Exercise Judge input selection while replacing only compiler identity. The
// engine hashes runner source bytes but never imports/executes a compiler.
async function captureJudgeInputs(id) {
  const source = await fs.readFile(new URL('../../backend/src/judgeState.js', import.meta.url), 'utf8');
  const dependencies = {
    'node:fs': require('node:fs'), 'node:os': require('node:os'),
    './judgeFingerprint': require('../../backend/src/judgeFingerprint.js'),
    './compilerIdentity': { getCompilerIdentity: async () => ({ digest: 'synthetic-toolchain', unverifiable: false }) },
    './fileStore': require('../../backend/src/fileStore.js'), './problemStore': store,
    './settingsStore': { getSettings: async () => ({}) },
  };
  const mockRequire = name => {
    assert.ok(name in dependencies, `Unexpected Judge import: ${name}`);
    return dependencies[name];
  };
  mockRequire.resolve = name => {
    assert.ok(['./runCpp', './judgeService'].includes(name));
    return new URL(`../../backend/src/${name.slice(2)}.js`, import.meta.url).pathname;
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: mockRequire, process });
  return module.exports.capture(id);
}

test('actual synth create persists AI provenance; copied sample stays candidate through process/add/reload', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  await f.nodes['synth-create'].click();
  assert.equal(f.created.length, 1);
  const meta = await store.readMeta(f.created[0]);
  assert.equal(meta.origin, 'ai-generated');
  assert.equal(meta.derivedFrom.id, f.source.id);
  assert.equal(meta.derivedFrom.title, f.source.title);
  const statement = await store.getFile(meta.id, 'statement');
  assert.ok(statement.includes(original));
  assert.ok(statement.includes(result.baiNangCap));
  const { output, verified } = await processHandler()(meta.id);
  assert.equal(verified, 1); // stub only, no compiler
  assert.equal(output.tests[0].oracleState, 'candidate');
  assert.equal(output.tests[0].expectedKnown, false);
  assert.equal(output.tests[0].provenance, 'generated-unverified');
  const cached = await processHandler()(meta.id);
  assert.equal(cached.output.cached, true);
  assert.equal(cached.verified, 0);
  assert.equal(cached.output.tests[0].oracleState, 'candidate');
  assert.equal((await store.readMeta(meta.id)).origin, 'ai-generated');
  const added = await store.addTest(meta.id, { ...output.tests[0], generatedBy: 'ai', oracle: { state: 'trusted', method: 'user-reviewed' } });
  assert.equal((await store.listTests(meta.id))[0].oracle.state, 'candidate');
  const excluded = await captureJudgeInputs(meta.id);
  assert.equal(excluded.candidateCount, 1);
  assert.equal(excluded.tests.length, 0);
  await assert.rejects(store.trustTest(meta.id, added.id, { method: 'user-reviewed', contentHash: 'stale' }), { status: 409 });
  await store.trustTest(meta.id, added.id, { method: 'user-reviewed', contentHash: oracle.contentHash(added) });
  const reviewed = (await store.listTests(meta.id))[0];
  assert.equal(reviewed.oracle.state, 'trusted');
  assert.equal(reviewed.oracle.method, 'user-reviewed');
  assert.equal((await captureJudgeInputs(meta.id)).tests.length, 1);
});

test('non-AI sample retains statement-sample trust through process and store', async () => {
  const f = await fixture();
  const { output } = await processHandler()(f.source.id);
  assert.equal(output.tests[0].oracleState, 'trusted');
  assert.equal(output.tests[0].provenance, 'official-sample');
  await store.addTest(f.source.id, { ...output.tests[0], generatedBy: 'ai' });
  assert.equal((await store.listTests(f.source.id))[0].oracle.method, 'statement-sample');
});

test('create with AI origin cannot seed trusted tests through client flags', async () => {
  const meta = await store.createProblem({ title: 'Synthetic AI seeded tests', statement: original, origin: 'ai-generated', tests: [{
    input: '1 2', expected: '3', generatedBy: 'manual', expectedKnown: true, provenance: 'official-sample',
    oracle: { state: 'trusted', method: 'user-reviewed' },
  }] });
  assert.equal((await store.listTests(meta.id))[0].oracle.state, 'candidate');
});

test('result for one problem cannot be created with another problem as its source', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  f.app.state.currentId = 'different-source';
  f.app.state.meta = { id: 'different-source', title: 'Other source' };
  await f.nodes['synth-create'].click();
  assert.equal(f.created.length, 0);
});

test('AI notice is rendered beside the variant and after creating it', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  assert.match(f.nodes['synth-body'].innerHTML, /AI/);
  assert.match(f.nodes['synth-body'].innerHTML, /review|xem xét|kiểm duyệt/);
  await f.nodes['synth-create'].click();
  assert.ok(f.notices.some(message => /AI/.test(message) && /review|xem xét|kiểm duyệt/.test(message)));
});

test('a copied source sample is not auto-trusted for a synth variant', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  await f.nodes['synth-create'].click();
  const { output } = await processHandler()(f.created[0]);
  assert.equal(output.tests[0].oracleState, 'candidate');
});

test('a failed regeneration cannot reuse the previous result for creation', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  f.api.aiSynthesize = async () => { throw new Error('mock provider failure'); };
  await f.nodes['synth-regen'].click();
  await f.nodes['synth-create'].click();
  assert.equal(f.created.length, 0);
});

test('the statement brief shows the persisted AI origin, source link and review notice', async () => {
  const f = await fixture();
  await f.nodes['btn-synth'].click();
  await f.nodes['synth-create'].click();
  const meta = await store.readMeta(f.created[0]);
  const statementJs = await fs.readFile(new URL('../src/statement.js', import.meta.url), 'utf8');
  const start = statementJs.indexOf('  const briefParts = [');
  const brief = statementJs.slice(start, statementJs.indexOf('  const descHtml =', start));
  const renderBrief = meta => vm.runInNewContext(brief + '\nbriefMetaHtml;', {
    meta, escapeHtml, solvedChip: '', briefSrc: meta.source, briefOriginLabels: { 'ai-generated': 'AI tạo' },
  });
  const html = renderBrief(meta);
  assert.match(html, /AI tạo/);
  assert.match(html, /test cần được xem xét/);
  assert.ok(html.includes(`data-open-problem="${f.source.id}"`));
  assert.ok(html.includes(f.source.title));
  assert.doesNotMatch(renderBrief({ origin: 'user-authored' }), /test cần được xem xét/);
});
