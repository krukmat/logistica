# M8.1.C — systemd lifecycle and guest reboot/recovery

**Repository:** `krukmat/logistica`, branch `main`. **Dependency:** M8.1.B2 reported `LAB_PASS` on `pef-r28s-1g` with eight checks, Property/Host in separate cgroup v2 + netns + chroot, fsync/replay TLS1.3 mTLS and cleanup PASS. The imported result has `OPERATOR_REPORTED_UNATTESTED` provenance and is **not authorization** for privilege changes.

**Current state:** `DESIGN_READY_NOT_EXECUTED`. No units installed, no VM reboot performed, no new GitHub Actions, no hardware/production certification.

## Goal and boundaries

Verify the **same 1-GiB Linux ARM64 guest**, using real systemd supervision for the integrated Property Edge, Host Edge and local Cloud Lite while preserving the B2 isolated-driver guarantees, with offline durable operations, controlled restart, boot-ID change, reopened incident journal and authenticated replay after an **explicitly authorized** guest reboot. Do not widen RAM/CPU/PID quotas or use an unisolated fallback.

Existing `scripts/arm64-vm/m54-lima-service.sh` and `guest-m54-service.sh` demonstrate systemd/service lifecycle and VM stop/start but **are not directly reusable as M8.1.C implementation**: M5.4 installs `pef-m54-lab.service` for one Property overlay with a default, unisolated worker. Reusing that unchanged would invalidate B2's dual-worker isolation. Its persistent release/data pattern, boot-ID test and rollback concepts may be adapted only behind the new C gates.

## Tasks and dependencies (max two levels)

| Task | Depends on | Work and acceptance | State |
| --- | --- | --- | --- |
| **C0 — Inventory & design** | B2 | C0.1 read-only guest query: existing systemd units, cgroup subtree ownership, disposable B2 scope absent, capacity; C0.2 draw separation of durable state vs disposable worker rootfs, define exact allowed guest paths/ports/units, recovery & rollback ownership | PROPOSED; read-only only |
| **C1 — Isolated service activation** | C0 | C1.1 implement root-scoped, opt-in **guest-only** service supervisor that preserves B1 authorization and B2 cgroup/netns/chroot; C1.2 install distinct `pef-m81-*` unit(s) without overwriting M5.4/other units; C1.3 verify both workers online, quotas, PID membership, TLS1.3/mTLS, service restart policy, zero unisolated fallback | NOT_RUN; new mutation approval |
| **C2 — Durable offline & recovery** | C1 | C2.1 operate Property/Host while Cloud offline and fsync incident ACK; C2.2 restart only explicitly owned unit(s), reopen persisted journal, then online replay and deduplicated cloud acknowledgement, verify no loss | NOT_RUN |
| **C3 — Lima guest reboot** | C2 | C3.1 record pre-reboot guest `boot_id`, service state, session ID, journal digests and pending counts; C3.2 **separate reboot approval**, stop/start exactly `pef-r28s-1g`, verify `boot_id` and session changed, systemd autostarts, Property/Host isolated, local history retained and mTLS replay completes | NOT_RUN; separately authorized |
| **C4 — Rollback & evidence** | C1–C3 | C4.1 intentionally stop/disable only owned `pef-m81-*` units and remove exactly-owned disposable resources after evidence; do not remove persisted journal until accepted export; C4.2 bounded JSON evidence with real measurements, startup, boot/recovery, no credential leakage; ensure failure status if cleanup fails | NOT_RUN |

## Non-negotiable checks

- **Privilege separation:** design and tests require no guest writes; execution needs a dedicated explicit guest-service ACK; reboot requires a distinct explicit ACK. No systemctl/reboot triggered by a static plan, copied JSON, CI spoofing or dashboard click.
- **Ownership:** require exact VM name and running-instance inspection, dedicated unit names and file ownership. Never override `pef-m54-lab.service`, arbitrary existing systemd units or host macOS services.
- **Isolation stays real:** `pids.max=16` per worker, manifest CPU/memory/swap readbacks, UID 65534, unique owned netns/rootfs, no unisolated fallback. Avoid sharing Node worker cgroups with the service supervisor.
- **Persistent state:** choose allowlisted, restricted guest-owned data paths for journals, Cloud Lite store and credential material; **do not** put them under B2 disposable `/tmp/pef-m81-b2-*`. Explicitly define what rollback preserves.
- **Evidence:** verified run and kernel measurements, changed `/proc/sys/kernel/random/boot_id`, changed Edge session, post-boot incident state and ACK provenance, bounded evidence digest if implemented. Distinguish `LAB_PASS` from a production or physical-powercut claim.
- **Cost:** do not enable GitHub Actions workflows or launch paid cloud infrastructure. Test locally in existing Lima VM only.

## Decision/checkpoint

**Next safe block:** C0.1/C0.2 and local code/test design. No privileged guest action authorized yet. After an auditable C1 implementation plan is reviewed, request explicit approval for guest-owned service mutations; later request separate permission for VM reboot.
