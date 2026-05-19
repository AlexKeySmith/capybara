# ADR-007: Reject Web Bluetooth as the primary controller transport

## Status
Accepted

## Decision
Do not use Web Bluetooth as the main controller path; prefer web networking with shareable session URLs.

## Consequences
The product avoids iPhone compatibility problems, pairing friction, and browser-to-browser transport limitations while preserving room for future experiments.
