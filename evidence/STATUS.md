# Evidence status — do not misrepresent test doubles as live runs

## Completed here

- Unit and real local HTTP tests: see `unit-http-tests.txt`.
- Chromium availability check: `browser-check/availability.json`.
- A working source implementation and separately runnable browser tests.

## Not completed here

- Genuine API-backed LLM discovery against a live UI.
- Live Chromium replay or live Chromium handoff verification.
- Public GitHub repository publication or submission email.

No model API key was configured. Chromium was not installed, its download timed out, and the hosted browser denied access to the local fixture. The browser security restriction was respected. These are environment limitations, not successful test results.

`../config/example-capability.json` is hand-authored (`provenance.mode = "example"`). No discovery/replay event logs have been fabricated. The unit tests use explicitly named test doubles and are not sufficient evidence for the assignment's must-have real discovery run.

GitHub verification can also run the required real browser and API discovery checks using the included workflow and an `OPENAI_API_KEY` repository secret. No such workflow run has occurred yet.

## Generate required evidence

1. Install dependencies and Chromium as described in the README.
2. Run `npm test` and `npm run test:browser`.
3. Export `OPENAI_API_KEY` locally; run `node scripts/collect-evidence.js`.
4. Follow the interactive handoff demonstration using the learned artifact.
5. Inspect the new `evidence/live-*/` directory, replace this status with your actual verified results, and retain truthful provenance.

The collector writes a genuine learned artifact, sanitized observations, model-selected action/reason records, deterministic replay logs, and success/failure results. Failure screenshots are masked. It does not fabricate output if any stage fails.
