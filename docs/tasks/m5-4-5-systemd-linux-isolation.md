# M5.4–M5.5 — Linux service boot and kernel-isolated Site overlays

**2026-10-19 · main** · **M5.4:** CLOSED — SOFTWARE LAB ONLY, actual Lima ARM64 whole-VM restart LAB_PASS (operator-reported). **M5.5:** CI kernel isolation Property and Host LAB_PASS; physical M5.3 remains BLOCKED.

## M5.4 — Linux service lifecycle

| Subtask | Deliverable / DoD | Result |
| --- | --- | --- |
| M5.4.a | Render allowlisted systemd unit, offline-compatible boot, least privilege and bounded restart without changing Core | IMPLEMENTED; x64/ARM64 Node tests PASS |
| M5.4.b | Actual systemd PID1 on ephemeral GitHub-hosted Linux, run staged autonomous Edge, fsync operation, SIGKILL/restart and reopen | **LAB_PASS** CI #39238362163 and #39239226280 |
| M5.4.c | Prepare/stop-start Lima ARM64 VM, service automatically restarts on OS boot; ensure boot_id changes, session changes, journal persists; cleanup | **CLOSED LAB:** operator executed complete Lima stop/start, verified all 5 checks and cleaned test service |

M5.4.b is not a full reboot. The CI script installs a *temporary* service only under `/run/systemd/system/` and cleans it on exit; it is protected by `GITHUB_HOSTED_EPHEMERAL_ONLY`, GitHub-hosted CI, root and systemd PID1 checks. No code ever installs a Mac service.

### Operator-only VM full reboot (Lima)

This procedure targets **only** your pre-existing `pef-r28s-1g` Lima VM; it does not create a new VM or buy hardware. The command intentionally modifies systemd *inside that guest*, enables `pef-m54-lab.service`, and stores a test release under the guest user's persistent home. Node >=20, systemd PID1, working sudo -n and mounted repo are prerequisites. The test is isolated from the Mac's system services. An explicit environment ACK is mandatory.

```bash
git switch main && git pull
export PEF_M54_VM_ACK=EXPLICIT_LIMA_VM_SERVICE_TEST
bash scripts/arm64-vm/m54-lima-service.sh prepare r28s-1g
bash scripts/arm64-vm/m54-lima-service.sh reboot r28s-1g
# The command runs verify after the VM stop/start and prints JSON evidence.
bash scripts/arm64-vm/m54-lima-service.sh verify r28s-1g
bash scripts/arm64-vm/m54-lima-service.sh cleanup r28s-1g
unset PEF_M54_VM_ACK
```

**Gate:** `PEF_M54_LIMA_OS_BOOT_V1` with `status=LAB_PASS`, `VM_OS_BOOT_ID_CHANGED`, `SERVICE_AUTOSTARTED`, `NEW_EDGE_SESSION`, `JOURNAL_PERSISTED`, `WAN_OFFLINE_LOCAL_SERVICE` all true. Operator has now reported exactly this result; M5.4.c is VALIDATED in the VM lab scope. Any future VM run still requires its own prerequisites and independent evidence; no hardware claim is allowed. Cleanup is provided but not automatic after the reboot: the operator should inspect the evidence first.

**Limit:** This is a real VM OS restart, *not* a physical power interruption or a field-installed device. The lab service's unit has `PrivateTmp=false` and `ProtectHome=false` because it references guest-owned staging paths. Hardened production system service and trusted boot remain M5.3/production tasks.

## M5.5 — Property + Host Linux kernel isolation

| Subtask | Deliverable / DoD | Result |
| --- | --- | --- |
| M5.5.a | Extend the existing `makeLinuxIsolationPlan` allowlist to Property/Host and pass manifest-specific cgroup CPU/RAM/PIDs | CLOSED LAB, CI |
| M5.5.b | Reuse `LinuxIsolatedProcessDriver` + shared Site Operations worker; chroot/netns/UID 65534, IPC operations, process crash, Supervisor restart | CLOSED LAB, CI |
| M5.5.c | Run standalone Edge HTTP with both overlays in isolated workers, durable fsync, cross-profile denial, offline/reopen/replay and evidence artifact | CLOSED LAB, CI #39239226280 |

Results captured on *actual GitHub-hosted Linux kernel* in one ephemeral sandbox reused sequentially and reconfigured **per manifest**:

| Workload | cpu.max | memory.max | pids.max | Tests |
| --- | --- | --- | --- | --- |
| Property | `15000 100000` | 67,108,864 bytes / 64MiB | 16 | 13/13 |
| Host | `18000 100000` | 83,886,080 bytes / 80MiB | 16 | 13/13 |

The driver verifies sandbox process membership plus UID, inaccessible host canary, and rejected external socket. The Edge HTTP host stays outside the workload cgroup; kernel enforcement applies to the **worker only**. The Edge business Core, fsync OS journal and mock Cloud replay remain unchanged. Original Receiver S3 OOM and throttling regression continues PASS. CPU throttling and OOM were measured previously for Receiver, **not separately measured for Property/Host**. Storage quotas are **not kernel-enforced**. The Linux driver itself remains guarded CI-only, not a production driver and not a Mac sandbox.

### Dashboard and test coverage

`npm run dashboard` → Laboratorio integrado → **M5.4** renders/reviews systemd unit contract; **M5.5** shows Property/Host kernel budget plans and directs to CI evidence, without privileged Mac calls. The real M5.4 systemd and M5.5 kernel tests run in CI only. Dashboard HTTP tests: `test/dashboard-integrated.test.js`, unit tests: `test/m5-systemd.test.js`, `test/m5-isolation*.test.js`. CI artifacts: `pef-m54-systemd-ci`, `pef-netns-evidence` containing `pef-m55-evidence.json`. CI #39239226280 passed, with Node x64 189 PASS+1 skip and native ARM64 190 PASS, M5.4 systemd SUCCESS and Linux S3 + M5.5 kernel 26/26 PASS.

Dependencies M5.1–M5.2 and original S3 CI isolation all passed. Requirements affected: REQ-WRK-01/02/03, REQ-LOC-01, REQ-STA-01/02, REQ-OBS-01. Change added; classification CONFIG/MODULE/RESOURCE, Core only unchanged. Physical M5.3, production service provisioning, kernel quotas for disk, secure boot, device NIC and powercut **NOT_RUN**.

### Operator VM acceptance record — 2026-10-19

On pre-existing Lima `pef-r28s-1g`, the operator ran `prepare`, `reboot` (Lima stop/start), then `cleanup`. The console explicitly reported `M54_GUEST_PREPARED=LAB_PASS_VM_REBOOT_NOT_RUN` **before** reboot and subsequently returned `PEF_M54_LIMA_OS_BOOT_V1` with `status=LAB_PASS`, `ok=true`, `platform=linux`, `arch=arm64`, `vmRebootValidated=true` and **5/5 checks true**: `VM_OS_BOOT_ID_CHANGED`, `SERVICE_AUTOSTARTED`, `NEW_EDGE_SESSION`, `JOURNAL_PERSISTED`, `WAN_OFFLINE_LOCAL_SERVICE`. Cleanup printed `M54_GUEST_CLEANUP=PASS` and removed the test unit enablement symlink. This evidence comes from user-shared CLI logs (not independent server telemetry). **M5.4 now CLOSED SOFTWARE LAB ONLY.** No powercut or field-device certification. No follow-up VM reboot is required for M5.4 lab acceptance.
