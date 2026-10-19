# M7 — Seguridad y preparación del piloto

**Inicio: 2026-10-19, branch `main`.** M7.1/M7.2 implementation and dashboard/CI integration authored; **VALIDATION PENDING** until successful current-HEAD CI. M7.3–M7.6 not implemented. No purchased hardware, hosted cloud, external services or operator system changes.

## M7.1 — Identidad criptográfica de Edge (P0)

| ID | Dependencies | Delivery / acceptance | State |
| --- | --- | --- | --- |
| M7.1.A | M6 registry, Core identity | Ed25519 256-bit-curve software private key created once with 0600 + fsync (file and directory), pinned `siteId/deviceId/revision` | IMPLEMENTED / CI_PENDING |
| M7.1.B | A | Challenge/nonce signed with persistent key, Ed25519 public verification and foreign-scope/nonce/modified-signature rejection | IMPLEMENTED / CI_PENDING |
| M7.1.C | A–B | Open identical key after process reopen; refuse revision mismatch, storage corruption and silent key regeneration; CLI, dashboard HTTP, x64/ARM64 CI | IMPLEMENTED / CI_PENDING |

Files: `src/core/m71-identity-policy.js`, `src/adapters/m71-identity-keystore.js`, `src/runtime/m71-identity-smoke.js`, `bin/pef-m71-identity.js`, `test/m71-identity.test.js`. Command: `npm run m7:identity`. Dashboard action `m71Identity`.

**Security boundary:** local filesystem private key is **software protected only**, not TPM, Secure Enclave, HSM, hardware-backed, attested or cert-registered. The operator's already-existing lab boot metadata is NOT silently substituted for a trusted identity; M7.1 is an explicit separate opt-in keystore. Application compromise with the device user's read privileges can copy this key. Revision changes currently require explicit provisioning/authorization policy (not automatic device rotation).

## M7.2 — Permisos firmados y rollback sobre M5 (P0)

| ID | Dependencies | Delivery / acceptance | State |
| --- | --- | --- | --- |
| M7.2.A | M5.1/M5.2 + M7.1 Trust principle | Pin a distinct Ed25519 **release authority** public key in the scoped installer root; verify signed `version/digest/rootId/ordinal/sequence/predecessor` before M5's atomic state activation | IMPLEMENTED / CI_PENDING |
| M7.2.B | A | Ordinal high-water/floor blocks stale/downgrade as upgrade; explicit signed rollback only to the prior known-good release; no unsigned legacy activation if trust is pinned | IMPLEMENTED / CI_PENDING |
| M7.2.C | A–B | Real packaged Edge boots and fsyncs a Property event; tampered signature and state denied, interrupted upgrade leaves active unchanged, injected failed health check triggers preauthorized rollback retaining journal; CLI/dashboard/x64/ARM64 tests | IMPLEMENTED / CI_PENDING |

Files: `src/core/m72-signed-update-policy.js`, `src/adapters/m72-trust-anchor.js`, added signed guard inside `src/runtime/m5-install.js`, `src/runtime/m72-signed-upgrade.js`, `src/runtime/m72-signed-release-smoke.js`, `bin/pef-m72-signed-release.js`, `test/m72-signed-release.test.js`. Command: `npm run m7:release`. Dashboard `m72Release`.

The M5 **legacy unsigned ephemeral lab** remains available for regression *only when no pinned trust exists*. Once a trust anchor has been provisioned, `applyRelease` rejects unsigned activation. No retroactive enablement on an unsigned already-installed root. The trust anchor and signed state are software files, not hardware-protected monotonic counters; an adversary who can modify or restore older copies of **state.json** (or the entire filesystem) can bypass this software-only high-water; such attacks are **out of scope** pending a monotonic hardware/remote authority. No secure boot/firmware verification or remote OTA distribution is implied. The health failure is an **injected negative result after actually starting a packaged Edge**, not a witnessed physical hardware fault. Rollback is preauthorized by a distinct signed transition.

## Deferred tasks (not authorized as completed)

| Task | Inputs | DoD / major subtasks | State |
| --- | --- | --- | --- |
| M7.3 — TLS/mTLS trust | M7.1 + M6 Cloud Lite | A: lab CA/certs; B: identity binding and expired/foreign rejection; C: credential rotation, cloud failure isolation with local continuity | PROPOSED |
| M7.4 — Operational recovery | M7.2 + M3/M5 | A: common health; B: durable correlated incident lifecycle; C: authenticated operator recovery and restart | PROPOSED |
| M7.5 — Endurance and resource economics | M7.3/4 + M6 | A: 2–24h fault/load harness; B: saturation, offline/backpressure; C: CPU/RSS/latency/report thresholds and limits | PROPOSED |
| M7.6 — Software pilot readiness | M7.1–5 | A: Property/Host acceptance; B: cost/BOM/operating runbook; C: evidence pack GO/NO-GO explicitly software-only | PROPOSED |

**72h journal / W1.10.G remains DEFERRED** until realistic product payload rate, capacity and local failure policy are fixed; 100MiB alone does not satisfy 72h at modeled load. M5.3 physical device (NICs, storage powercut, energy, thermals) remains BLOCKED.

## Integration gate and evidence

Mandatory sequence for every feature: portable Core → OS adapter → real dashboard action HTTP → regression and negative E2E → docs and green Linux CI (native ARM64 and x64). Neither added source nor authored tests alone constitutes acceptance. See [M7 audit](../audit/m7-identity-and-signed-release-2026-10-19.md) and [M7 contract](../contracts/m7-security-lab-v1.json).

```bash
git switch main && git pull
npm run m7:identity   # ephemeral Ed25519 identity lab
npm run m7:release    # pinned signer + signed M5 lifecycle and rollback lab
npm run dashboard     # Laboratorio integrado → M7.1/M7.2 actions
npm test
```

All tests operate with private ephemeral OS directories and do not install keys or systemd units on the Mac. CI artifacts `pef-m7-identity-release-x64` and `pef-m7-identity-release-arm64` are expected **only after the workflow runs**.

### Requirement/change tracking

- **REQ-SEC-01:** added M7.1 software asymmetric identity port. Classification CORE + MODULE/CONFIG. Physical trust anchor pending.
- **REQ-SEC-02:** added signed release policy on existing M5 installer. Classification CORE + MODULE. Remote TLS/mTLS remains M7.3.
- **REQ-REC-02:** known-good signed rollback and anti-downgrade. Classification CORE/CONFIG. Physical powercut and secure boot pending.
- **REQ-STA-01/02:** journal retained through signed rollback; no physical durability claim.
- **REQ-OBS-01:** CLI/dashboard human-readable pass/fail, no keys in report. CI and cross-arch acceptance pending.
