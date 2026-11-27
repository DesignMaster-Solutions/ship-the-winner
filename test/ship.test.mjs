import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPlan } from '../scripts/read-plan.mjs';
import { ship, parseShipArgs } from '../scripts/ship.mjs';

const experiment = JSON.parse(readFileSync(new URL('./fixtures/experiment.json', import.meta.url)));
const results = JSON.parse(readFileSync(new URL('./fixtures/results.json', import.meta.url)));
const context = { environment: 'test-env', experiment: 525, metric: 509, flag: 'cta_text' };
const now = Date.parse(results.as_of) + 1000;

// Fake Flagsmith: serves the experiment and results, records every call, applies `complete` like the API.
function fakeApi({ probability = .97, verifyAs = 'variant', verifyVariant = 36795 } = {}) {
  const state = structuredClone({ experiment, results });
  state.results.payload.metrics[0].inference.outcome = { chance_to_win: probability, lift: .2, ci_low: .01, ci_high: .5 };
  const calls = [];
  const run = async (binary, args) => {
    calls.push(args);
    assert.equal(binary, 'flagsmith');
    const [, path] = args;
    if (path.endsWith('/complete/')) {
      state.experiment.status = 'completed';
      state.experiment.rollout_decision = verifyAs;
      state.experiment.rollout_variant = verifyAs === 'variant' ? verifyVariant : null;
      return JSON.stringify(state.experiment);
    }
    return JSON.stringify(path.endsWith('/results/') ? { results: state.results } : state.experiment);
  };
  return { state, calls, run, writes: () => calls.filter(a => a.includes('POST')) };
}

test('approved plan completes the experiment with the variant and reads it back', async () => {
  const api = fakeApi();
  const { approval_digest } = await readPlan(context, { run: api.run, now });
  assert.match(approval_digest, /^[0-9a-f]{64}$/);
  api.calls.length = 0;
  const record = await ship({ ...context, approve: approval_digest }, { run: api.run, now });
  assert.equal(record.status, 'shipped');
  assert.equal(record.writes_executed, 1);
  assert.equal(record.verified.rollout_variant, 36795);
  assert.equal(api.writes().length, 1);
  const post = api.writes()[0];
  assert.ok(post[1].endsWith('/experiments/525/complete/'));
  assert.deepEqual(post.slice(2), ['--method', 'POST', '-f', 'rollout_decision=variant', '-F', 'rollout_variant=36795', '--json', '--no-input']);
});

test('wrong digest or a result that changed after approval writes nothing', async () => {
  const api = fakeApi();
  await assert.rejects(ship({ ...context, approve: 'f'.repeat(64) }, { run: api.run, now }), /no longer matches/);
  const { approval_digest } = await readPlan(context, { run: api.run, now });
  api.state.results.as_of = new Date(now - 500).toISOString(); // new snapshot arrived after the human said yes
  await assert.rejects(ship({ ...context, approve: approval_digest }, { run: api.run, now }), /no longer matches/);
  assert.equal(api.writes().length, 0);
});

test('below threshold or a concurrently completed experiment never writes', async () => {
  const low = fakeApi({ probability: .9 });
  await assert.rejects(ship({ ...context, approve: 'a'.repeat(64) }, { run: low.run, now }), /approval_required/);
  const done = fakeApi();
  const { approval_digest } = await readPlan(context, { run: done.run, now });
  done.state.experiment.status = 'completed';
  await assert.rejects(ship({ ...context, approve: approval_digest }, { run: done.run, now }), /running/);
  assert.equal(low.writes().length + done.writes().length, 0);
});

test('a write the API did not apply as planned fails loudly instead of claiming success', async () => {
  const api = fakeApi({ verifyAs: 'control' });
  const { approval_digest } = await readPlan(context, { run: api.run, now });
  await assert.rejects(ship({ ...context, approve: approval_digest }, { run: api.run, now }), /NOT verified/);
  const other = fakeApi({ verifyVariant: 99999 });
  const second = await readPlan(context, { run: other.run, now });
  await assert.rejects(ship({ ...context, approve: second.approval_digest }, { run: other.run, now }), /NOT verified/);
});

test('ship refuses missing or malformed approval before any request', () => {
  const valid = ['--environment', 'test-env', '--experiment', '525', '--metric', '509', '--flag', 'cta_text'];
  assert.throws(() => parseShipArgs(valid), /approve/);
  assert.throws(() => parseShipArgs([...valid, '--approve', 'yes']), /approve/);
  assert.throws(() => parseShipArgs([...valid, '--approve', 'a'.repeat(64), '--yes']));
  assert.equal(parseShipArgs([...valid, '--approve', 'a'.repeat(64)]).approve, 'a'.repeat(64));
});
