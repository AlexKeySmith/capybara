# ADR-006: Transport abstraction with local and relay modes

## Status
Accepted

## Decision
Provide a transport abstraction with local BroadcastChannel mode for same-origin testing and relay mode for remote play.

## Consequences
Playwright and fast local iteration stay simple, while production deployments can adopt a managed relay without rewriting host or controller logic.
