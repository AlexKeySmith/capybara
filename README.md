# Capybara

A modern-web game rebuilt in pure modern JavaScript for GitHub Pages, fast LLM iteration, and mobile-controller play. It remains a tribute to the Molez game I played in the 90s.

## What is implemented

- **Static-first app** built with Vite and deployable to **GitHub Pages**.
- **Desktop host** at `/` with a seeded arena, join code, QR code, roster, and deterministic round telemetry.
- **Mobile controller** at `/controller/` with thumb-friendly touch controls.
- **Deterministic simulation** separated from rendering for reproducible browser tests.
- **Transport abstraction** with:
  - local `BroadcastChannel` mode for same-browser / same-origin fast iteration
  - optional managed relay mode via `VITE_SIGNALING_URL` for remote mobile devices
- **Browser-first automation** via Playwright.
- **Architecture decision records** under `/docs/adr`.
- **CI/CD** workflow that builds, audits, tests, uploads artifacts, and deploys to Pages on green.

## Development commands

```bash
npm ci
npm run dev
npm run build
npm run test:e2e
npm run security:audit
```

### Fast feedback for LLMs

- Run `npm run dev` for hot reload.
- Run `npm run test:e2e` for browser-level validation.
- Run `npm run test:e2e:framerate` to execute the framerate regression pack (includes CPU-throttled diagnostics plus a simulated low-resource profile).
- Use deterministic URLs such as:
  - `/?session=test-host-123&transport=local&fixture=showcase&seed=1337&test=1`
  - `/?session=test-host-123&transport=local&fixture=showcase&seed=1337&test=1&power=low`
  - `/controller/?session=test-host-123&transport=local&name=Ace`
- Playwright captures traces, screenshots, and videos on failure.

## Deployment model

The frontend is fully static and works on GitHub Pages. Remote phone controllers need a **managed relay/signaling service** because GitHub Pages cannot host realtime signaling.

### Transport modes

- `local` — uses `BroadcastChannel`; ideal for local browser automation and same-browser development.
- `relay` — uses a configurable WebSocket endpoint from `VITE_SIGNALING_URL`.

If `transport=relay` is requested without `VITE_SIGNALING_URL`, the app safely falls back to local mode and explains that in the UI.

## Security notes

- Session IDs are validated and normalized.
- Controller names are sanitized before rendering.
- Controller traffic is treated as untrusted input and normalized before use.
- A CSP is embedded in both entry HTML files.
- CI runs `npm audit --audit-level=high`.
- No secrets are stored in the static client.

## Web Bluetooth

Web Bluetooth is intentionally **not** the primary controller transport. It has weak cross-platform support, high pairing friction, and does not fit browser-to-browser remote play. See `ADR-007`.

## Repository layout

- `/src/host` — host UI and orchestration
- `/src/controller` — mobile controller UI
- `/src/game` — deterministic simulation, fixtures, renderer
- `/src/network` — local and relay transports
- `/src/shared` — protocol, query, session, and config utilities
- `/tests/e2e` — Playwright browser tests
- `/docs/adr` — architecture decision records

## Optional relay configuration

Set a public relay URL before running `relay` mode:

```bash
export VITE_SIGNALING_URL=wss://your-managed-relay.example/ws
npm run dev
```

The relay service must scope messages by session ID and reject malformed payloads. The static app never embeds secrets for that service.
