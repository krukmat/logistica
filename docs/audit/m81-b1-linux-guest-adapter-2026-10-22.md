# M8.1.B1 — Lima-only kernel-isolation driver, scoped code audit

**Date:** 2026-10-22. **Branch:** `main`. **Scope:** M8.1.B1 implementation, **not** M8.1.B2 guest integrated runtime. No VM, service, privileged Linux command, simulated WAN hardware, Cloud hosting or purchase was executed.

## Summary

- Added `src/adapters/m81-lima-isolation-scope.js` with a pure authorization contract and a separate read-only actual-OS fact gatherer. Required: Linux ARM64, actual guest UID 0, systemd PID1, VM detected by systemd-detect-virt, exact allowed hostname, observed 901–1086 MiB guest memory, <=4 vCPUs, Node >=20 and cgroup v2 cpu/memory/pids. Requires `PEF_M81_ISOLATION_ACK=EXPLICIT_M81_LIMA_ISOLATED_WORKER`, `PEF_M81_VM_ID=pef-r28s-1g` and `PEF_M81_ISOLATION_SCOPE=M81_LIMA_VM`. Explicitly refuses `GITHUB_ACTIONS=true` and `RUNNER_ENVIRONMENT=github-hosted`; never uses these flags as Lima authorization.
- Extended `src/adapters/linux-isolated-process-driver.js` with explicit `runtimeScope` values: old `GITHUB_HOSTED_CI` unchanged; new `M81_LIMA_VM` requires every live guest preflight again at create and at start, exact `pef-m81-N-N` kernel namespace/cgroup and private root-owned `/tmp/<namespace>/root`, root-owned netns, pinned Node path and canary. Only Property and Host may run under the guest scope; native cgroup CPU, memory, swap and PID limits are read back from the manifest immediately before spawn, and the worker must prove UID 65534, inaccessible host canary and denied network before being accepted.
- `src/workloads/site-operations-worker.js` recognizes distinct `M81_ISOLATED_WORKER` for the existing bounded isolated-process IPC challenge; it is never treated as a privileged trust anchor by itself.
- `src/adapters/linux-workload-isolation.js` now labels manifest plans as portable **planning only**, retaining the exact CI-only authorization function for legacy scope; the new guest path uses its own authorization. No automatic fallback to unisolated workers.
- `src/runtime/m81-b1-isolation-contract.js`, `bin/pef-m81-isolation.js` and dashboard `m81Isolation` report **`CODE_READY_GUEST_NOT_RUN`**, `ok=false`, `readyForM81B2=false`, `actualGuestIsolationValidated=false`. No imported A-stage JSON permits driver activation.
- Created `test/m81-lima-isolation.test.js`, added dashboard HTTP regression, pinned `docs/contracts/m81-lima-isolation-v1.json` and documented necessary B2 staging/rollback.
- Corrected an initial B1 static summary typo where `staticContractOk` referenced truncated quota-check names; final source emits `staticContractOk=true` while `ok=false` and `readyForM81B2=false`.

## Current-turn verification

**Isolated JavaScript source validation (not `npm test`):**
- All 10 relevant JavaScript/JSON/dashboard source files inspected and parsed successfully in an isolated tool harness. The CLI hashbang is excluded for syntax-only parsing.
- Synthetic *pure* authorization cases: plausible guest facts return `AUTHORIZED_GUEST_LAB_ONLY`; wrong hostname, GitHub-environment flags, missing ACK, missing cgroup controller, non-root user and 2GiB memory each return `BLOCKED`.
- Mocked read-only driver-construction checks: named `pef-m81-123-456` scope accepts matching sandbox metadata without spawning; default legacy scope rejects non-CI; incorrect `pef-s3` guest prefix and unknown runtime scope reject. **No kernel namespaces were actually created or tested.**
- Rechecked actual manifest-derived Property 150mCPU/64MiB and Host 180mCPU/80MiB quotas through the portable plan and computed `staticContractOk=true` with *actual guest* `ok=false`, `readyForM81B2=false`.

**Not run:** Node `npm test` / `node --test` against the complete checkout; live local dashboard HTTP; actual `limactl shell`; `sudo`, systemd service start/reboot, cgroup writes, `ip netns` setup, Linux root process spawn, worker UID/netns/isolation verification, memory or CPU stress, cleanup, Cloud Lite TLS on the guest. No GitHub Actions workflows used for this task.

## B1 acceptance / B2 dependencies

B1 **code and tests written**, but **GUEST_RUNTIME_NOT_RUN**. B2 must obtain separate operator approval for VM-only service modification, implement an owned ephemeral namespace/cgroup/rootfs staging and cleanup harness, verify root scope + actual `/proc/<pid>/cgroup`, CPU/memory/swap/PID quotas, two workers' concurrent execution with Edge + Cloud Lite, deterministic fsync/replay and recovery, and prove cleanup even on failure. Driver only owns the worker process lifecycle; it does **not** own the kernel sandbox lifecycle. The safety guard is not a cryptographic attestation of hostile root, and R28S physical hardware remains untested.

**Field decision:** NO-GO until VM B2/C/D and subsequent hardware evidence. Historical CI records remain historical; future validations are local and operator-invoked.
