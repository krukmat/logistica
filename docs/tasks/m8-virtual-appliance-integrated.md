# M8.1 — ARM64 1 GiB integrated virtual appliance (PROPOSED)

**Repo:** krukmat/logistica, main. **Status:** DOCUMENTED / NOT_IMPLEMENTED. No hardware purchase, hosted cloud, or guest changes authorized.

## Objective

Prove the **same** PEF Core, Linux driver and Cloud Lite working together on the pre-existing `pef-r28s-1g` Lima guest: systemd-managed Edge, cgroup-isolated Property/Host, fsync journal, local TLS1.3 mTLS, Cloud outage/recovery, and real VM stop/start. Do not claim field readiness, physical powercut, physical NIC, 72h retention or secure boot.

## Tasks (1–2 levels)

| Task | Dependency | Subtasks and acceptance | State |
| --- | --- | --- | --- |
| **M8.1.A — Guest contract** | M5.4, M5.6, M7.5.E | A1 inspect existing VM capabilities, service and kernel guards; A2 document explicit operator opt-in, cleanup and rollback without changing Mac services | PROPOSED |
| **M8.1.B — Integrated stack** | A, M6, M7.3/4 | B1 compose existing Edge release and real localhost mTLS Cloud Lite on one guest; B2 run existing Property/Host driver with actual Linux quotas and no insecure fallback | PROPOSED |
| **M8.1.C — Recovery journey** | B | C1 offline durable Property/Host operations, Cloud down/up and deduplicated ACK; C2 guest reboot, changed boot_id and session, journal/incident retention | PROPOSED |
| **M8.1.D — Evidence** | C, M7.5.D | D1 measure Edge, Cloud and worker process RSS, CPU, disk use, cgroup pressure and replay counts; D2 reproducible JSON/NDJSON + independent checks and read-only dashboard evidence | PROPOSED |

## Gates

- Require explicit VM-only operator ACK before any guest service modification or reboot. Reuse M5.4 Lima lifecycle contract; no privileged Mac changes.
- Kernel isolated workload and Cloud Lite must coexist with systemd in a **single run**; separate prior CI passes are not enough.
- Never silently raise 1 GiB RAM, bypass the Linux driver or fabricate an ACK to pass.
- Ensure offline service survives Cloud outage; require durable reopen/replay and clean rollback.
- Classify raw guest results as operator-supplied unless independently captured by CI.
- Physical M5.3 and 72h journal W1.10.G remain blocked; hosted Cloud remains deferred.

**Order:** A → B → C → D. Stop and report on resource starvation, ownership conflict, failed cleanup or durable-state inconsistency. No actual M8.1 test has run yet.
