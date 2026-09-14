# Computer-Use Automation System

A small backend that discovers a UI workflow with an LLM and records a typed capability for deterministic replay. Includes a synthetic banking application, policy enforcement, explicit runtime outcomes, and an operator panel that controls the same live browser session.

**Current verification status:** **27 unit/HTTP tests and 12 real-browser tests passed** on GitHub Actions. Genuine discovery reached OpenAI but was blocked at its first model call by **HTTP 429 / `insufficient_quota`**. [Verified run](https://github.com/adithyaharish/computer-use-automation/actions/runs/34792494940). The API account must have available credits/quota before the required discovery evidence can be generated. This repository is public, but **not yet submission-ready**. `config/example-capability.json` remains explicitly hand-authored and is not represented as discovery evidence.

## Finish the outstanding API run

The repository secret is configured, but OpenAI reports `insufficient_quota`. Check the billing/credits and project limits for the API account that owns that key. After resolving the quota issue, run **Actions → Validate and collect evidence → Run workflow → main**. This starts from the latest source. The successful workflow commits the verified evidence and updates the README/report automatically; failed runs do not claim success.

## Requirements and setup

- Node.js 22 or newer; npm.
- Chromium installed by Playwright.
- An OpenAI API key for discovery. Replay and tests never need a model key.
- The only runtime package is Playwright, pinned in `package.json`. After `npm install`, retain the generated `package-lock.json` in your repository for transitive dependency reproducibility.

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium` if system libraries are missing. You can alternatively set `CHROMIUM_EXECUTABLE_PATH` to an installed Chrome executable. Do not set it to a remote browser endpoint.

## Fastest genuine end-to-end demonstration

This command starts the demo, performs a real API-backed discovery, saves the learned capability, replays it with a different member, then exercises not-found, permission denial, a known notice, a slow load, and real browser/HTTP handoff using a clearly labeled scripted operator client. Stop an existing demo on port 4310 first.

macOS/Linux:

```sh
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-4.1-mini"
node scripts/collect-evidence.js
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_MODEL="gpt-4.1-mini"
node scripts/collect-evidence.js
```

Choose a model your API account can access that supports Chat Completions JSON mode. `.env.example` is a reference; the application does **not** automatically load `.env` files. Never commit a key. Evidence goes into a new `evidence/live-<timestamp>/` directory. The collector fails if discovery does not succeed; it never substitutes the example artifact.

## Run verification on GitHub Actions

The included workflow can complete live verification on a GitHub-hosted Ubuntu runner; local Chromium is not needed for that route.

1. Create a public repository with `main` as its default branch, and give the connected GitHub app access to that repository.
2. In the repository, add an Actions secret named `OPENAI_API_KEY`. Optionally add an Actions variable `OPENAI_MODEL` for another supported model. Do not place a key in a file or chat message.
3. Publish this source to `main`. The workflow runs unit/HTTP and real-browser tests, then genuine model discovery and changed-input replays. If the secret is missing, the evidence job fails explicitly.
4. After successful verification, the workflow validates artifact lineage and commits the sanitized evidence, dependency lockfile, and updated verification documentation into the repository. It also retains a downloadable `live-evidence-<commit>` workflow artifact. A failed run never updates the verification status.
5. The handoff evidence labels its actor as a scripted test client. The interactive operator panel is still available for a real-person demonstration.

The secret is supplied only to the live-evidence step on `main`, never to pull-request tests. Only the successful evidence job receives repository write access. Its finalizer checks real discovery provenance, replay results, checkpoint verification and same-artifact lineage before publishing the evidence. Failed runs never claim success.

## Exact individual discovery and replay commands

Terminal 1:

```sh
npm run demo
```

Terminal 2, with `OPENAI_API_KEY` exported:

```sh
node src/cli.js discover --goal "Look up the supplied member, open their savings account and return the available balance and currency" --target http://127.0.0.1:4310/bank --params '{"member_id":"12345"}' --out evidence/discovery
node src/cli.js replay --artifact evidence/discovery/capability.json --params '{"member_id":"67890"}' --out evidence/replay
node src/cli.js replay --artifact evidence/discovery/capability.json --params '{"member_id":"99999"}' --out evidence/not-found
```

PowerShell users can use the collector above to avoid command-line JSON quoting differences between PowerShell versions. Each output directory must be new to avoid mixing evidence from multiple runs. Replay emits declared outputs to stdout, redacts output values in the persisted result, and exits 1 for a hard failure. A recognized business outcome exits 0; callers must inspect `status`.

### Without a model key

You can run all tests and replay the **hand-authored example**:

```sh
npm run demo
# In another terminal:
node src/cli.js replay --artifact config/example-capability.json --params '{"member_id":"67890"}' --out runs/example-replay
```

This demonstrates execution only; it does not fulfill the assignment's genuine discovery requirement. `--provider bridge` is an optional JSON-lines integration seam: each stdout `modelRequest` must be answered by one JSON decision on stdin. Its provenance is `external-stdio-model`; the bridge itself cannot attest that an LLM, rather than a person or script, supplied the decisions. It is not the recommended submission evidence path.

## Human takeover demonstration

Keep the demo running. Use the artifact from your genuine discovery:

```sh
node src/cli.js replay --artifact evidence/discovery/capability.json --params '{"member_id":"40100"}' --handoff --out evidence/handoff
```

1. Open the private operator URL printed in the terminal. Its fragment is an ephemeral access token; don't publish or save that URL.
2. The run searches the member and encounters `SESSION_EXPIRED`. It pauses at the next pending step.
3. Click **Take control**, then click the visible **Restore demo session** control in the operator panel.
4. Click **Return control & resume**. The executor rechecks the page and continues on the **same browser page and session**.
5. Inspect `events.jsonl`: the session ID is unchanged; ownership transitions and the operator action are recorded.

The operator panel is a minimal control mirror of approved controls on the live UI. Its clicks go through the existing browser surface; it never creates another session or calls a banking API. The restoration button is a synthetic test action and does not authenticate to a real service. An unattended request aborts after two minutes. `--headed` shows the application for observation; use the operator panel for manual actions so they are audited.

## Synthetic scenarios

| Input | Behavior |
|---|---|
| `12345` | Savings balance `2480.75 USD` |
| `67890` | Different member, `8150.20 USD` |
| `99999` | `business_outcome / MEMBER_NOT_FOUND` |
| `bad` | `business_outcome / VALIDATION_ERROR` |
| `40300` | `failure / PERMISSION_DENIED` |
| `50000` | `failure / APP_UNAVAILABLE` |
| `40800` | 900 ms load; bounded waiting then success |
| `40900` | Known notice; deterministic dismissal then success |
| `40100` | Session expiry; operator required to restore |

All values above are invented demo fixtures. The UI exposes a destructive **Close account** button deliberately; policy blocks it for automation and the operator. No real accounts are involved.

## How the pieces fit

- `src/discovery.js`: bounded observe/decide/act loop; model chooses the sequence.
- `src/model.js`: OpenAI transport and optional external model bridge.
- `src/schema.js`, `src/types.d.ts`, `schemas/capability.schema.json`: strict runtime validation, type contract and reviewable JSON Schema.
- `src/engine.js`: replay, declared output parsing, error taxonomy, waiting and recovery. No model import.
- `src/surface.js`: Playwright adapter with frame-scoped label/role targeting and approved attribute selectors.
- `config/bank.json`: trusted application bindings, allowed routes/actions, risk classification and runtime signal definitions. The artifact cannot expand these permissions.
- `config/savings-contract.json`: input/output contract and independent final identity/screen checkpoints. This specifies *what* to produce, not the workflow.
- `src/session.js`, `src/operator.js`: ownership state machine and authenticated loopback operator surface.
- `src/evidence.js`: structural event log and redacted persisted result. Failure evidence includes a safe control-state snapshot and a masked screenshot for the synthetic fixture.

The model sees approved currently visible control names and signal codes, not raw DOM text, customer identifiers, credentials or balances. Literal inputs are bound at execution time. This intentionally requires an onboarded app profile; it is not unrestricted automation of arbitrary websites.

## Verification and submission

`npm test` exercises schema/policy, error taxonomy, checkpoint enforcement, model response validation, HTTP routing and session ownership with an explicit Surface test double. `npm run test:browser` exercises the real iframe UI, outcomes, delays, notice recovery, policy blocking, ambiguity and a simulated operator acting on the same Chromium page. Those browser tests do not prove genuine LLM discovery; use the collector for that.

Review `REPORT.md` and `evidence/STATUS.md`. Before submission:

1. Run both test suites and genuine discovery/replay; inspect the learned artifact and failure evidence.
2. Perform the interactive handoff above. Understand and be able to defend every submitted component.
3. Review the repository for secrets and raw sensitive data, then push to a **public** GitHub repository.
4. Email the repository URL on its own line to `assignments@interface.ai` using the email address you applied with. The assignment asks for a repository, not a ZIP attachment.

The project is published at https://github.com/adithyaharish/computer-use-automation. No submission email has been sent.
