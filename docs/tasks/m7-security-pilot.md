# M7 — Seguridad y preparación del piloto

**Inicio: 2026-10-19, branch `main`.** M7.1/M7.2 **CLOSED — SOFTWARE LAB ONLY**, with current-HEAD CI success; x64/ARM64 and dashboard gates passed. M7.3/M7.4 closed local CI software lab; M7.5 short stress closed, 2h periodic operator run PASS, 4–24h pending; M7.6 lab gate implemented, field pilot NO-GO. No purchased hardware, hosted cloud, external services or operator system changes.

## M7.1 — Identidad criptográfica de Edge (P0)

| ID | Dependencies | Delivery / acceptance | State |
| --- | --- | --- | --- |
| M7.1.A | M6 registry, Core identity | Ed25519 256-bit-curve software private key created once with 0600 + fsync (file and directory), pinned `siteId/deviceId/revision` | CLOSED — SOFTWARE LAB ONLY |
| M7.1.B | A | Challenge/nonce signed with persistent key, Ed25519 public verification and foreign-scope/nonce/modified-signature rejection | CLOSED — SOFTWARE LAB ONLY |
| M7.1.C | A–B | Open identical key after process reopen; refuse revision mismatch, storage corruption and silent key regeneration; CLI, dashboard HTTP, x64/ARM64 CI | CLOSED — SOFTWARE LAB ONLY |

Files: `src/core/m71-identity-policy.js`, `src/adapters/m71-identity-keystore.js`, `src/runtime/m71-identity-smoke.js`, `bin/pef-m71-identity.js`, `test/m71-identity.test.js`. Command: `npm run m7:identity`. Dashboard action `m71Identity`.

**Security boundary:** local filesystem private key is **software protected only**, not TPM, Secure Enclave, HSM, hardware-backed, attested or cert-registered. The operator's already-existing lab boot metadata is NOT silently substituted for a trusted identity; M7.1 is an explicit separate opt-in keystore. Application compromise with the device user's read privileges can copy this key. Revision changes currently require explicit provisioning/authorization policy (not automatic device rotation).

## M7.2 — Permisos firmados y rollback sobre M5 (P0)

| ID | Dependencies | Delivery / acceptance | State |
| --- | --- | --- | --- |
| M7.2.A | M5.1/M5.2 + M7.1 Trust principle | Pin a distinct Ed25519 **release authority** public key in the scoped installer root; verify signed `version/digest/rootId/ordinal/sequence/predecessor` before M5's atomic state activation | CLOSED — SOFTWARE LAB ONLY |
| M7.2.B | A | Ordinal high-water/floor blocks stale/downgrade as upgrade; explicit signed rollback only to the prior known-good release; no unsigned legacy activation if trust is pinned | CLOSED — SOFTWARE LAB ONLY |
| M7.2.C | A–B | Real packaged Edge boots and fsyncs a Property event; tampered signature and state denied, interrupted upgrade leaves active unchanged, injected failed health check triggers preauthorized rollback retaining journal; CLI/dashboard/x64/ARM64 tests | CLOSED — SOFTWARE LAB ONLY |

Files: `src/core/m72-signed-update-policy.js`, `src/adapters/m72-trust-anchor.js`, added signed guard inside `src/runtime/m5-install.js`, `src/runtime/m72-signed-upgrade.js`, `src/runtime/m72-signed-release-smoke.js`, `bin/pef-m72-signed-release.js`, `test/m72-signed-release.test.js`. Command: `npm run m7:release`. Dashboard `m72Release`.

The M5 **legacy unsigned ephemeral lab** remains available for regression *only when no pinned trust exists*. Once a trust anchor has been provisioned, `applyRelease` rejects unsigned activation. No retroactive enablement on an unsigned already-installed root. The trust anchor and signed state are software files, not hardware-protected monotonic counters; an adversary who can modify or restore older copies of **state.json** (or the entire filesystem) can bypass this software-only high-water; such attacks are **out of scope** pending a monotonic hardware/remote authority. No secure boot/firmware verification or remote OTA distribution is implied. The health failure is an **injected negative result after actually starting a packaged Edge**, not a witnessed physical hardware fault. Rollback is preauthorized by a distinct signed transition.

## M7.3–M7.6 — software delivery, dependencies and truthful gates

