# ADR-005: Managed signaling compatible with GitHub Pages

## Status
Accepted

## Decision
Keep the frontend static on GitHub Pages and require an optional managed realtime relay for remote controllers because Pages cannot host signaling infrastructure.

## Consequences
The repo deploys as static content, but remote controller support depends on configuring a separate managed service via public runtime configuration.
