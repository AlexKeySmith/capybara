# ADR-004: Host/controller split and session protocol

## Status
Accepted

## Decision
Expose a desktop host route and a dedicated mobile controller route, coordinated through a versioned session protocol carrying join, assignment, heartbeat, state, and input messages.

## Consequences
Controller UX can evolve independently from the game host while automation can validate both routes end-to-end.
