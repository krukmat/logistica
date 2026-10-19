# M6.1 — Cloud Lite local registry and authentication

**2026-10-19 · main · Status: IMPLEMENTED — CI acceptance pending.**

## Code and genuine functionality

- `src/core/cloud-lite-registry-policy.js`: shared device identity schema (`siteId`, `deviceId`, `configRevision`) reused; no filesystem or network operations inside portable policy.
- `src/adapters/cloud-lite-registry-file.js`: single-writer local registry under a private **temporary** root, atomic replace, fsync file + directory, SHA-256 stored credentials (no plaintext). Reject corrupt files; no silent repair or unauthorised re-enrol.
- `src/runtime/cloud-lite-registry-server.js`: real localhost-only HTTP API, admin enrolment and device auth endpoints, fixed-size JSON body, strict host checks and constant-time secret comparison. The random device token is returned once. No ingestion endpoint yet.
- `bin/pef-cloud-lite.js`: independent registry process, no dashboard prerequisite. `bin/pef-m61-registry.js`: disposable real HTTP smoke, not the mock.
- Dashboard real HTTP action `m61Registry`, `test/dashboard-integrated.test.js`, negative auth and corruption cases, `npm run m6:registry`. No simulated claims used as actual remote service assertions.

## Required evidence

- Native x64 and ARM64 Node test suite, real HTTP registry smoke and dashboard action all `LAB_PASS`, separate CI artifacts.
- Explicit failures for bad admin/device credentials, wrong site/device/revision, duplicate enrolment, insecure paths, Host spoofing, corrupted registry and concurrent store.
- Durable local registry after server restart without displaying device tokens in test outputs.
- CI result pending. **Do not declare M6.1 CLOSED until all gates pass**.

## Scope

Not Cloud mock replacement. Not event ingest/ACK, TLS, mTLS, certificate-based authority, physical-powercut validation, production persistent storage or paid hosting. Device tokens are 256-bit random bearer tokens over **loopback HTTP only**. `fsyncCompleted` refers to OS-level flush, not tested physical powercut.

M6.2 will address persistent event ingest, dedup and ACK; M6.3 will connect real Edge transport without changing the ability to boot offline.

## CI acceptance update — 2026-10-19

Los controles M6.1 están **CLOSED SOFTWARE LAB**: [CI #39259967547](https://github.com/krukmat/logistica/actions/runs/39259967547) SUCCESS (ARM64 199 PASS; x64 198 PASS +1 skip), y nueva regresión x64/ARM64 en [#39263462132](https://github.com/krukmat/logistica/actions/runs/39263462132) SUCCESS. Las declaraciones iniciales de CI pending y de ausencia de ingestión en este mismo fichero corresponden al estado **M6.1 de entonces**; el estado posterior M6.2 y M6.3 está documentado en [auditoría conjunta](m6-2-4-cloud-lite-local-2026-10-19.md).
