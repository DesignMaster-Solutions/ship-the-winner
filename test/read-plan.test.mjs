import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, readPlan, parseArgs } from '../scripts/read-plan.mjs';

const experiment = JSON.parse(readFileSync(new URL('./fixtures/experiment.json', import.meta.url)));
const results = JSON.parse(readFileSync(new URL('./fixtures/results.json', import.meta.url)));
const context = { environment: 'test-env', experiment: 525, metric: 509, flag: 'cta_text' };
const now = Date.parse(results.as_of) + 1000;
const input = () => structuredClone({ experiment, results });
function winning(probability = .95) {
  const data = input();
  data.results.payload.metrics[0].inference.outcome = { chance_to_win: probability, lift: .2, ci_low: .01, ci_high: .5 };
  return data;
}

test('real export is inconclusive; preserves raw counts and makes no rollout plan', () => {
  const decision = decide(input(), context, now);
  assert.equal(decision.status, 'inconclusive');
  assert.equal(decision.plan, null);
  assert.deepEqual(decision.arms.map(a => a.exposures), [4, 2]);
});
test('95% is inclusive; below 95% never proposes rollout; current value is the rollout value', () => {
  assert.equal(decide(winning(.94999), context, now).plan, null);
  const decision = decide(winning(), context, now);
  assert.equal(decision.status, 'approval_required');
  assert.equal(decision.plan.before, 'Start a project');
  assert.equal(decision.plan.after, 'Get a quote today');
  assert.equal(decision.writes_executed, 0);
});
test('invalid probability, wrong metric/flag/id, stale and failed results fail closed', () => {
  for (const probability of [95, -1, '0.99', NaN]) {
    assert.throws(() => decide(winning(probability), context, now));
  }
  for (const change of [{ metric: 999 }, { flag: 'other' }, { experiment: 526 }]) {
    assert.throws(() => decide(input(), { ...context, ...change }, now));
  }
  assert.throws(() => decide(input(), context, now + 25 * 3600_000), /stale/);
  const failed = input(); failed.results.last_error_at = results.as_of;
  assert.throws(() => decide(failed, context, now), /failed/);
});
test('no results is a pending decision, not a manufactured winner', () => {
  assert.equal(decide({ experiment, results: null }, context, now).status, 'pending');
});
test('sample-ratio mismatch blocks even before inference is available', () => {
  const data = input(); data.results.payload.srm_p_value = .0001;
  assert.equal(decide(data, context, now).status, 'blocked');
});
test('invalid counts and unsupported multi-arm experiments do not produce plans', () => {
  const data = winning(); data.results.payload.metrics[0].variants.outcome.n = -1;
  assert.throws(() => decide(data, context, now), /counts/);
  const multi = winning(); multi.experiment.feature.multivariate_options.push({ key: 'third' });
  assert.throws(() => decide(multi, context, now), /two-arm/);
});
test('CLI adapter performs only two explicit GETs even with a winner', async () => {
  const calls = [];
  const data = winning();
  const run = async (binary, args) => {
    calls.push({ binary, args });
    return JSON.stringify(args[1].endsWith('/results/') ? { results: data.results } : data.experiment);
  };
  const decision = await readPlan(context, { run, now });
  assert.equal(decision.status, 'approval_required');
  assert.equal(calls.length, 2);
  for (const { binary, args } of calls) {
    assert.equal(binary, 'flagsmith');
    assert.deepEqual(args.slice(2), ['--method', 'GET', '--json', '--no-input']);
  }
});
test('write/approval flags, traversal and incomplete context are refused before execution', () => {
  const valid = ['--environment', 'test-env', '--experiment', '525', '--metric', '509', '--flag', 'cta_text'];
  assert.deepEqual(parseArgs(valid), context);
  for (const flag of ['--apply', '--yes', '--approve', '--method']) assert.throws(() => parseArgs([...valid, flag]));
  assert.throws(() => parseArgs(valid.map(v => v === 'test-env' ? '../other' : v)));
  assert.throws(() => parseArgs([]));
});
test('a result computed during the GETs is compared to the time after the reads', async () => {
  const data = winning();
  const run = async (_binary, args) => {
    if (!args[1].endsWith('/results/')) return JSON.stringify(data.experiment);
    await new Promise(resolve => setTimeout(resolve, 10));
    data.results.as_of = new Date().toISOString();
    return JSON.stringify({ results: data.results });
  };
  assert.equal((await readPlan(context, { run })).status, 'approval_required');
});
