# Decision evidence

`first-click-live-2026-11-26.json` is stdout from the actual CLI-backed reader, authenticated through the official Flagsmith OAuth flow as `info@designmastersolutions.com` (Design Master Solutions, free plan). It is not a fixture replay. The GETs were run on November 26, 2026; the server returned its cached snapshot from `2026-11-26T22:04:05.703086Z`.

Command:

```sh
npm run --silent plan -- --environment cEah9PMHR4vhyqmBX4o9FJ --experiment 525 --metric 509 --flag cta_text
```

Result: inconclusive, 4 control exposures and 2 treatment exposures, zero conversions, no proposal and no experiment writes. Two control exposures were QA checks, as disclosed in First Click's `experiment/own-exposures.json`. No synthetic traffic or result refresh was sent by this command. The JSON's `as_of` is the server snapshot time, not a claim of fresh recomputation.

Nine tests cover the real export, threshold boundary, invalid counts/probabilities, stale/error results, sample-ratio mismatch, context binding, blocked write flags and GET-only transport. A disposable copy with GET replaced by POST failed the transport test; a second mutation lowering 0.95 to 0.94 failed the threshold test. Both mutations ran only with injected transport, never against the service. The unchanged implementation passes all nine tests.
