# M7.5 — Mac ARM64 operator 2-hour intermittent Cloud Lite soak

**Date: 2026-10-20. Evidence source: operator-shared terminal JSON**, not independently captured CI telemetry. GitHub CI short smoke acceptance remains independently verified.

## Result

- Command: `PEF_M75_LONGRUN_ACK=EXPLICIT_OPERATOR_LONG_SOAK_LOCAL npm run m7:stress -- --hours 2`.
- `kind=PEF_M75_OPERATOR_LONG_SOAK_V1`; `status=LAB_PASS`, `ok=true`; `requestedHours=2`; `elapsedMs=7200025` (2 h + 25 ms).
- `sampleCount=119`, `failures=0`; all 119 periodic real localhost HTTP Cloud Lite fault-matrix probes reported `ok=true`.
- `platform=darwin`, `arch=arm64`, workload `REAL_HTTP_CLOUD_LITE_FAILURE_MATRIX`.
- First reported `peakRssBytes=92078080` (~87.8 MiB), final `peakRssBytes=148602880` (~141.7 MiB), a **+56524800 B (+53.9 MiB, +61.4%)** change across the run. The first-to-last drift is a **risk requiring investigation**, not a confirmed memory leak nor evidence of steady state.
- Typical observed per-probe elapsed durations were about 0.7–0.9s. Source code `runM75LongSoak` runs one `runM75ShortSoak({cycles:1})` and then sleeps up to 60s. Thus this represents **119 discrete periodic cycles across two hours**, NOT continuous full-load/stress utilization for two hours. Approximately 100s of fault-matrix execution in 7200s wall time.
- `peakRssBytes` is `Math.max(initialRss,process.memoryUsage().rss)` within an individual single-cycle run, measured only before/after that probe. It is **not a continuous peak/high-water meter**, not necessarily the Edge worker RSS, and the Node process can retain committed V8 heap after GC. Root cause (retained objects, HTTP connection pools, allocation churn/GC, Node heap reserve) is not yet established.

## Acceptance and limitations

**M7.5 two-hour intermittent functional soak: OPERATOR_LAB_PASS.** Functional failure count=0, workload ran over requested wall-clock time. It does NOT prove memory stability, 24h duration, 72h P0/P1 retention, disk-capacity safety, sustained throughput, production MTBF, power-cut durability, energy/thermals, WAN physical NIC or field readiness.

**M7.6 current code gate has NOT ingested this external operator evidence.** `src/runtime/m76-pilot-gate.js` currently hardcodes `TWO_HOUR_ENDURANCE:false` and will still report that blocker until a separate evidence-import validation flow is implemented and tested. We must not simply flip a hardcoded boolean to assert a physical pilot. The hardware-specific blockers remain.

## Next follow-ups (software-first)

- **M7.5.D — Memory attribution**: record `rss/heapUsed/heapTotal/external/arrayBuffers` plus active handles and process count from the same long-run Node process; optionally explicit `global.gc()` in a controlled test to distinguish growing live heap vs RSS allocator behavior. Attribute Cloud Lite/Edge subprocess lifetimes/HTTP socket reuse. Define leak threshold only after a baseline and valid comparison; no fabricated guarantee.
- **M7.5.E — Endurance characterization**: distinguish wall-clock periodic cycles from continuous workload. Add sustained-load phase and resource series with reproducible rate, payload and thresholds; only execute multi-hour runs when explicitly requested by operator.
- **M7.6.A — External evidence ingestion**: explicitly verify trusted/operator-provided JSON shape, requested duration, sample count/time span, failures and scope. Update lab readiness record while **retaining field NO-GO** until physical and operational gates close. Do not infer that arbitrary JSON proves device authenticity or physical tests.

**Decision:** M7.5 retains `SHORT_CI_LAB_PASS`; adds `TWO_HOUR_PERIODIC_OPERATOR_LAB_PASS` as independently scoped evidence. M7.6 software lab GO remains, physical field pilot NO-GO.
