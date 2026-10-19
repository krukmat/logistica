# M7.3–M7.6 — mTLS, recovery audit, stress and pilot gate

**2026-10-19 · main · Scope: real local software labs only; no hardware field deployment.**

## CI acceptance

- **M7.3** [CI #39293654717](https://github.com/krukmat/logistica/actions/runs/39293654717): SUCCESS, native ARM64 **218 PASS**, Linux x64 **217 PASS +1 skip**. Client/server mutual TLS 1.3 with ephemeral Ed25519 CA + SAN-scoped certificates; refusal of missing/foreign client cert, wrong issuer, invalid bearer, expiry-window policy; Property/Host real Edge journal reconciling over HTTPS without plaintext fallback. Artifacts: [x64](https://github.com/krukmat/logistica/actions/runs/39293654717/artifacts/12206147413) / [ARM64](https://github.com/krukmat/logistica/actions/runs/39293654717/artifacts/12206337817).
- **M7.4** [CI #39294591697](https://github.com/krukmat/logistica/actions/runs/39294591697): SUCCESS, real M3 restart/SAFE_MODE authenticated recovery reused; audit journal with fsync, correlated events, fixed allowlist and SHA256 chain, reopening + corruption rejection. CLI `m7:ops`, dashboard HTTP `m74Operations` tests.
- **M7.5/M7.6 core** [CI #39295301813](https://github.com/krukmat/logistica/actions/runs/39295301813): SUCCESS native ARM64 **225 PASS**, Linux x64 **224 PASS+1 skip**. Two full M6.4 real HTTP failure cycles with latency/CPU/RSS measurements. Gate `m7:pilot` aggregates *actual* current-run M7.1–M7.5 lab smokes and refuses physical pilot. Artifacts: [x64](https://github.com/krukmat/logistica/actions/runs/39295301813/artifacts/12206948984), [ARM64](https://github.com/krukmat/logistica/actions/runs/39295301813/artifacts/12207826363).
- **M7.3–M7.6 dashboard HTTP integration now validated:** [CI #39295644533](https://github.com/krukmat/logistica/actions/runs/39295644533) SUCCESS (Linux ARM64 227 PASS; x64 226 PASS+1 skip; 0 fail). All four dashboard HTTP tests, CLI and artifacts, netns/systemd/prehardware jobs passed. Last documentation-only commit has a separate CI run.

## Important security and validation limits

- TLS server **requires client certificates** when opt-in TLS is provided. It compares the client's URI SAN to `siteId/deviceId` for authenticated event ingest. CA is generated locally, no trust-store writes, no public TLS. Certificate renewal proves a *second same-scope certificate is accepted*; this is **not revocation**. TLS keys are generated separately from M7.1 software identity; **no proof they represent the same private key** or production device identity. Bearer token remains required.
- M7.4 is an append-only host-file **hash chain**, which can detect partial alterations but not an attacker rewriting the full chain/hash. The operator action journal is auth-gated; live M3 recovery tested separately. It is not a new production recovery endpoint or remote recovery workflow.
- M7.5 short CI stress is a repeated fault-matrix **functional resource smoke**, not 2–24h endurance. The `m7:stress -- --hours 2` command requires `PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL`; it has **not been executed**. The journal's W1.10.G 72h storage gap remains.
- M7.6 decision **GO_SOFTWARE_LAB_ONLY / fieldPilotAuthorized=false**, based on actual software lab evidence. Mandatory field blockers include long-run endurance, real NIC/WAN, physical storage powercut, physical energy/thermals and documented operator rollout. BOM hardware unit price/Watt remains null, never invented. No remote hosted Cloud, hardware or production OTA tests.

## Gates and next actions

1. Verify **final dashboard M7.3–M7.6** x64/ARM64 CI, update status to final accepted software lab.
2. Validate optional long runner for 2h on existing Mac/VM only when operator elects; note its smoke cycles are not production workload aging or 72h retention.
3. Evaluate M7.3 follow-ups: certificate revocation and binding the TLS certificate key to M7.1 identity proof; do not enable on a public interface until secured provisioning exists.
4. Physical M5.3 (NIC, storage power loss, energy/thermal), 72h journal and production pilot remain blocked.

**Classification:** CORE authorization/scoped certificate policy, ADAPTER HTTPS/local CA/fsync ledger, MODULE authenticated Edge test, CONFIG lab-only trust, RESOURCE bounded Cloud and endurance cycles. Requirements REQ-SEC-01/02, REQ-STA-01/02/03, REQ-REC-01, REQ-OBS-01, REQ-API-01, REQ-LOC-01, REQ-CLO-01.
