import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const MAX_AGE_MS = 24 * 3600_000;
const THRESHOLD = .95; // The First Click decision rule, chosen before the experiment.
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
export function validateContext(context) {
  requireThat(/^[A-Za-z0-9_-]+$/.test(context.environment ?? ''), 'Invalid environment');
  requireThat(/^[A-Za-z0-9_-]+$/.test(context.flag ?? ''), 'Invalid flag');
  for (const key of ['experiment', 'metric']) {
    requireThat(Number.isSafeInteger(context[key]) && context[key] > 0, `Invalid ${key}`);
  }
}
export function parseArgs(args) {
  const context = {};
  const allowed = new Set(['--environment', '--experiment', '--metric', '--flag']);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    requireThat(allowed.has(key) && args[i + 1] && !(key.slice(2) in context), `Unsupported or duplicate argument: ${key}`);
    context[key.slice(2)] = ['--experiment', '--metric'].includes(key) ? Number(args[i + 1]) : args[i + 1];
  }
  validateContext(context);
  return context;
}

export function decide({ experiment, results }, context, now = Date.now()) {
  validateContext(context);
  requireThat(experiment?.id === context.experiment && experiment?.feature?.name === context.flag, 'Experiment or flag mismatch');
  requireThat(experiment.status === 'running', 'Experiment must be running');
  const options = experiment.feature.multivariate_options;
  requireThat(options?.length === 1 && options[0].key && options[0].key !== 'control', 'Only keyed two-arm experiments are supported');
  const metricConfig = experiment.metrics?.find(m => m.metric === context.metric);
  requireThat(metricConfig?.aggregation === 'occurrence' && metricConfig.expected_direction === 'increase', 'Expected an increasing occurrence metric');
  requireThat(options[0].type === 'unicode' && typeof options[0].string_value === 'string', 'Expected a string variant');
  const before = experiment.experiment_rollout?.feature_state_value;
  requireThat(before?.type === 'string' && typeof before.value === 'string', 'Missing current rollout value');
  const report = {
    ...context, as_of: results?.as_of ?? null, threshold: THRESHOLD,
    status: 'pending', reason: 'Results have not been computed', arms: [], plan: null,
    writes_executed: 0,
    limitation: 'Raw warehouse counts include QA visits. No corrected probability is inferred. Review QA contamination and other metrics before any rollout.',
  };
  if (!results) return report;
  requireThat(!results.last_error_at, 'Results refresh failed; investigate before deciding');
  if (!results.payload) return report;
  const timestamp = Date.parse(results.as_of);
  requireThat(Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= MAX_AGE_MS, 'Results are stale or have an invalid timestamp');
  const metric = results.payload.metrics?.find(m => m.metric_id === context.metric);
  requireThat(metric, 'Metric missing from results');
  const keys = ['control', options[0].key];
  requireThat(Object.keys(metric.variants ?? {}).length === 2, 'Unexpected result arms');
  report.arms = keys.map(arm => {
    const stats = metric.variants[arm];
    requireThat(stats && Number.isSafeInteger(stats.n) && stats.n >= 0 && Number.isFinite(stats.sum) && stats.sum >= 0 && stats.sum <= stats.n, 'Invalid occurrence counts');
    return { arm, exposures: stats.n, conversions: stats.sum };
  });
  report.status = 'inconclusive';
  report.reason = 'No inference yet; leave the running experiment unchanged';
  const srm = results.payload.srm_p_value;
  requireThat(srm == null || (Number.isFinite(srm) && srm >= 0 && srm <= 1), 'Invalid sample-ratio statistic');
  if (srm != null && srm < .01) {
    report.status = 'blocked'; report.reason = 'Sample-ratio mismatch requires investigation'; return report;
  }
  const inference = metric.inference?.[options[0].key];
  if (inference == null) return report;
  const chance = inference.chance_to_win;
  requireThat(typeof chance === 'number' && Number.isFinite(chance) && chance >= 0 && chance <= 1, 'Invalid win probability');
  requireThat(report.arms.every(arm => arm.exposures > 0), 'Inference has no exposures');
  report.chance_to_win = chance;
  report.reason = 'Below the predeclared 95% threshold; change nothing';
  if (chance < THRESHOLD) return report;
  report.status = 'approval_required';
  report.reason = 'Threshold reached; review the proposal. This command cannot apply it.';
  report.plan = { before: before.value, after: options[0].string_value, variant: options[0].key, variant_id: options[0].id };
  report.approval_digest = planDigest(report);
  return report;
}

// The human approves this digest; ship.mjs recomputes it from fresh reads, so any change in between voids the approval.
export function planDigest(r) {
  const bound = [r.environment, r.experiment, r.flag, r.metric, r.as_of, r.chance_to_win, r.plan];
  return createHash('sha256').update(JSON.stringify(bound)).digest('hex');
}
export async function runCli(binary, args) {
  try {
    const { stdout } = await execute(binary, args, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  } catch {
    // CLI stderr may contain credentials or response bodies; keep it out of the record.
    throw new Error('Flagsmith read failed. Check flagsmith auth status and the selected environment.');
  }
}
export async function readPlan(context, { run = runCli, now } = {}) {
  validateContext(context);
  const base = `api/v1/environments/${context.environment}/experiments/${context.experiment}/`;
  const get = async path => JSON.parse(await run('flagsmith', ['api', path, '--method', 'GET', '--json', '--no-input']));
  const experiment = await get(base);
  // Refuse mismatched context before reading results.
  requireThat(experiment?.id === context.experiment && experiment?.feature?.name === context.flag, 'Experiment or flag mismatch');
  const envelope = await get(`${base}results/`);
  requireThat(envelope && Object.hasOwn(envelope, 'results'), 'Unexpected results response');
  return decide({ experiment, results: envelope.results }, context, now ?? Date.now());
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await readPlan(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
