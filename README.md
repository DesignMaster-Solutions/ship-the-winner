# Ship the Winner: an Agent Skill that finishes a Flagsmith experiment

Agent module of [First Click](https://github.com/DesignMaster-Solutions/first-click), our **single project** for Toggle Wars (WeMakeDevs, Nov 26-29, 2026). The same project can enter Tracks 01, 02 and 04. [Rules 01 and 05](https://www.wemakedevs.org/hackathons/flagsmith/rules) allow one project per team and multiple tracks per project; this repository is a component, not a second submission.

Status (Nov 27, 2026): read/decide/propose and approve/ship/verify work through Flagsmith CLI 2.0.0 with tests. `plan` performs two GETs and never writes. `ship` writes once, only with the approval digest printed by `plan`, after re-reading and re-deciding. The live First Click experiment is still inconclusive, so `ship` against it refuses with exit 1 and no write. The demo video is still pending.

## The job it finishes

Starting an experiment is one prompt. Ending it well is where teams stall: someone has to read the result, decide if it is good enough, roll the winner out with the same flag, and clean up. This skill takes a coding agent through that last mile with the Flagsmith CLI:

1. **Read**: find the running experiment for a flag and pull its current results (`flagsmith api`, read only).
2. **Judge**: apply a decision rule written down before the test (ship only at 95% win probability or more; otherwise report "inconclusive" and change nothing).
3. **Plan**: print the exact change it would make (flag, environment, value before and after) and stop.
4. **Approve / ship / verify**: `plan` prints `approval_digest`, a SHA-256 over environment, experiment, flag, metric, result timestamp, win probability and the before/after values. `npm run --silent ship -- <same args> --approve <digest>` re-reads both endpoints, re-runs the rule and refuses unless the fresh digest is identical (a new results snapshot, a changed rollout value or an experiment completed by someone else voids the approval). Then it sends exactly one `POST .../complete/` with `rollout_decision=variant` and the variant id ([contract](https://github.com/Flagsmith/flagsmith/blob/main/frontend/common/types/requests.ts), `CompleteExperimentBody`), reads the experiment back and reports `shipped` only if it is `completed` with that variant. A write that does not read back as planned exits 1 with "NOT verified" and is never retried.
5. **Leave a trail**: the current reader emits a compact JSON decision record including the environment, flag, metric, result timestamp, raw counts and proposal.

## Run the reader

Requires Node.js 20 or newer and an existing Flagsmith account with access to the environment. Install the pinned CLI and authenticate using its official login (or a Master API key in `FLAGSMITH_API_KEY`):

```sh
npm ci
npx flagsmith login
npm test
npm run --silent plan -- --environment cEah9PMHR4vhyqmBX4o9FJ --experiment 525 --metric 509 --flag cta_text
```

The example environment key is client-side and public by design; it grants no administrative access. Use your own environment, experiment, metric and flag for another project. Authentication errors fail with exit 1; they do not fall back to fixtures or a successful empty response. `--apply`, `--approve`, `--yes` and unknown arguments are refused before any request. Capture stdout to your chosen decision-record path only after checking the command exit status.

The reader supports a running, two-arm experiment with string values and an increasing occurrence metric. It reads the exact experiment and its cached results with explicit GET, without creating traffic or requesting a refresh. Missing results return `pending`; missing inference or probability below 0.95 returns `inconclusive`; 0.95 or higher returns `approval_required` with the values before/after. The current value comes from the experiment rollout, not the feature's historical initial value. Results older than 24 hours, a failed refresh, malformed counts/probability or mismatched context fail closed. A reported sample-ratio mismatch below 0.01 blocks the proposal.

The stored real fixture has 4 control and 2 treatment exposures, zero clicks and no inference. Two control visits were our QA checks, so these are **raw counts**, not six real customers. The reader does not recompute Bayesian inference after subtracting QA traffic. Review contamination and other metrics before rollout; the 95% comparison is a proposal rule, not an automatic production authorization. Synthetic winning fixtures exercise the boundary and are never presented as live results.

## API contract

The adapter follows Flagsmith's [experiment service](https://github.com/Flagsmith/flagsmith/blob/main/frontend/common/services/useExperiment.ts) and [response types](https://github.com/Flagsmith/flagsmith/blob/main/frontend/common/types/responses.ts): `api/v1/environments/{key}/experiments/{id}/` and its `results/` endpoint, whose body wraps the snapshot in `results`. `chance_to_win` is a number from 0 to 1. Tests inject only the transport; the planner consumes the same payload shape as the real CLI.

## Real data, not a toy

It is built and tested against our own live experiment from Track 01 (https://github.com/DesignMaster-Solutions/first-click): flag `cta_text`, metric `First CTA click`, experiment `Hero CTA wording` on designmastersolutions.com. If that test ends inconclusive, the skill has to say so and ship nothing, and that is the first case we test.

## Judging criteria we design for

- Track 02: uses the Flagsmith CLI and API; saves the manual read-decide-rollout loop; a human approves every write; clear output.
- Track 04: completes the whole job, token efficient (JSON + `--jq`, no page scraping), creative use of the CLI, safe around production (read only by default, plan before write, explicit approval).

## Layout

- `skills/ship-the-winner/SKILL.md`: the Agent Skill.
- `test/`: checks that run the read-only path against the live project and fail if a write happens without approval.
