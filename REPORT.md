# Architecture

The system separates discovery, replay, surface access, policy, session ownership and evidence. Discovery asks an LLM to choose a single typed action using the current visible controls. The executor validates and performs it. On verified completion, discovery saves a capability. Production replay consumes that capability and new parameters with no model dependency. Both paths use the same policy and action executor.

One Node process owns one browser and optional loopback operator server. A separate local fixture serves an iframe/table-based banking UI with synthetic accounts and injected runtime conditions. All banking interactions use the UI; the fixture exposes no business API. OpenAI Chat Completions supplies discovery decisions. An optional JSON-lines model bridge is explicit about its weaker provenance.

The main trade-off is constrained discovery: a trusted app profile supplies control bindings and permissions, while the model discovers their order and data flow. This sacrifices arbitrary-app exploration for predictable targeting, stronger privacy and a defensible action boundary. The browser receives real clicks/fills; this is not API automation. The build environment passed unit/HTTP tests but could not run Chromium or a genuine model-driven browser session. Those gates remain outstanding, documented in `evidence/STATUS.md`.

# Artifact schema

The capability has separate schema and capability versions, a vendor/app-version binding, typed inputs, typed outputs, named concrete targets, ordered actions, final checkpoints and discovery provenance. Four discriminated actions are supported: `fill` binds a named input, `click` acts on a target, `read` binds an output, and `check` verifies visibility or equality with an input. There are no literal fill values, arbitrary JavaScript or unbounded loops in the schema. Amounts are exact decimal strings; currency is a three-letter uppercase string.

Strict runtime validation rejects unknown fields, missing references, duplicate output writes and unsupported versions. JSON Schema and TypeScript declarations make the contract inspectable. Structural schema validation is followed by semantic validation and comparison with external policy. An artifact cannot relabel a destructive button as safe or substitute a selector. The final member-reference equality check prevents returning another account's balance after an apparently successful navigation. The example artifact is explicitly hand-authored; only successful discovery emits `capability.json` with discovery provenance.

# Determinism & error handling

Replay has no model import. It resolves frame-scoped exact accessible names/labels and approved attribute selectors, rejects ambiguous matches, waits for visibility within a bounded deadline and verifies final identity and screen checkpoints. There is no coordinate fallback or “first match” guessing. Missing targets produce expected/observed diagnostics. Playwright provides bounded actionability waiting; a failed dispatched click is not automatically retried because its effect may be uncertain.

App-profile signals distinguish business outcomes (missing member, input validation), recoverable states (known informational notice) and hard failures (permission denial, application failure). Recovery is limited to three known dismissals; delayed loads are observed until ready. Session expiry and target dead ends can request human intervention. Each run has a step/time budget and at most two handoffs. Returning from handoff re-evaluates the same pending step. Results are tagged `success`, `business_outcome` or `failure`; sensitive extracted values go only to the caller, not persisted results.

Tests cover these contracts with a Surface double, including wrong-account checkpoints and policy attacks. Separate Chromium tests exercise the actual UI and are not represented as having passed here. Genuine discovery plus changed-input replay must be collected before submission.

# Heterogeneity & multi-tenant

The engine depends on `Surface.open`, `observe`, `available`, `perform`, `signal` and failure capture; browser mechanisms stay in the adapter. The implemented adapter handles an iframe, table layout and controls without test IDs. It still relies on accessible names or specific approved attributes; this is not evidence of support for inaccessible desktop software.

For a desktop adapter, named controls could bind to accessibility IDs or deterministic image-template anchors with scale bounds, confidence thresholds and ambiguity rejection. A screenshot-based discovery provider could consume a redacted visual representation; a replay adapter would need deterministic targeting, not a vision LLM in its loop. That work is designed, not implemented.

For reuse, keep a vendor/version capability plus tenant configuration: origins, frame bindings, locale labels and reviewed control overrides. The current implementation deliberately requires an exact profile match. Production specialization would create an immutable reviewed profile version, run compatibility probes and canaries, and invalidate incompatible bindings rather than silently repair them. A UI fingerprint is a drift signal, not proof of semantic equivalence. Schema migrations and artifact approval would be explicit; queues, fleets and tenant routing are deferred.

# Escalation & handoff

Ownership moves `automation → paused → human → paused → automation`, with `aborted` terminal. The controller retains the same Surface and browser page throughout. An intervention records the session/capability, pending step, reason and expected control; the operator page shows the current approved visible controls. Its buttons dispatch real UI actions into that page. This is a small control mirror, not a second banking session or a pretend state toggle.

A random process-scoped token authenticates loopback operator API requests; host/origin checks limit cross-site requests. Only one operator owns control, concurrent actions and resume during an action are rejected, and resume checks for unresolved blockers. Actions are logged structurally with values omitted. Expired interventions abort. The demo restoration control only restores synthetic session state. Real login, operator identity/RBAC, remote screen streaming, restart recovery and complete manual event capture are deferred. Direct manipulation of a headed browser is outside the audited handoff path; the documented flow uses the panel.

# Safety

Policy is external to the model and artifact: exact origins/routes, action types, target-level grants and a blocked risky-target list. Request interception restricts browser traffic; popups, downloads, WebSockets and unexpected native dialogs stop safe progress. The fixture's destructive control is denied for both automation and the operator. Credentials and real banking access are not used.

The model receives only profile-approved visible control descriptions and known signal codes. Inputs remain in executor memory, filled by parameter reference; raw output values are never sent to the model. Logs contain structural events and enumerated decision reasons. Persisted results redact outputs. Failure snapshots contain only approved controls; screenshots are enabled for the synthetic profile and mask marked private regions and inputs. This privacy model depends on correct onboarding and trusted labels. It is not a general PII detector or regulatory-compliance claim. Other applications should keep screenshots disabled until their masking policy is reviewed. Terminal output is the private caller interface; do not redirect returned financial data or the ephemeral operator URL into public logs.

# Cuts

The slice prioritizes the capability contract, deterministic outcomes and real session ownership. It omits universal target discovery, desktop execution, cross-tenant overrides, artifact signing/approval, distributed workers and a polished operator console. These are deliberate scope cuts. Browser verification and genuine discovery evidence are different: they are incomplete required gates caused by the available environment, not optional scope cuts. The included collector and browser suite make those gates reproducible once Chromium/network/model access is available. Publication and submission also remain outstanding.

Next: complete live verification first; then persist reviewed artifact/profile digests, add semantic checkpoints around writes and explicit uncertain-effect reconciliation, and implement one second vendor variant to validate the proposed reuse seam. Reference interfaces: [Playwright locators](https://playwright.dev/docs/api/class-locator) and [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat).
