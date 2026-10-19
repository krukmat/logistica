# M5.1/M5.2 — Installation Linux Lab audit

**Date:** 2026-10-19 · **Status:** M5.1/M5.2 CLOSED — SOFTWARE LAB ONLY (CI #39232965785 SUCCESS); M5.3 BLOCKED hardware.

## Implementation completed

- Portable, pure state-change logic: `src/core/install-policy.js`.
- OS adapter: `src/runtime/m5-install.js`, SHA256 manifest of allowlisted source files, staged temp tree, atomic state, releases v1/v2, fail-closed against tampering and invalid targets. Persistent data in `data/`.
- Subprocess E2E: `src/runtime/m5-install-smoke.js` starts an **actual Node Edge daemon from the staged release**, exercises HTTP business operation+ACK, halts it, upgrades, restarts, checks the persisted journal, rolls back, restarts and rechecks.
- Dashboard: `m5InstallLab` executes same real E2E and exposes check booleans, environment and limitations.
- Native x64+ARM64 Linux jobs execute `npm run m5:linux` with unprivileged runner; Linux namespace regression remains in `netns-lab` but is **not an installation of M5 into a Linux network namespace**.
- No hardware provisioning, system-level service registration, unattended boot after OS reboot, root, live WAN, cgroups for installed Property, power loss or signing occurred.

## Acceptance checkpoints

**Accepted from [CI #39232965785](https://github.com/krukmat/logistica/actions/runs/39232965785):** native ARM64 183/183 PASS, Linux x64 182 PASS + 1 skip, zero failures. Dashboard HTTP M5 E2E, process install/upgrade/reboot-equivalent restart/rollback and symlink-denial tests PASS on both architectures; separate `npm run m5:linux` completed on both. `netns-lab` and Pre-hardware software handoff PASS. [x64 artifact](https://github.com/krukmat/logistica/actions/runs/39232965785/artifacts/12178436821) · [ARM64 artifact](https://github.com/krukmat/logistica/actions/runs/39232965785/artifacts/12177852754). **No real OS reboot/systemd provisioning** occurred. M5.3 stays BLOCKED hardware.

**Risk notes:** `state.json` and the SHA-256 manifest support consistency checks, not trusted signature verification. A compromised host could replace metadata and files. Atomic rename/fsync does not prove physical power-loss durability. Temporary lab root is intentionally isolated from real system configuration.

## Final CI test assertions and limits

| Stage | x64 | ARM64 | Scope |
| --- | --- | --- | --- |
| Core pure version/rollback invariants | PASS | PASS | No OS writes |
| Installed source files SHA256 + tamper rejection | PASS | PASS | Temporary staged release |
| First install + idempotency + immutable tags | PASS | PASS | Release manager policy |
| Real packaged Edge child boot with HTTP + fsync ACK | PASS | PASS | Node process; not systemd |
| Controlled stop, v2 upgrade, activation interruption, rollback v1 | PASS | PASS | Real process lifecycle; not OS reboot |
| Journal surviving both transitions | PASS | PASS | OS-file journal in temp persistent data dir |
| Symlinked root, release and data path rejection | PASS | PASS | Host temporary filesystem scope |
| Dashboard HTTP actual action | PASS | PASS | Same code as CI and CLI |
| Isolated S3 Linux receiver / prehardware handoff | PASS | PASS gate | Existing CI S3 evidence, **not** installed Property/Host |

**Commit with latest tested M5 source:** `628f839600fb99dadf0778bec8a18662d3cdc3d7`. No operator Mac output yet; that remains an optional local reproduction, not a reason to inflate physical claims. The normal CLI, not the dashboard, is the appropriate tool for a controlled manual temp-root install (system services untouched).
