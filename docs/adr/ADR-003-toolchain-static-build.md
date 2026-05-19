# ADR-003: Toolchain and static asset build choice

## Status
Accepted

## Decision
Use Vite as the minimal toolchain for multi-page static builds, hot reload, source maps, and GitHub Pages-compatible output.

## Consequences
The repo stays framework-free while still supporting a modern asset pipeline, deterministic test fixtures, and a clean deploy artifact.
