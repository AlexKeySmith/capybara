# ADR-001: Static modular JavaScript architecture

## Status
Accepted

## Decision
Use a static-hosted, multi-entry, pure modern JavaScript architecture with separate host, controller, shared, game, and network modules.

## Consequences
The app remains deployable to GitHub Pages while keeping simulation, rendering, networking, and browser tests independently evolvable.
