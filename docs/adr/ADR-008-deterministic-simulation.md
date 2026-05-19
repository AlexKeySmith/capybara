# ADR-008: Deterministic simulation for testing

## Status
Accepted

## Decision
Separate simulation from rendering and drive terrain generation and fixtures from explicit seeds.

## Consequences
Browser tests can reproduce the same arena and UI state reliably, which shortens the feedback loop for LLM-driven iteration.
