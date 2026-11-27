// Synthetic demo traffic for the disposable experiment only (labelled synthetic everywhere).
import { createFlagsmithInstance } from '@flagsmith/flagsmith/isomorphic';
const env = process.argv[2], n = +process.argv[3], run = process.argv[4];
const rate = { control: 0.12, outcome: 0.30 };
const tally = { control: [0, 0], outcome: [0, 0], none: 0 };
for (let i = 0; i < n; i++) {
  const fs = createFlagsmithInstance();
  await fs.init({ environmentID: env, enableEvents: true, identity: `synthetic-${run}-${i}`, fetch });
  const f = fs.getExperimentFlag('ship_demo_cta_v2');
  const arm = f?.value === 'Get a quote today' ? 'outcome' : f?.value === 'Contact us' ? 'control' : null;
  if (!arm) { tally.none++; await fs.flushEvents(); continue; }
  tally[arm][0]++;
  if (Math.random() < rate[arm]) { fs.trackEvent('demo_click'); tally[arm][1]++; }
  await fs.flushEvents();
}
console.log(JSON.stringify(tally));
