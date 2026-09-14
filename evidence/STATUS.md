# Verification status

The repository is public. **39 tests passed: 27 unit/HTTP and 12 real Chromium browser tests.**

- [GitHub Actions verification run](https://github.com/adithyaharish/computer-use-automation/actions/runs/34792494940)
- [Saved CI test output](ci-browser-tests.txt)
- [Machine-readable verification status](ci-verification.json)

## Remaining required gate

Genuine LLM discovery attempted its first API call and received **HTTP 429 / `insufficient_quota`**. The API account associated with the configured key needs available credits/quota. No genuine discovery artifact or successful learned-workflow replay has been fabricated. This project is **not yet submission-ready**.

The browser suite verifies replay behavior, exceptional outcomes, policy enforcement, and same-page handoff using the explicitly hand-authored example. That evidence does not replace a genuine discovery run.

After resolving the API quota, start a **new** workflow run on the latest `main` branch. The workflow runs all tests, genuine discovery and changed-input replays, verifies real browser/HTTP handoff with a clearly labeled scripted operator, and publishes validated sanitized evidence to this repository. Its finalizer checks artifact lineage before declaring success.

The original local Chromium availability report is retained only as historical context. It is superseded by successful GitHub-hosted browser verification.
