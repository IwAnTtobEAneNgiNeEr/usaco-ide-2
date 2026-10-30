import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { statementTruthLabel } from '../src/statement.js';
import { renderMeta } from '../src/editor.js';

// Pure backend projection, no store/server/compiler/provider imports.
const require = createRequire(import.meta.url);
const model = require('../../backend/src/verifiedArtifact.js');
const priorAc = { type: 'judge', verdict: 'AC', id: 'accepted', at: '2026-01-01T00:00:00.000Z', judgeFingerprint: 'revision-a' };
function metadata(history, fingerprint, rawHistory = history) {
  return { title: 'Synthetic problem', history: rawHistory, truth: model.buildContract({ history, currentFingerprint: fingerprint }) };
}

test('statement brief follows current AC, unsaved code, changed inputs, WA and reload', () => {
  const current = metadata([priorAc], 'revision-a');
  assert.match(statementTruthLabel(current), /AC hiện tại/);
  assert.match(statementTruthLabel(current, true), /chưa lưu.*Judge lại/i);
  const stale = metadata([priorAc], 'revision-b');
  assert.match(statementTruthLabel(stale), /Judge lại.*từng AC/i);
  assert.doesNotMatch(statementTruthLabel(stale), /AC hiện tại|Đã giải/);
  const failed = metadata([priorAc, { type: 'judge', verdict: 'WA', id: 'failed', at: '2026-01-02T00:00:00.000Z', judgeFingerprint: 'revision-b' }], 'revision-b');
  assert.match(statementTruthLabel(failed), /WA hiện tại/);
  assert.match(statementTruthLabel(failed), /từng AC/i);
  assert.doesNotMatch(statementTruthLabel(failed), /chưa xác nhận/);
  // A reload reconstructs metadata from the same immutable evidence.
  assert.equal(statementTruthLabel(JSON.parse(JSON.stringify(stale))), statementTruthLabel(stale));
  assert.equal(statementTruthLabel(JSON.parse(JSON.stringify(failed))), statementTruthLabel(failed));
  assert.deepEqual(current.history, [priorAc]);
});

test('legacy full Judge AC remains historical without granting current AC', () => {
  const legacy = metadata([{ verdict: 'AC', at: priorAc.at }], 'revision-b');
  assert.match(statementTruthLabel(legacy), /từng AC/i);
  assert.doesNotMatch(statementTruthLabel(legacy), /AC hiện tại|Đã giải/);
});

for (const entry of [
  { type: 'run', verdict: 'AC' },
  { type: 'judge', verdict: 'AC', cancelled: true },
  { type: 'judge', verdict: 'AC', scope: 'single' },
  { type: 'judge', verdict: 'AC', scope: 'scratch' },
  { type: 'defense', verdict: 'AC' },
]) {
  test(`non-full acceptance does not become historical AC: ${JSON.stringify(entry)}`, () => {
    // The backend excludes these entries from its Judge projection; the raw
    // history may still include them for inspection.
    const meta = metadata([], 'revision-b', [entry]);
    assert.doesNotMatch(statementTruthLabel(meta), /từng AC|AC hiện tại|Đã giải/i);
    assert.deepEqual(meta.history, [entry]);
  });
}

test('unverified/manual solved/Run-only states do not manufacture Judge acceptance', () => {
  for (const meta of [{}, { status: 'solved', lastVerdict: 'AC' }, metadata([], 'revision-b'), metadata([], 'revision-b', [{ type: 'run', verdict: 'AC' }])]) {
    assert.doesNotMatch(statementTruthLabel(meta), /từng AC|AC hiện tại|Đã giải/i);
  }
});

test('stale without any prior AC requests Judge again without inventing history', () => {
  const meta = metadata([{ type: 'judge', verdict: 'WA', judgeFingerprint: 'revision-a' }], 'revision-b');
  assert.match(statementTruthLabel(meta), /Judge lại/);
  assert.doesNotMatch(statementTruthLabel(meta), /từng AC|AC hiện tại/i);
});

test('live metadata/dirty updates remove current-AC styling and restore it only on current verification', async () => {
  const source = await readFile(new URL('../src/statement.js', import.meta.url), 'utf8');
  const start = source.indexOf('function updateStatementTruthStatus(');
  const context = { statementTruthLabel };
  vm.runInNewContext(source.slice(start, source.indexOf('// ---- Statement reading page', start)) + '\nglobalThis.update = updateStatementTruthStatus;', context);
  const classes = new Set();
  const badge = { textContent: '', hidden: false, classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } } };
  const app = {
    state: { meta: metadata([priorAc], 'revision-a'), dirty: false },
    el: { metaTitle: {}, currentTitle: {}, metaChips: {}, statementRendered: { querySelector: () => badge } },
  };
  app.updateStatementTruthStatus = () => context.update(app);
  renderMeta(app);
  assert.match(badge.textContent, /AC hiện tại/);
  assert.ok(classes.has('stmt-brief-solved'));
  app.state.dirty = true;
  renderMeta(app);
  assert.match(badge.textContent, /chưa lưu/);
  assert.ok(!classes.has('stmt-brief-solved'));
  app.state.dirty = false;
  app.state.meta = metadata([priorAc], 'revision-b');
  renderMeta(app);
  assert.match(badge.textContent, /Judge lại/);
  assert.ok(!classes.has('stmt-brief-solved'));
  app.state.meta = metadata([], 'revision-b');
  renderMeta(app);
  assert.equal(badge.hidden, true);
  app.state.meta = metadata([priorAc], 'revision-a');
  renderMeta(app);
  assert.equal(badge.hidden, false);
  assert.ok(classes.has('stmt-brief-solved'));
});