| Task | Inputs | DoD / major subtasks | State |
| --- | --- | --- | --- |
| M7.3 — TLS/mTLS trust | M7.1 + M6 Cloud Lite | A: ephemeral Ed25519 CA and TLS1.3; B: SAN scope and foreign/expired policy, no plaintext fallback; C: second cert accepted, Cloud failure offline; no revocation/identity-key unification | CLOSED LOCAL LAB CI #39293654717; production identity pending |
| M7.4 — Operational recovery | M7.2 + M3/M5 | A: reuse M3 health and recovery; B: fsync hash-chain correlated audit; C: authenticated operator evidence, no new production recovery endpoint | CLOSED LOCAL LAB CI #39294591697; production interface pending |
| M7.5 — Endurance and resource economics | M7.3/4 + M6 | A: short repeated real HTTP stress; B: operator 2h periodic local run passed; C: memory drift analysis and continuous workload still pending, 72h retention not validated | SHORT LAB PASS CI #39295301813; 2H PERIODIC OPERATOR LAB_PASS; MEMORY TREND OPEN |
| M7.6 — Software pilot readiness | M7.1–5 | A: real software gates Property/Host; B: BOM placeholders without invented prices; C: conservative GO_SOFTWARE_LAB_ONLY / fieldPilotAuthorized=false | LAB GATE PASS CI #39295301813; physical pilot NO-GO |

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

