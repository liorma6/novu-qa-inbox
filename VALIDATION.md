# Observed validation

Local validation on 17 November 2026 (Asia/Jerusalem), Windows, Node.js 24.11.0.

| Suite | Result | What was exercised |
|---|---:|---|
| Node backend tests | 20 passed | Real loopback HTTP, valid/tampered signatures, invalid payloads, size and capacity limits, retry/conflict semantics, concurrent duplicate capture, environment boundaries, checks and report filtering |
| Published Novu provider integration | 3 passed | Actual `@novu/providers@2.6.6` EmailWebhookProvider sends, redelivers and receives rejection for an incorrect key |
| Playwright | 12 passed | Six user flows in desktop Chromium and a mobile viewport: sample run/checks, search/filtering, HTML/text preview, JSON download, layout width, script isolation |

Playwright version: 1.61.0; its installed Chromium revision: 1228. Browser suite completed in approximately 6 seconds on this machine; this is test duration, not a product performance benchmark. No test retries were enabled.

The desktop/mobile images in `docs/` were also visually inspected. They contain synthetic `example.test` recipients only. A local interactive session is available while its server is running; it is not a public deployment.

## Reproducibility

Run `npm ci`, `npx playwright install chromium`, then `npm run check`. The workflow at `.github/workflows/ci.yml` executes the same suites on Ubuntu and uploads Playwright evidence. Published run results are available in [GitHub Actions](https://github.com/liorma6/novu-qa-inbox/actions).

## What was not validated

- The full Novu API/worker/dashboard stack or Novu Cloud.
- Gmail/Outlook rendering, actual email delivery or SMTP transport.
- Multi-user authorization, durable storage, production deployment or production load.
- Full accessibility conformance or an independent security audit.

The assertions are content heuristics; a passing message is not a certified deliverable email. The demo deliberately includes two failing messages, and tests verify that they are flagged.

## Dependency boundary

The running inbox uses only Node built-ins. The pinned official provider package is used only in development integration tests and brings a substantial transitive dependency graph, with audit findings reported during installation. No claim of a vulnerability-free dependency tree is made. Productionizing this pilot would require reviewing that graph as well as the storage, authentication and deployment design.
