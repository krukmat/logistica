# M5.1/M5.2 — Installation Linux Lab audit

**Date:** 2026-10-19 · **Status:** IMPLEMENTED; final CI pending.

## Implementation completed

- Portable, pure state-change logic: `src/core/install-policy.js`.
- OS adapter: `src/runtime/m5-install.js`, SHA256 manifest of allowlisted source files, staged temp tree, atomic state, releases v1/v2, fail-closed against tampering and invalid targets. Persistent data in `data/`.
- Subprocess E2E: `src/runtime/m5-install-smoke.js` starts an **actual Node Edge daemon from the staged release**, exercises HTTP business operation+ACK, halts it, upgrades, restarts, checks the persisted journal, rolls back, restarts and rechecks.
- Dashboard: `m5InstallLab` executes same real E2E and exposes check booleans, environment and limitations.
- Native x64+ARM64 Linux jobs execute `npm run m5:linux` with unprivileged runner; Linux namespace regression remains in `netns-lab` but is **not an installation of M5 into a Linux network namespace**.
- No hardware provisioning, system-level service registration, unattended boot after OS reboot, root, live WAN, cgroups for installed Property, power loss or signing occurred.

## Acceptance checkpoints

Awaiting CI job evidence. Only mark M5.1/2 **CLOSED SOFTWARE LAB ONLY** after Node tests + both Linux runners + dashboard E2E + netns-lab/prehardware in green. M5.3 stays **BLOCKED HARDWARE**.

**Risk notes:** `state.json` and the SHA-256 manifest support consistency checks, not trusted signature verification. A compromised host could replace metadata and files. Atomic rename/fsync does not prove physical power-loss durability. Temporary lab root is intentionally isolated from real system configuration.
