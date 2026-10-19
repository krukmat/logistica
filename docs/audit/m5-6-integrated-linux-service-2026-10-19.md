# M5.6 — Integrated systemd/kernel software lab evidence

**2026-10-19 · Evidence: GitHub Actions #39246560682, head `39ee2e8b95af82c04d4abbe09cd2232fea64d4e8` · Status: CI LAB_PASS**

## Evidence chain

- **Install:** `src/runtime/m5-install.js` allowlists `bin/pef-m56-edge.js` in an independently verified SHA-256 release. No signing/PKI inferred.
- **Runtime:** `bin/pef-m56-edge.js` injects the existing `LinuxIsolatedProcessDriver` only after hosted Linux root/systemd/ACK preflight; no nonisolated fallback.
- **Service:** CI-only transient systemd unit with actual PID1 controls Edge start/stop, forces main-process SIGKILL and verifies restart with a new session. CI implementation is intentionally root-only for sandbox setup and **not production-hardened**.
- **Kernel:** both `pef-property` and `pef-host` share the same Core/Supervisor and execute their Site Operations worker inside cgroup v2 + netns + chroot + UID 65534; enforced CPU, memory and PID budgets.
- **Data:** real local HTTP operation and ACK `fsync`, process restart, retained journal, local operation with synthetic WAN down, mock Cloud. Profile isolation and fail-closed tests remain verified.
- **Artifact:** `pef-m56-evidence.json` includes the two actual CI profile reports; `pef-m56-verified.json` is the independent 20-assertion schema/claim report.

## CI result

[GitHub Actions #39246560682](https://github.com/krukmat/logistica/actions/runs/39246560682) **SUCCESS** for `39ee2e8b`:
- Native Linux ARM64: **195 PASS, 0 fail**.
- Linux x64: **194 PASS, 1 platform skip, 0 fail**.
- Dedicated M5.4 systemd service job: SUCCESS.
- Linux `netns-lab` with integrated M5.6: `M56_COMBINED_SYSTEMD_KERNEL=LAB_PASS`; independent evidence verifier returned success; artifact [pef-netns-evidence](https://github.com/krukmat/logistica/actions/runs/39246560682/artifacts/12183743400) uploaded.
- Dashboard HTTP → `m56Integration` → real package/integration contract → UI observable result PASS.
- Pre-hardware handoff gate: SUCCESS.

## Boundary and remaining work

**CLOSED — SOFTWARE LAB ONLY.** No physical device, powercut, real multi-WAN, signed release, verified 72-hour journal, external Cloud Lite or secure production provisioning. This integrates systemd and Linux kernel isolation **in a CI lab**, but does not prove a complete virtual machine reboot while both operate together, nor a long-lived operational production installation.

M5.4's prior Lima reboot is a separate proof involving a Node-only Property worker. The CI test's root unit and scope-limited isolation adapter must not be deployed unmodified outside an ephemeral GitHub-hosted runner.

**Next:** M6 local Cloud Lite. Keep no-cost deployment and no mandatory external network or hosted infrastructure.
