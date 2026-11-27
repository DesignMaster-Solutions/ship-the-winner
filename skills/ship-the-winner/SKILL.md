---
name: ship-the-winner
description: Finish a Flagsmith experiment safely with the Flagsmith CLI. Reads the running experiment's results, applies the decision rule written before the test, prints the exact rollout it would make, waits for a human yes, then rolls the winner out with the same flag and writes a decision record. Use when asked to end, read, call or ship the winner of a Flagsmith A/B test.
---

# Ship the winner

Outline (Nov 26). Each step becomes a tested CLI call before the deadline.

1. Context: `flagsmith config --json` (project, environment). Stop if no project is bound.
2. Find the experiment for the flag: `flagsmith api` GET on the project's experiments, filtered with `--jq` to the one whose feature name matches and status is running.
3. Results: `flagsmith api` GET on that experiment's results, `--jq` down to arms, exposures, conversions and win probability.
4. Decide with the rule given by the user (default: ship only if a variant has at least 95% win probability). Below the bar: report "inconclusive", list the numbers, change nothing, stop.
5. Plan: print flag, environment, current value, new value. Do not write.
6. Ask the human. Only an explicit yes continues. Under `--no-input`, stop here.
7. Ship with the same flag (no redeploy), then read the flag back with `flagsmith evaluate` and confirm the new value.
8. Write `decisions/<flag>-<date>.md`: hypothesis, numbers, rule, decision, approver.
