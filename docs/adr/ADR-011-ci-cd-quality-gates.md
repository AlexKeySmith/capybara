# ADR-011: CI/CD quality gates and Pages deployment

## Status
Accepted

## Decision
Gate deployment on dependency installation, audit, static build, and Playwright browser automation, then publish the built `dist` artifact to GitHub Pages.

## Consequences
Broken or insecure changes are less likely to reach production, and debugging data is preserved through workflow artifacts.
