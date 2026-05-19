# ADR-012: Security model for controllers, sessions, and hosting

## Status
Accepted

## Decision
Treat controllers as untrusted clients, validate session identifiers and input payloads, avoid secret material in the static client, and constrain resource loading with CSP.

## Consequences
The static app can be safely deployed to GitHub Pages while minimizing injection and malformed-message risk.
