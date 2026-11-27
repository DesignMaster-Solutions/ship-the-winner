# Ship the Winner: an Agent Skill that finishes a Flagsmith experiment

Entry for **Toggle Wars: The Flagsmith Experimentation Hackathon** (WeMakeDevs, Nov 26-29, 2026), **Track 02 (AI Agents and Feature Flags)** and **Track 04 (Flagsmith Agent Skills)**. Rule 05 lets one project enter more than one track.

Status (Nov 26, 2026): scope and skill outline. The working skill, tests and demo video land before the Nov 29 deadline.

## The job it finishes

Starting an experiment is one prompt. Ending it well is where teams stall: someone has to read the result, decide if it is good enough, roll the winner out with the same flag, and clean up. This skill takes a coding agent through that last mile with the Flagsmith CLI:

1. **Read**: find the running experiment for a flag and pull its current results (`flagsmith api`, read only).
2. **Judge**: apply a decision rule written down before the test (ship only at 95% win probability or more; otherwise report "inconclusive" and change nothing).
3. **Plan**: print the exact change it would make (flag, environment, value before and after) and stop.
4. **Approve**: a human answers yes. Without it, nothing is written (`--no-input` runs stay read only).
5. **Ship**: roll the winning value out to everyone with the same flag, no redeploy.
6. **Leave a trail**: a short markdown record of the numbers, the decision and who approved it.

## Real data, not a toy

It is built and tested against our own live experiment from Track 01 (https://github.com/DesignMaster-Solutions/first-click): flag `cta_text`, metric `First CTA click`, experiment `Hero CTA wording` on designmastersolutions.com. If that test ends inconclusive, the skill has to say so and ship nothing, and that is the first case we test.

## Judging criteria we design for

- Track 02: uses the Flagsmith CLI and API; saves the manual read-decide-rollout loop; a human approves every write; clear output.
- Track 04: completes the whole job, token efficient (JSON + `--jq`, no page scraping), creative use of the CLI, safe around production (read only by default, plan before write, explicit approval).

## Layout

- `skills/ship-the-winner/SKILL.md`: the Agent Skill.
- `test/`: checks that run the read-only path against the live project and fail if a write happens without approval.
