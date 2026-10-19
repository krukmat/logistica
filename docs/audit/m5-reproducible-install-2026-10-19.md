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

## Mac temporary-path regression — 2026-10-19 (post M5.1/2 CI acceptance)

The operator reported `npm run m5:lab` on macOS returning `{"kind":"PEF_M5_INSTALL_LINUX_LAB_V1","ok":false,"status":"LAB_FAIL","error":"M5_TEMP_ROOT_ONLY"}`. This was a real local failure, **not** a successful Mac smoke.

**Root cause:** macOS exposes `os.tmpdir()` as a path under `/var/folders/...` while `fs.realpathSync()` can return `/private/var/folders/...`. M5's `safeDir()` originally allowed only the lexical `os.tmpdir()` prefix, but returned the canonical root. A subsequent `verifyInstall(canonicalRoot)` rejected its own legitimate working directory with `M5_TEMP_ROOT_ONLY`.

**Change and regression gates:**

- [Fix `e5467506`](https://github.com/krukmat/logistica/commit/e54675061d615651406ba69a1846a36085298464): allow paths under either the exact temporary root alias or its resolved canonical equivalent. Continue to resolve and constrain within the canonical temporary root; symlinks **beneath** the trusted temporary anchor remain denied, as do paths outside both prefixes.
- [Regression `456062e7`](https://github.com/krukmat/logistica/commit/456062e794032997431b7b9425463a9dffb4fcec): emulate the `/var` → `/private/var` relationship on Linux using a temporary directory alias. Verify install, independent verify, idempotency, upgrade, rollback, foreign-path rejection and symlink traversal rejection using both path spellings.
- [CI #39235672611](https://github.com/krukmat/logistica/actions/runs/39235672611) **SUCCESS**: native Linux ARM64 **184/184 PASS**, x64 **183 PASS + 1 platform skip**, no failures. The new `M5.1 accepts canonical macOS tmp path after creating under /var alias` test PASS on both. `netns-lab` and `Pre-hardware software handoff` SUCCESS.

**Acceptance boundary:** Linux emulation of the Mac alias confirms the fix in CI, but **a fresh macOS `npm run m5:lab` execution has not yet been reported**. M5.1–M5.2 remain CLOSED **for the Linux software lab scope**; Mac smoke is **PENDING RETEST**, physical M5.3 remains BLOCKED. No Mac system services, kernel resources or real device were modified by the patch.
