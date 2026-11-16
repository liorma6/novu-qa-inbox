# Proposed follow-on pilot

## Problem and evidence

Novu users have requested a built-in email sandbox in [#11766](https://github.com/novuhq/novu/issues/11766), including a dedicated inbox and content previews. At the time of this research (17 November 2026, Israel), the issue was open and the discussion contained several offers to implement the native capture provider. No linked implementation PR was returned by the issue-number search. That is a search result, not proof that no internal work exists.

This repository implements the separate local inspection/QA portion: signed capture, environment separation, message previews and repeatable content checks. Its current integration evidence is a real published Email Webhook provider sending to the receiver locally.

## Value hypothesis

Teams could inspect the actual rendered notification and catch missing substitutions before release, with a repeatable evidence report. Whether Novu wants to build, integrate or pay for this is unvalidated. There is no purchase commitment or accepted upstream contribution.

## Scope to agree with the team

1. Confirm ownership and avoid overlap with existing sandbox-provider contributors or an internal roadmap.
2. Pick one development workflow and a supported capture boundary, preserving Novu's outbound security controls.
3. Correlate the message with Novu's real workflow/transaction identifiers instead of the pilot's optional QA metadata.
4. Connect the inspection UI to the agreed capture store, add team-selected assertions and a minimal CI evidence export.
5. Demonstrate an end-to-end run on a disposable self-hosted environment and submit a narrowly scoped PR or integration package.

## Proposed acceptance criteria

- A triggered test workflow appears with the expected subject, content, recipients and environment.
- A deliberately broken template fails a selected check and is visible in the report.
- A repeated delivery with the same identifier cannot create a second inbox entry, while conflicting payloads are visible as errors.
- Untrusted HTML does not execute scripts or load external resources in previews.
- Reproducible CI and setup instructions let an engineer rerun the demonstration.

Any paid scope, schedule, ownership and delivery terms would be agreed after technical review. This is also a concrete starting point for a junior engineering discussion.

## Sources inspected

- [Feature request and contributor discussion](https://github.com/novuhq/novu/issues/11766)
- [Current provider source](https://github.com/novuhq/novu/blob/next/packages/providers/src/lib/email/email-webhook/email-webhook.provider.ts)
- [Published integration package](https://www.npmjs.com/package/@novu/providers/v/2.6.6)
- [Novu careers contact](https://handbook.novu.co/careers-page)
