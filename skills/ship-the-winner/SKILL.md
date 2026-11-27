---
name: ship-the-winner
description: Read a Flagsmith A/B experiment and propose its winning rollout through the Flagsmith CLI. Use when asked to interpret results, call a winner or prepare the end of an experiment. Ships only with an explicit human approval bound to the exact proposal.
---

# Ship the winner

This skill is the agent module of the single First Click hackathon project. Run commands from this repository's root; setup and supported experiment types are in `README.md`.

1. Establish the environment key, experiment ID, metric ID and flag name from the user's task. Complete when all four are explicit. Use `npx flagsmith auth status --json --no-input` to confirm the active account; if authentication is missing, follow the official `npx flagsmith login` flow. Credentials stay in the CLI store or environment, outside prompts and decision files.
2. Run `npm run --silent plan -- --environment KEY --experiment ID --metric ID --flag NAME`. The helper performs only GET requests using CLI 2.0.0, validates the context, and emits the decision. Complete only with exit 0 and valid JSON; a read error requires fixing access/context, never substituting synthetic data.
3. Read `status` and `reason`. `pending` means no computed results. `inconclusive` means the predeclared 95% rule was not met. `blocked` means a sample-ratio problem needs investigation. In all three cases, report the timestamp and raw counts and leave the experiment unchanged.
4. For `approval_required`, show the environment, flag, before/after values and probability. Explain the reported limitations, especially QA traffic and metrics not assessed. Record it as a proposal with `writes_executed: 0` and the `approval_digest`. Ask the human; never approve on their behalf.
5. Only after the human explicitly approves that proposal, run `npm run --silent ship -- --environment KEY --experiment ID --metric ID --flag NAME --approve DIGEST`. Exit 0 with `status: shipped` and `verified` is the only success. "no longer matches" means the state changed: run step 2 again and ask again. "NOT verified" means the write was sent but did not read back: stop, report it, do not retry.
6. Save the successful JSON to the user's chosen decision-record location. Report whether this was a live read or the offline test fixture. Complete when the record and its provenance are available; claim a rollout only from a `shipped` record.
