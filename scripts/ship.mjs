import { fileURLToPath } from 'node:url';
import { parseArgs, readPlan, runCli } from './read-plan.mjs';

// Ship an approved plan: re-read, re-decide, compare the digest, write once, read back.
export function parseShipArgs(args) {
  const i = args.indexOf('--approve');
  const approve = i >= 0 ? args[i + 1] : undefined;
  if (!/^[0-9a-f]{64}$/.test(approve ?? '')) throw new Error('--approve <approval_digest from npm run plan> is required');
  return { ...parseArgs([...args.slice(0, i), ...args.slice(i + 2)]), approve };
}

export async function ship({ approve, ...context }, { run = runCli, now } = {}) {
  const decision = await readPlan(context, { run, now });
  if (decision.status !== 'approval_required') throw new Error(`Nothing to ship: status is ${decision.status}, not approval_required`);
  if (decision.approval_digest !== approve) {
    throw new Error('Approval no longer matches the current experiment state; run plan again and re-approve');
  }
  const base = `api/v1/environments/${context.environment}/experiments/${context.experiment}/`;
  const { variant_id } = decision.plan;
  await run('flagsmith', ['api', `${base}complete/`, '--method', 'POST',
    '-f', 'rollout_decision=variant', '-F', `rollout_variant=${variant_id}`, '--json', '--no-input']);
  const after = JSON.parse(await run('flagsmith', ['api', base, '--method', 'GET', '--json', '--no-input']));
  const verified = { status: after?.status, rollout_decision: after?.rollout_decision, rollout_variant: after?.rollout_variant };
  if (verified.status !== 'completed' || verified.rollout_decision !== 'variant' || verified.rollout_variant !== variant_id) {
    // The write was sent; never report success or retry blindly.
    throw new Error(`Write sent but NOT verified: ${JSON.stringify(verified)}. Inspect the experiment in Flagsmith before any retry.`);
  }
  return { ...decision, status: 'shipped', reason: 'Approved plan applied and read back', writes_executed: 1, verified };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await ship(parseShipArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
