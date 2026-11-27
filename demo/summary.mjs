// Prints the plan record of the disposable demo as the short table used in the video.
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const row = (k, v) => console.log(k.padEnd(14) + v);
row('status', p.status); row('chance_to_win', p.chance_to_win.toFixed(4));
for (const a of p.arms) row(a.arm, `${a.conversions}/${a.exposures} clicked`);
row('before', p.plan.before); row('after', p.plan.after);
row('digest', p.approval_digest.slice(0, 16) + '...'); row('writes', p.writes_executed);