All tests operate with private ephemeral OS directories and do not install keys or systemd units on the Mac. CI artifacts `pef-m7-identity-release-x64` and `pef-m7-identity-release-arm64` were uploaded in [CI #39286831769](https://github.com/krukmat/logistica/actions/runs/39286831769): x64 [artifact](https://github.com/krukmat/logistica/actions/runs/39286831769/artifacts/12202713938), ARM64 [artifact](https://github.com/krukmat/logistica/actions/runs/39286831769/artifacts/12203461977).

### Requirement/change tracking

- **REQ-SEC-01:** added M7.1 software asymmetric identity port. Classification CORE + MODULE/CONFIG. Physical trust anchor pending.
- **REQ-SEC-02:** added signed release policy on existing M5 installer. Classification CORE + MODULE. Remote TLS/mTLS remains M7.3.
- **REQ-REC-02:** known-good signed rollback and anti-downgrade. Classification CORE/CONFIG. Physical powercut and secure boot pending.
- **REQ-STA-01/02:** journal retained through signed rollback; no physical durability claim.
- **REQ-OBS-01:** CLI/dashboard human-readable pass/fail, no keys in report. CI and cross-arch acceptance verified in GitHub Actions #39286831769.

### Current-head final acceptance — 2026-10-19

[GitHub Actions #39286831769](https://github.com/krukmat/logistica/actions/runs/39286831769) SUCCESS for `fc9ac7f72f70bd30a3106dad0aa2d65689f56185`: Linux ARM64 **216 PASS / 0 fail**, Linux x64 **215 PASS +1 skip / 0 fail**. Dashboard HTTP `m71Identity` and `m72Release` PASS. Independent CLI `npm run m7:identity` and `npm run m7:release` PASS on both architectures, with uploaded artifacts. Dedicated Linux systemd and namespace jobs and prehardware gate SUCCESS. `bin/pef-edge.js` now verifies the **active pinned M5 release and signed integrity** before loading runtime modules when executed from a versioned release; tampered packaged boot is rejected (regression at same SHA). These results close M7.1 and M7.2 **software lab only**, not physical trusted boot or TPM-protected rollback.

## Operator commands M7.3–M7.6 (2026-10-19)

```bash
git switch main && git pull
npm run m7:mtls       # Real TLS1.3 mTLS Edge→Cloud Lite (loopback, ephemeral CA)
npm run m7:ops        # M3 recovery + fsync correlated hash-chain audit
npm run m7:stress     # Short 2-cycle HTTP fault-matrix smoke only
npm run m7:pilot      # Re-runs real lab evidence; physical pilot remains NO-GO
npm run dashboard     # Lab → M7.1 ... M7.6
```

To deliberately run an extended experiment on **your own Mac/VM**, no hardware purchase:

```bash
export PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL
npm run m7:stress -- --hours 2 > m75-long-soak.json
unset PEF_M75_LONGRUN_ACK
```

**The 2h option was executed on Mac ARM64 (operator evidence, 2026-10-20), LAB_PASS 119/119 periodic cycles, 0 failures.** 4h/8h/24h remain NOT_RUN. Do not claim continuous 2h load or 72h retention. It generates repeated real localhost fault tests, not realistic P0/P1 load over 72h. No commercial pilot GO until physical M5.3 and other blockers close. The mTLS certificate key is independent of M7.1 Ed25519 identity; renewable certificate does not imply revocation, TPM or production PKI. Certificate/authority scope is loopback only. [Audit M7.3–M7.6](../audit/m7-3-6-security-pilot-lab-2026-10-19.md).

### Integrated M7.3–M7.6 HTTP/UI CI acceptance

[CI #39295644533](https://github.com/krukmat/logistica/actions/runs/39295644533) SUCCESS: native ARM64 **227/227**, x64 **226 PASS +1 skip**, no failures; M7.3, M7.4, M7.5, M7.6 dashboard action tests all PASS; short stress + local lab readiness gate emitted evidence on both architectures. **M7.3 and M7.4 CLOSED SOFTWARE LAB**, M7.5 SHORT STRESS LAB PASS / 2–24h NOT_RUN, M7.6 SOFTWARE LAB GATE PASS / PHYSICAL FIELD NO-GO. The test did not authorize a commercial/site device deployment.

### M7.5 operator result — 2026-10-20

The operator ran `npm run m7:stress -- --hours 2` on macOS ARM64 with explicit opt-in. `PEF_M75_OPERATOR_LONG_SOAK_V1` returned `LAB_PASS`, `elapsedMs=7200025`, `sampleCount=119`, `failures=0`. This meets **two-hour periodic functional soak lab gate**, not a sustained-load or memory-stability gate. RSS observations grew from 92,078,080 to 148,602,880 bytes; **M7.5.D memory attribution OPEN**. **M7.5.E sustained load characterization OPEN**, 24h and 72h NOT_RUN. The M7.6 executable gate still hardcodes `TWO_HOUR_ENDURANCE=false` until validated external evidence ingestion, therefore it must not be misinterpreted as a failed operator soak. Field pilot remains NO-GO. [Operator audit](../audit/m75-operator-2hour-soak-2026-10-20.md).

## M7.5.D/E and M7.6.A — targeted continuation (2026-10-20)

No physical pilot or hosted infrastructure is authorized. All tests use loopback, ephemeral software credentials and synthetic WAN.

| ID | Dependencies | Executed delivery / remaining gate | State |
| --- | --- | --- | --- |
| **M7.5.D1** | M7.5 periodic run | Samples `rss/heapUsed/heapTotal/external/arrayBuffers`, PID and active resource kinds before/after each real M6.4 cycle; replaces duration-based replay assertion with verified Property/Host scenario results | IMPLEMENTED, CI evidence to be checked |
| **M7.5.D2** | D1 | Observe worker child RSS/heap/CPU and active Node resources per PID, preserving Edge/Cloud shared-PID boundary; GC-controlled trend still D3 | CLOSED SOFTWARE LAB, CI #39455644514 |
| **M7.5.D3** | D1–D2 | Run comparable sampling series, characterize plateau/trend and publish thresholds grounded in measured workload | OPEN |
| **M7.5.E1** | M6 + M7.3 + D1 | Persistent local TLS1.3/mTLS Cloud Lite with Property and Host Edge processes, paced incident/ACK writes, synthetic WAN restore, actual HTTP server outage/restart, replay, fsync and Edge reopen | IMPLEMENTED, CI integration gate pending |
| **M7.5.E2** | E1 | Six-second bounded test accessible from dashboard and `npm run m7:sustained -- --seconds 6`; automated regression x64/ARM64 | IMPLEMENTED, CI acceptance pending |
| **M7.5.E3** | E2 | Operator-controlled 15–30 minute paced study with reproducible rate/payload, worker attribution, resource series and thresholds; **never auto-launch** | NOT_RUN |
| **M7.6.A1** | operator JSON + D1 | Read-only operator JSON inspector checks identity/scope, duration, sample chronology, observed failure count and 2h periodic coverage; SHA256 fingerprint is NOT authenticity | IMPLEMENTED, CI acceptance pending |
| **M7.6.A2** | A1 | Existing `m7:pilot` CLI optionally reads `--evidence /absolute/file.json`; dashboard allows local JSON input with no persistence or privileged access | IMPLEMENTED, CI acceptance pending |
| **M7.6.A3** | A2 | Reject malformed/falsified shape with negative automated tests; preserve `TWO_HOUR_ENDURANCE=false` because periodic load != sustained 2h | IMPLEMENTED, CI acceptance pending |

For the six-second M7.5.E test:
```bash
git switch main && git pull
npm run m7:sustained -- --seconds 6
npm run m7:pilot -- --evidence /absolute/m75-long-soak.json
npm run dashboard  # lab → M7.5.E and M7.6 operator import
```

Longer runs are explicitly opt-in. The CLI requires `PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL` beyond 30 seconds, and limits execution to 1800 seconds; no unattended 2–24h test is scheduled. **The prior 2h operator JSON was described in an audit but raw samples are not committed**, so M7.6 does not automatically mark that external file as inspected. Even a shape-valid import has `authenticityVerified=false`, `continuousLoadValidated=false`, and `fieldPilotAuthorized=false`. Memory metrics cover the harness parent PID, not isolated Edge/worker RSS. Hardware/72h/powercut/energy gates remain NO-GO.

[Targeted test implementation](../../src/runtime/m75-sustained.js) · [operator validator](../../src/runtime/m76-evidence-import.js) · [original 2h audit](../audit/m75-operator-2hour-soak-2026-10-20.md). Next after green CI and targeted characterization: **M8.1 persistent ARM64 virtual-appliance integration**, explicitly a software pilot, not M5.3 hardware certification.

### CI verified follow-up (2026-10-20)

[Run #39451324645](https://github.com/krukmat/logistica/actions/runs/39451324645) SUCCESS: ARM64 234/234 PASS; x64 233 PASS + 1 skip; zero failures, dashboard, Linux namespace, systemd and prehardware checks SUCCESS. M7.5.D1 (parent memory/resource series), M7.5.E1/E2 (six-second persistent local mTLS Property/Host fault journey) and M7.6.A1-A3 (unattested operator JSON inspection) are CLOSED for **bounded software-lab scope only**. M7.5.D2/D3 worker memory attribution and stability, M7.5.E3 15–30min characterization, physical M5.3 and W1.10.G remain OPEN/NOT_RUN. Field pilot NO-GO.

### M7.5.D2 — worker process resource attribution (2026-10-20)

**Task / requirement:** M7.5.D2, REQ-OBS-01; `MODULE/RESOURCE`. Dependency: M7.5.D1 and persistent M7.5.E. **State: CLOSED — SOFTWARE LAB ONLY, CI #39455644514**.

- **D2.a**: extend existing allowlisted Property/Host Node `METRICS` IPC to include PID, RSS, heap used/total, external and arrayBuffer bytes, cumulative CPU, active Node resource counts and uptime; verify stable child PID through the Core supervisor process-driver port.
- **D2.b**: provide a token-gated, read-only virtual-lab `GET /lab/workload/metrics` on autonomous Edge. No arbitrary PID lookup, shell execution, unguarded Linux port or Mac privileged operations. Unauthenticated calls return HTTP 403.
- **D2.c**: sample both child processes in every M7.5.E iteration; record `resourceSamples[].workers.{property,host}`, `workerProcessMetrics` (PID, first/last/max RSS, delta, sample count), and a dedicated summary in the dashboard. Negative tests reject missing credentials; x64/native ARM64 CI required.

**Truth boundary:** Edge Property, Edge Host, HTTPS Cloud Lite and the M7.5 harness remain **in one parent Node PID**; the separate subprocesses are the two unsandboxed site-operation workers. `workerRssValidated` only certifies child-PID sampling. `edgeCloudRssSeparatelyValidated=false` by design. Parent RSS is a shared Edge+Cloud+harness measurement; it cannot be allocated among components, and naive RSS sums may double-count shared memory. Node child resource counts are diagnostic handles, not kernel FD totals; no GC/steady-state leak conclusion. **M7.5.D3 and 15–30min E3 remain OPEN.** The six-second CI/demo never licenses physical pilot.

Command: `npm run m7:sustained -- --seconds 6`, then `npm run dashboard` → Laboratorio integrado → M7.5.E → «RSS/heap por proceso». [Runtime](../../src/runtime/m75-sustained.js), [worker](../../src/workloads/site-operations-worker.js), [supervisor](../../src/core/workload-supervisor.js), [tests](../../test/m75-endurance.test.js).

**D2 acceptance:** CI [#39455644514](https://github.com/krukmat/logistica/actions/runs/39455644514) passed on code commit `95ca431`: ARM64 236/236 and x64 235 PASS + 1 skip, zero failures. Covers actual two-worker PID/RSS read-only metrics through Edge/dashboard, anonymous denial, PID substitution rejection and deterministic Cloud-outage evidence. Mac M5 operator rerun with updated per-worker metrics remains NOT_RUN; does not block laboratory CI acceptance. D3 worker/parent trend classification OPEN.

### M7.5.D3 — descriptive memory-trend instrumentation (2026-10-20)

**Task:** M7.5.D3 · **Requirement:** REQ-OBS-01 · **Change:** added · **Classification:** CORE (pure memory statistics) + MODULE/RESOURCE (runner, CLI, dashboard). **Dependencies:** D1/D2 and E1/E2.

| Subtask | Implementation / DoD | State |
| --- | --- | --- |
| D3.1 | Portable per-PID RSS+heap first/last/max, linear trend (MiB/min) on a post-warmup window, median-of-thirds shift; reject invalid timestamps, PID swaps, missing worker metrics and colliding PIDs | IMPLEMENTED; synthetic positive/negative tests |
| D3.2 | Make **INSUFFICIENT_OBSERVATION_WINDOW** explicit for 6s smoke; require requested >=60s, sampled span >=45s, >=16 samples, tail >=30s and >=12 samples; label upward/no-clear/downward trend only, no automatic leak/plateau claims | IMPLEMENTED; synthetic tests |
| D3.3 | `memoryTrend` included in M7.5.E JSON and existing HTTP/dashboard action; read-only `npm run m7:memory -- --report /absolute/m75.json`; x64/ARM64 CI required, operator Mac trend still NOT_RUN | IMPLEMENTED / CI_PENDING |

**Diagnostic thresholds are provisional heuristics, not empirically calibrated guarantees:** upward: linear tail RSS >=+1 MiB/min **and** tail robust median shift >=+0.75 MiB; downward equivalent negative. Warmup = max(5s, first 20% of observed span). No forced GC, remote attestation, physical RAM equivalence or per-component Edge/Cloud memory accounting. Stable/no-clear classification does **not** mean a proved plateau. Neither the 6s smoke nor synthetic trend fixtures provide evidence of production memory stability. Test 60–90s locally with explicit operator opt-in; classify that outcome separately, then decide whether E3 15–30min makes sense. The older operator's 2h periodic matrix must not be used as continuous M7.5.E trend evidence.

**Operator procedure (90 seconds, explicitly opted in):**

```bash
git switch main && git pull
PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL npm run m7:sustained -- --seconds 90 > m75-memory-90s.json
npm run m7:memory -- --report m75-memory-90s.json
```

The 90s command is **not run automatically** in CI or by the dashboard. It modifies only temporary localhost software-lab resources. No Linux root, VM modifications, cloud charges or new hardware. [Analyzer](../../src/core/m75-memory-trend.js) · [tests](../../test/m75-memory-trend.test.js). **D3 status:** implementation and CI gates pending; **Mac empirical characterization NOT_RUN**.

**D3 fault-phase refinement:** the latest runner labels every RSS/heap observation with `OFFLINE`, `WAN_RESTORED`, `CLOUD_OUTAGE` or `RECOVERED`. The analysis reports a **whole post-warmup trend mixing fault transitions** separately from `postRecovery`, whose own slope requires at least 30 s and 12 samples entirely in `RECOVERED`. Phase labels must not regress; missing or inconsistent labels are rejected (older completely unlabeled reports are admitted for limited whole-run trend analysis). A 90s operator test generally has only ~22.5 s after Cloud recovery, so `postRecoveryTrendEligible=false` is expected. An **optional** 180s operator run provides ~45 s after recovery in normal scheduling, without guaranteeing stability or forcing GC:

```bash
PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL npm run m7:sustained -- --seconds 180 > m75-memory-180s.json
npm run m7:memory -- --report m75-memory-180s.json
```

Neither command is run by CI or the Mac dashboard. **Acceptance nuance:** D3 source/CLI/dashboard/automated tests may close as software-lab implementation once green; actual Mac memory-trend characterization requires new operator evidence and remains pending.

**D3 software CI acceptance (2026-10-20):** [CI #39459546240](https://github.com/krukmat/logistica/actions/runs/39459546240) `SUCCESS` at code commit `0175b0f`, ARM64 **245/245 PASS**, x64 **244 PASS + 1 skip**, zero failures; dashboard HTTP, systemd, netns and prehardware-gate passed. **D3.1–D3.3 CLOSED for software analyzer/CLI/dashboard scope.** Full Mac M5 **90–180s descriptive resource characterization remains NOT_RUN**, and memory stability / leak diagnosis remain **UNVALIDATED**; do not mark the empirical D3 conclusion as closed. Next operator evidence should preserve the complete M7.5.E raw JSON, observe `memoryTrend`, and avoid conclusions from a 6s sample.
