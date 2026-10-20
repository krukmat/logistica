# M7.5.D/E – M7.6.A evidence boundary (2026-10-20)

**Scope:** PEF software-only, existing GitHub Actions x64/native ARM64, 127.0.0.1 HTTPS TLS1.3 mTLS, synthetic WAN, no hosting/device.

- **D1**: M7.5 captures one harness parent PID memory vector per cycle: rss/heapUsed/heapTotal/external/arrayBuffers and Node active resources. Observed earlier 2h ~54MiB RSS drift requires process/GC attribution; current samples alone do not prove a leak.
- **D2/D3 OPEN**: Edge child/process memory must be separately attributed. The old `REPLAY_NO_DATA_LOSS` based only on positive durations was replaced with explicit checks against M6.4 Property/Host fsynced receipt and deduplicated replay results.
- **E1/E2**: A new long-lived local TLS Cloud Lite server and Property/Host Edge pair performs paced ALERT/OPEN and ACK under offline operation, synthetic WAN restore, genuine localhost Cloud stop/restart, durable replay, Edge reopen, and resource samples. Dashboard/CLI use a **six-second** bounded run; it is a functional exposure and CI regression, NOT steady-state proof. The 15–30m operator profile is gated behind explicit opt-in and remains NOT_RUN.
- **A1–A3**: A read-only JSON importer checks `PEF_M75_OPERATOR_LONG_SOAK_V1` metadata, elapsed wall duration, 110–130 periodic samples, timestamp monotonicity/span, failure count, per-probe status and software scope. It records an untrusted SHA256 content fingerprint. Import is not an authenticated source, at-rest signature, trusted device attestation, continuous load proof or field clearance. `TWO_HOUR_ENDURANCE=false` and all physical blockers remain.
- **Next gate**: confirm GitHub Actions test jobs at the latest commit; then use targeted test results for worker-memory attribution and plan M8.1, not repeat uninstrumented 2h/24h runs.

No hardware purchase, production rollout, privileged Mac operations or hosted Cloud deployment occurred. This note is implementation scope documentation, not a claim of CI success until tests are green.
