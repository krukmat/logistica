# M5.4–M5.5 — Service and overlay kernel lab audit

**2026-10-19 · main · Scope: ephemeral Linux CI and optional Lima VM; not hardware certification.**

## Test evidence

- [GitHub Actions #39238362163](https://github.com/krukmat/logistica/actions/runs/39238362163): M5.4 systemd activation from actual GitHub-hosted Linux PID1 PASS. An Edge process deployed from a staged M5 release performs Property ALERT+ACK (fsync); its main PID is killed by systemctl and systemd restarts it. The journal persists. No whole-VM reboot was executed in that CI job.
- [GitHub Actions #39239226280](https://github.com/krukmat/logistica/actions/runs/39239226280): M5.4 systemd job PASS; M5.5 dual overlays pass after isolating the Host journal from the older S3 receiver harness; netns-lab and prehardware gate SUCCESS; Node **190/190 ARM64**, **189 PASS +1 skip x64**. CI snapshot confirms Property and Host each **13/13** kernel-and-HTTP assertions.
- M5.5 Property `cpu.max=15000 100000`, `memory.max=67108864`, `pids.max=16`; Host `cpu.max=18000 100000`, `memory.max=83886080`, `pids.max=16`. Both enforce `memory.swap.max=0`. Actual worker process membership and isolation checked by driver; operations fail closed while worker crashed. Crash, automatic worker recovery, ACK fsync, reopen, identity/profile isolation and mock replay PASS.
- Host initial red pipeline [#39238862210](https://github.com/krukmat/logistica/actions/runs/39238862210): `LAB_BOOT_IDENTITY_CONFLICT` due to test harness reuse of `host-journal` belonging to earlier S3 Receiver; fixed by unique `m55-host-journal` path. Re-run PASS, no Core change needed.

## Scope boundaries

- M5.4 systemd **actual process lifecycle**, not actual whole-system reboot. Guest-side full VM reboot harness `scripts/arm64-vm/m54-lima-service.sh` has been authored but **not executed on a Lima VM in this interaction**. No VM reboot PASS to claim.
- M5.5 runs **only inside GitHub-hosted ephemeral root/CI lab**. `physicalValidated=false`, `deviceServiceValidated=false`, `storageQuotaEnforced=false`, Cloud mock, synthetic WAN and no field NIC. The installed systemd Edge service M5.4 uses a Property `NODE_PROCESS_ONLY` worker; **these two validated paths have not been combined into a single systemd-launched kernel-isolated Property/Host production-like service**.
- Mac dashboard only executes `m54Systemd` and `m55Isolation` **read-only contracts**. These are policy/configuration evidence and must not be presented as host-kernel observations.
- No systemd service installed on Mac; no physical powercut, production PKI, watchdog/device provisioning, secure boot, signed release or multi-tenant container support validated.

## Decision

M5.4.a/b **LAB_PASS**; M5.4.c **IMPLEMENTED / NOT_RUN** until actual Lima reboot/verification; M5.4 entire milestone **PARTIAL**, not fully CLOSED.

M5.5.a–c **CLOSED — CI LINUX KERNEL LAB ONLY**, with target host device integration still pending M5.3. The next high-value follow-up is one combined full Linux guest: M5.4 service + M5.5 isolated workers under the same supervisor, then full VM restart.
