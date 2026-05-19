# Follow-Up Issue Tickets

These tickets are formatted so an LLM can execute them with minimal ambiguity.

## ISSUE-001: Add deterministic simulation regression suite for movement and rope physics

- Type: test-infrastructure
- Priority: high
- Goal: Expand unit coverage for game dynamics so movement, gravity, jump cadence, and rope constraints are protected from regressions.

### Problem
Current coverage validates core round timing, controller assignment, projectile damage, and grapple creation. It does not yet lock down physics edge cases (friction, gravity settling, rope stretch constraints, camera follow behavior).

### Scope
- Add unit tests under `tests/unit/simulation.physics.spec.js`.
- Cover deterministic outcomes for:
  - horizontal acceleration and friction decay
  - jump only when grounded and jump cooldown behavior
  - rope max-length constraint and velocity damping
  - camera smoothing convergence toward host position
- Use fixed seed/fixture inputs and avoid randomized expectations.

### Acceptance Criteria
- `npm run test:unit` passes with new tests.
- At least 8 new tests are added.
- Tests assert exact or bounded numeric outcomes (with explicit tolerances where needed).
- No changes to runtime gameplay behavior required unless a bug is discovered.

### Test Plan
- Run `npm run test:unit`.
- Verify no Playwright tests are executed by unit command.
- Verify tests pass in CI/Linux without browser dependencies.

### Implementation Notes for LLM
- Reuse helper setup patterns from `tests/unit/simulation.spec.js`.
- Prefer direct method-level validation (`applyInput`, `updatePlayer`, `updateRope`, `tickFrame`) for precision.
- If floating point drift appears, use narrow tolerances with explanatory assertions.

---

## ISSUE-002: Add in-game attract-mode onboarding banner for host screen

- Type: UX
- Priority: high
- Goal: Make multiplayer joining feel immediate from across the room, similar to arcade attract screens.

### Problem
Join instructions are visible but static. In a party setting, the host view should actively communicate "how to join now" and seat availability without requiring reading small text.

### Scope
- Add a high-visibility attract banner on host view that cycles concise prompts:
  - "SCAN TO JOIN"
  - "ENTER CALL SIGN"
  - "P2-P4 READY"
- Include live seat state (e.g., `2/4 linked`) and fallback text when full (`ARENA FULL`).
- Ensure banner is visible over gameplay area without blocking critical HUD.

### Acceptance Criteria
- Banner updates when controllers join/leave.
- Banner remains readable on 720p and 1080p layouts.
- Visual-regression snapshot is updated for host sidebar/panel where needed.
- Existing join flow remains functional.

### Test Plan
- Extend `tests/e2e/host.spec.js` with assertions for attract banner text and seat counts.
- Re-run `npm run test:e2e` and update snapshots only where intentional.

### Implementation Notes for LLM
- Add semantic selectors with `data-testid`.
- Keep animation subtle (no flashing at seizure-risk frequencies).
- Do not couple text rendering to transport internals.

---

## ISSUE-003: Add explicit controller-side "How to Join" fallback when session param is missing

- Type: UX / reliability
- Priority: medium
- Goal: Allow immediate recovery when users open `/controller/` without a valid session query.

### Problem
If users open the controller URL without `session`, a new session is generated, which can be confusing and prevents joining the intended host.

### Scope
- Detect missing/invalid session on controller bootstrap.
- Present a simple join form with:
  - session code input
  - transport mode hint
  - join CTA
- Only auto-join when a valid session is present.

### Acceptance Criteria
- Opening `/controller/` with no query shows join form instead of silently generating unrelated session.
- Valid session input transitions to current controller UI and sends `join` message.
- Session IDs are sanitized through existing shared utilities.

### Test Plan
- Add E2E test for `/controller/` no-session path.
- Verify valid code submission links controller to host in local transport.

### Implementation Notes for LLM
- Reuse `sanitizeSessionId` and `ensureSessionId` semantics.
- Keep existing `name` handling and localStorage persistence.
- Preserve CSP and static-only constraints.

---

## ISSUE-004: Add bot-to-human handoff telemetry and QA assertions

- Type: gameplay / observability
- Priority: medium
- Goal: Track and verify slot handoff transitions from bots to remote controllers and back on timeout/disconnect.

### Problem
Roster behavior is implemented, but there is limited explicit telemetry/testing for handoff transitions and timeout recovery timing.

### Scope
- Emit structured host-side telemetry events (in-memory and optional debug output in test mode) for:
  - controller assigned
  - heartbeat timeout
  - controller released
- Add E2E assertions for timeout-based bot reversion.

### Acceptance Criteria
- Event payload includes `controllerId`, `slot`, and event timestamp.
- Timeout release is observable in tests without brittle sleeps.
- Roster UI and metrics reflect release consistently.

### Test Plan
- Add targeted Playwright test that simulates controller disconnect and validates slot returns to bot.
- Keep total suite runtime within current CI budget.

### Implementation Notes for LLM
- Use deterministic polling/waitFor patterns in Playwright.
- Avoid logging sensitive data; controller names are already sanitized.
