# M7.5.D/E – M7.6.A evidence boundary (2026-10-20)

**Scope:** PEF software-only, existing GitHub Actions x64/native ARM64, 127.0.0.1 HTTPS TLS1.3 mTLS, synthetic WAN, no hosting/device.

- **D1**: M7.5 captures one harness parent PID memory vector per cycle: rss/heapUsed/heapTotal/external/arrayBuffers and Node active resources. Observed earlier 2h ~54MiB RSS drift requires process/GC attribution; current samples alone do not prove a leak.
- **D2/D3 OPEN**: Edge child/process memory must be separately attributed. The old `REPLAY_NO_DATA_LOSS` based only on positive durations was replaced with explicit checks against M6.4 Property/Host fsynced receipt and deduplicated replay results.
- **E1/E2**: A new long-lived local TLS Cloud Lite server and Property/Host Edge pair performs paced ALERT/OPEN and ACK under offline operation, synthetic WAN restore, genuine localhost Cloud stop/restart, durable replay, Edge reopen, and resource samples. Dashboard/CLI use a **six-second** bounded run; it is a functional exposure and CI regression, NOT steady-state proof. The 15–30m operator profile is gated behind explicit opt-in and remains NOT_RUN.
- **A1–A3**: A read-only JSON importer checks `PEF_M75_OPERATOR_LONG_SOAK_V1` metadata, elapsed wall duration, 110–130 periodic samples, timestamp monotonicity/span, failure count, per-probe status and software scope. It records an untrusted SHA256 content fingerprint. Import is not an authenticated source, at-rest signature, trusted device attestation, continuous load proof or field clearance. `TWO_HOUR_ENDURANCE=false` and all physical blockers remain.
- **Next gate**: confirm GitHub Actions test jobs at the latest commit; then use targeted test results for worker-memory attribution and plan M8.1, not repeat uninstrumented 2h/24h runs.

No hardware purchase, production rollout, privileged Mac operations or hosted Cloud deployment occurred. This note is implementation scope documentation, not a claim of CI success until tests are green.


## Mac ARM64 operator result — 2026-10-20 (6-second M7.5.E)

**Evidence source:** operator-pasted CLI JSON in conversation, not separately captured Mac telemetry. Command: `npm run m7:sustained -- --seconds 6`, with `intervalMs=800`. Result: `PEF_M75_SUSTAINED_MTLS_LAB_V1`, `LAB_PASS`, `ok=true`, eight checks true, `elapsedMs=6213`.

- Durable local operations: Property 8, Host 8 (16 combined). Local failures 0; no pending journal entries after reconciliation. Property/Host workers are included in the integrated scenario.
- Cloud Lite reported `remoteStoredEvents=20`, versus 16 counted operations; the current `CLOUD_LEDGER_REOPEN_MATCHES` check only requires `remoteStoredEvents >= generatedDurableOperations` and persistence of the count across Cloud restart. **Exact per-event attribution and set equality are not established**. Follow-up should distinguish accepted user events from control/transition events and verify identifiers with no missing/extra business events.
- Median incident+ACK pair latency: 37ms in localhost laboratory, **not throughput certification**.
- Three fault labels observed: `WAN_SYNTHETIC_RESTORED`, `REAL_CLOUD_LITE_HTTP_DOWN`, `REAL_CLOUD_LITE_HTTP_RESTARTED`. Real TLS was exercised, physical WAN was not.
- Harness parent RSS samples: 70,483,968 → 89,948,160 bytes (+19,464,192 bytes, ~18.6 MiB). Heap used: 9,671,408 → 12,064,416 bytes (+2,393,008 bytes, ~2.3 MiB). `ProcessWrap=2` throughout captured samples. **Not a worker RSS measurement or proof of a memory leak/plateau**.
- `workerRssValidated=false`, `physicalValidated=false`, `powerCutValidated=false`, `seventyTwoHourRetentionValidated=false`. No 15–30 minute test was executed.
- The separately invoked dashboard started on `http://127.0.0.1:8787/`. This is a **new laboratory session**, not a viewer of the prior CLI test's disposed temporary state.

**Decision:** `M7.5.E` six-second Mac ARM64 software-lab functional smoke **OPERATOR_LAB_PASS**, in addition to CI #39451324645. Leave M7.5.D2 (per-process RSS attribution), M7.5.D3 (steady-state), M7.5.E3 (15–30m characterized run), and exact remote ledger count reconciliation OPEN. M8.1 remains PROPOSED. Field pilot remains NO-GO.

## M7.5.D2 implementation — worker PID attribution (2026-10-20)

The Node-only worker driver already exposes a METRICS IPC request. M7.5.D2 extends this supported process-port with heap, external, arrays and active-resource kinds, verifies child PID consistency and makes it available only via Edge's authenticated read-only **virtual-lab** endpoint. The sustained M7.5.E runner now records separately sampled Property and Host child RSS/heap/CPU in every cycle, alongside unchanged parent metrics; UI displays a worker summary plus source JSON.

Key semantic distinction: **there are three Node OS processes** in the existing M7.5.E harness, not four. One Node parent contains both in-process autonomous Edge hosts, the Cloud Lite HTTP/TLS server and harness; the other two are forked site-operation workers. Child-PID metrics come from actual child process IPC, not parent `process.memoryUsage()`. Do not interpret parent RSS as individual Cloud Lite/Edge RSS. `workerRssValidated` tests independent child measurements and does not certify steady-state or kernel memory isolation. `edgeCloudRssSeparatelyValidated=false`, no physical verification.

CI accepted in #39455644514; Mac operator rerun of new per-worker series is pending. Next: D3 characterize per-PID drift over a short reproducible run, only afterward consider longer opt-in.

**D2 CI gate**: [#39455644514](https://github.com/krukmat/logistica/actions/runs/39455644514) Linux x64 235 PASS + 1 skip and native ARM64 236 PASS, zero failures. The report distinguishes worker PID-specific memory metrics from the shared harness/Edge/Cloud process. No Mac M5 child metrics result has yet been reported.

## M7.5.D3 descriptive trend analyzer implementation (2026-10-20)

The M7.5.E runner now sends real per-PID RSS and heap series to pure Core `analyzeM75MemoryTrend`. Each result includes sample coverage, whole-run RSS/heap deltas, post-warmup least-squares slope in MiB/min and robust difference between early and late tail thirds; strict parent/property/host PID and chronological consistency. Negative cases fail closed; no magic leak or stability gate. A 6s run reports `INSUFFICIENT_OBSERVATION_WINDOW`, not a fictitious measurement of 60s+ steady state. The exposed 60-second threshold and +1 MiB/min/+0.75 MiB heuristic are provisional **screening diagnostics**, not validated budget limits or a measured outcome.

Provenance: synthetic unit fixtures and actual short CI lab checks test the code, **not** the host Mac 60–90s RSS trend. Edge + Cloud share one Node PID. Forced GC disabled; calibration and 15–30m operator soak remain pending. Strict field NO-GO unchanged.
