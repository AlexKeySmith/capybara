# ADR-009: Browser-first automated testing

## Status
Accepted

## Decision
Use Playwright as the primary validation layer for boot, join flows, and controller interactions, with traces and screenshots retained on failure.

## Consequences
Validation measures what users actually see and interact with, not just isolated helper functions.
