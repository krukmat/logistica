# M5.4–M5.5 — Service and overlay kernel lab audit

**2026-10-19 · main · Scope: ephemeral Linux CI and optional Lima VM; not hardware certification.**

## Test evidence

- [GitHub Actions #39238362163](https://github.com/krukmat/logistica/actions/runs/39238362163): M5.4 systemd activation from actual GitHub-hosted Linux PID1 PASS. An Edge process deployed from a staged M5 release performs Property ALERT+ACK (fsync); its main PID is killed by systemctl and systemd restarts it. The journal persists. No whole-VM reboot was executed in that CI job.
- [GitHub Actions #39239226280](https://github.com/krukmat/logistica/actions/runs/39239226280): M5.4 systemd job PASS; M5.5 dual overlays pass after isolating the Host journal from the older S3 receiver harness; netns-lab and prehardware gate SUCCESS; Node **190/190 ARM64**, **189 PASS +1 skip x64**. CI snapshot confirms Property and Host each **13/13** kernel-and-HTTP assertions.
- M5.5 Property `cpu.max=15000 100000`, `memory.max=67108864`, `pids.max=16`; Host `cpu.max=18000 100000`, `memory.max=83886080`, `pids.max=16`. Both enforce `memory.swap.max=0`. Actual worker process membership and isolation checked by driver; operations fail closed while worker crashed. Crash, automatic worker recovery, ACK fsync, reopen, identity/profile isolation and mock replay PASS.
- Host initial red pipeline [#39238862210](https://github.com/krukmat/logistica/actions/runs/39238862210): `LAB_BOOT_IDENTITY_CONFLICT` due to test harness reuse of `host-journal` belonging to earlier S3 Receiver; fixed by unique `m55-host-journal` path. Re-run PASS, no Core change needed.

## Scope boundaries

- M5.4 systemd **actual process lifecycle**, not actual whole-system reboot. Guest-side full VM reboot harness `scripts/arm64-vm/m54-lima-service.sh` was **subsequently executed by the operator** on an existing Lima VM, with `LAB_PASS` and 5/5 checks. See the operator evidence section below. No physical powercut has been demonstrated.
- M5.5 runs **only inside GitHub-hosted ephemeral root/CI lab**. `physicalValidated=false`, `deviceServiceValidated=false`, `storageQuotaEnforced=false`, Cloud mock, synthetic WAN and no field NIC. The installed systemd Edge service M5.4 uses a Property `NODE_PROCESS_ONLY` worker; **these two validated paths have not been combined into a single systemd-launched kernel-isolated Property/Host production-like service**.
- Mac dashboard only executes `m54Systemd` and `m55Isolation` **read-only contracts**. These are policy/configuration evidence and must not be presented as host-kernel observations.
- No systemd service installed on Mac; no physical powercut, production PKI, watchdog/device provisioning, secure boot, signed release or multi-tenant container support validated.

## Decision

M5.4.a/b **LAB_PASS CI**; M5.4.c **LAB_PASS (operator-reported actual VM reboot)**. M5.4 is **CLOSED — SOFTWARE LAB ONLY**, not physical/production certified.

M5.5.a–c **CLOSED — CI LINUX KERNEL LAB ONLY**, with target host device integration still pending M5.3. The next high-value follow-up is one combined full Linux guest: M5.4 service + M5.5 isolated workers under the same supervisor, then full VM restart.

## Operator Lima ARM64 actual VM reboot — 2026-10-19

**Provenance:** terminal output furnished by the operator, following `prepare`, `reboot`, and `cleanup` for the *existing* Lima `pef-r28s-1g` VM. This is not a newly provisioned VM, independently downloaded disk image or powercut. It completes the previously `NOT_RUN` M5.4.c lab gate.

| Assertion | Reported value |
| --- | --- |
| Evidence kind | `PEF_M54_LIMA_OS_BOOT_V1` |
| Status | `LAB_PASS`, `ok=true` |
| Guest platform | `linux`, `arm64` |
| VM OS boot ID changed | PASS |
| systemd service autostart | PASS |
| Edge session rotated | PASS |
| Journal recovered | PASS |
| WAN offline local service | PASS |
| `vmRebootValidated` | `true` (VM only) |
| `physicalPowerCutValidated`, `deviceValidated` | `false`, `false` |
| Post-test cleanup | `M54_GUEST_CLEANUP=PASS`; systemd enablement symlink removed |

The output shows Lima actually stopped and started the virtual machine and systemd was available again. The verified kernel boot ID, new session and durable Property journal establish VM-level restart continuity. The service under test remained a **Node-only Property worker**, *not* the M5.5 kernel-isolated Property/Host driver. Therefore the combined systemd + kernel-isolated overlay remains a distinct potential software integration task. Neither native hardware, disk powercut, physical WAN, production PKI nor product boot is certified.

**Decision:** M5.4 and M5.5 each CLOSED **in their separate laboratory scopes**. M5.3 field hardware remains BLOCKED.
