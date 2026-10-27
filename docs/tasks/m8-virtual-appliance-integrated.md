# M8.1 — ARM64 1 GiB integrated virtual appliance (SOFTWARE PLAN)

**Repo:** krukmat/logistica, main. **Current checkpoint (2026-10-27):** M8.1.B2 **LAB_PASS — OPERATOR_REPORTED_UNATTESTED** in the existing ARM64 Lima VM, 8/8 checks and cleanup PASS; no independent guest attestation. M8.1.C **DESIGN_UNBLOCKED / SYSTEMD_AND_VM_REBOOT_NOT_RUN**; M8.1.D not run. GitHub Actions workflows removed to conserve quota. Guest service installation/reboot requires separate operator authorization. **Historical sections below are retained as dated snapshots and may describe earlier blockers.**

## Objective

Prove the **same** PEF Core, Linux driver and Cloud Lite working together on the pre-existing `pef-r28s-1g` Lima guest: systemd-managed Edge, cgroup-isolated Property/Host, fsync journal, local TLS1.3 mTLS, Cloud outage/recovery, and real VM stop/start. Do not claim field readiness, physical powercut, physical NIC, 72h retention or secure boot.

## Tasks (1–2 levels)

| Task | Dependency | Subtasks and acceptance | State |
| --- | --- | --- | --- |
| **M8.1.A — Guest contract** | M5.4, M5.6, M7.5.E | A1 inspect existing source constraints and collect opt-in guest facts; A2 define guest-only authorization/rollback; A3 read-only CLI/dashboard; A4 local negative/HTTP tests | IMPLEMENTED (source + static contract); operator guest inspection NOT_RUN; npm tests NOT_RUN |
| **M8.1.B — Integrated stack** | A, M6, M7.3/4 | B1 isolated driver; B2 disposable guest cgroup/netns + concurrent Property, Host and local mTLS Cloud Lite, fsync/replay and teardown. **systemd is intentionally C, not validated by B2** | **B2 LAB_PASS OPERATOR_REPORTED_UNATTESTED; 8/8 PASS, cleanup PASS** |
| **M8.1.C — Recovery journey** | B | C0 read-only inventory and isolation-aware systemd design; C1 guest services with durable state; C2 offline/replay/recovery; C3 explicitly authorized VM reboot + changed boot_id/session; C4 cleanup/rollback evidence | **DESIGN_UNBLOCKED; IMPLEMENTATION/REBOOT NOT_RUN** |
| **M8.1.D — Evidence** | C, M7.5.D | D1 measure Edge, Cloud and worker process RSS, CPU, disk use, cgroup pressure and replay counts; D2 reproducible JSON/NDJSON + independent checks and read-only dashboard evidence | PROPOSED |

## Gates

- Require explicit VM-only operator ACK before any guest service modification or reboot. Reuse M5.4 Lima lifecycle contract; no privileged Mac changes.
- Kernel isolated workload and Cloud Lite must coexist with systemd in a **single run**; separate prior CI passes are not enough.
- Never silently raise 1 GiB RAM, bypass the Linux driver or fabricate an ACK to pass.
- Ensure offline service survives Cloud outage; require durable reopen/replay and clean rollback.
- Classify raw guest results as operator-supplied unless independently captured by CI.
- Physical M5.3 and 72h journal W1.10.G remain blocked; hosted Cloud remains deferred.

**Order:** A → B → C → D. Stop and report on resource starvation, ownership conflict, failed cleanup or durable-state inconsistency. No actual M8.1 test has run yet.

## M8.1.A — scoped implementation (2026-10-22)

**Requirement:** reuses Core/CONFIG/RESOURCE contracts from M5.4, M5.6 and W1.10.D/E. **Change:** added `PEF_M81_GUEST_PREFLIGHT_V1` read-only verification, no service install or driver activation. **Dependency:** M7.5.E bounded real local mTLS laboratory. **Owner action:** none requested until guest observation.

| Task | Deliverable / dependency | Acceptance | State |
| --- | --- | --- | --- |
| **A1** Guest contract | Pure Core `src/core/m81-guest-contract.js` assesses selected `r28s-1g` profile and imported, unauthenticated observation | Linux arm64, nominal 1024MiB within existing 0.88–1.06 profile band (901–1086MiB), <=4 CPUs, Node >=20, systemd PID1, cgroup v2 cpu/memory/pids, guest VM indicator; rejects invalid timestamps/types/scope; never treats imported claims as trusted | IMPLEMENTED; physical guest NOT_RUN |
| **A2** Safety / rollback | `scripts/arm64-vm/m81-lima-observe.sh`: Mac ARM64 only, `PEF_M81_VM_ACK=EXPLICIT_READ_ONLY_LIMA_M81`, exactly existing *running* `pef-r28s-1g`, fail closed if missing/stopped. Guest probe `--guest-readonly` separately requires `PEF_M81_OBSERVE_ACK` | Absolutely no `limactl create/start/stop`, `sudo`, `systemctl`, network mutation, guest writable state, installed service, new VM or hardware. Any failure returns BLOCKED (wrapper exit 78). A-stage rollback: delete optional operator-produced host JSON; no guest mutations to undo | IMPLEMENTED; operator invocation NOT_RUN |
| **A3** CLI + dashboard | `npm run m8:preflight -- --contract`, `npm run m8:preflight -- --report /absolute/guest.json`, dashboard Lab → ARM64 Virtual Lab → `m81Preflight` and local file import | Displays actual static plan, imported guest details and definitive `LINUX_DRIVER_HOSTED_CI_ONLY_VM_PORT_NOT_IMPLEMENTED`; imported data always marked `UNATTESTED_OPERATOR_REPORT`; no VM control available from dashboard | IMPLEMENTED |
| **A4** Verification | `test/m81-guest-preflight.test.js` + dashboard HTTP regression in `test/dashboard-integrated.test.js` + contract registry | Good/invalid/malformed/scope-changed input, missing ACK, real Core manifest quotas, UI action and `readyForM81B=false` even on plausible Linux guest; `npm test` on operator Mac | TESTS ADDED / OPERATOR RUN NOT_RUN |

### Actual blocking dependency for M8.1.B

Current `src/adapters/linux-workload-isolation.js` hard-requires `CI=true`, `GITHUB_ACTIONS=true`, `RUNNER_ENVIRONMENT=github-hosted`, `PEF_S3_ACK=GITHUB_HOSTED_EPHEMERAL_ONLY` and Linux uid 0. Corresponding `src/adapters/linux-isolated-process-driver.js` uses that preflight. **It cannot be used from Lima unchanged.** It would be unsafe to spoof GitHub environment variables or silently fall back to the unsandboxed Node Process Driver. M8.1.B must first design a *distinct, scoped Lima root-only driver authorization* with independently verified Linux guest identity, disposable cgroup/netns ownership, journaling and teardown. That implementation is **NOT_DONE**; the A assessment always returns `BLOCKED` and `readyForM81B=false`. Neither an imported JSON nor a `systemd-detect-virt` indicator can override the guard.

### Operator procedure (read-only, optional)

```bash
git switch main && git pull
npm run m8:preflight -- --contract
npm test    # Local automated tests, no GitHub Actions

# ONLY if pef-r28s-1g is already running and guest inspection is approved:
PEF_M81_VM_ACK=EXPLICIT_READ_ONLY_LIMA_M81 \
bash scripts/arm64-vm/m81-lima-observe.sh r28s-1g > /tmp/m81-guest-observation.json

# Locally inspect unauthenticated guest observations; always BLOCKED for M8.1.B:
npm run m8:preflight -- --report /tmp/m81-guest-observation.json
npm run dashboard
# ARM64 Virtual Lab -> M8.1.A -> inspect contract or select JSON
```

The Lima wrapper never starts a stopped VM. It only runs `limactl list --json` and `limactl shell` for the exact existing running name, with an additional guest observation acknowledgment; no background task. Evidence origin is **operator reported, non-attested**. Delete optional `/tmp/m81-guest-observation.json` to clean up locally; no guest rollback required because M8.1.A performs no writes.

**M8.1.B release gate remains BLOCKED:** B1 Lima-scoped driver authorization now exists in code but is untested on a real guest; B2 must prepare/own/cleanup guest-only cgroups/netns, execute full systemd+both workers+Cloud Lite simultaneously and prove fsync/replay/restart and resource budget in the *same 1GiB guest run*. Hardware physical M5.3, W1.10.G 72h and field pilot still NO-GO. Historical CI evidence is retained only for audits; **GitHub Actions are no longer an accepted prerequisite or execution path**.

[A-stage static preflight audit](../audit/m81-a-guest-preflight-2026-10-22.md).

## M8.1.B1 — safely scoped isolated driver for Lima (2026-10-22)

**Status:** `IMPLEMENTED_CODE_GUEST_NOT_RUN`. Requirement: retain the same PEF Core and manifest-verified cgroup CPU/RSS/swap/PID isolation while replacing the **GitHub-only activation scope**, not spoofing GitHub Actions. Dependencies: A read-only guest contract, M5.5 Linux driver, M5.6 systemd lab design. No physical hardware, cloud expense or privileged guest mutation performed.

| Subtask | Implementation | Acceptance / status |
| --- | --- | --- |
| **B1.1** Authorization scope | New `src/adapters/m81-lima-isolation-scope.js` with pure policy and actual guest read-only checker; accepts *only* Linux ARM64 guest root, systemd PID1, confirmed VM indicator and name, 901–1086MiB memory, <=4 CPUs, Node >=20, cgroup v2 cpu/memory/pids, explicit `PEF_M81_ISOLATION_ACK`, `PEF_M81_VM_ID` and scope | IMPLEMENTED (source); actual guest check NOT_RUN |
| **B1.2** Process Driver | `src/adapters/linux-isolated-process-driver.js` now selects `GITHUB_HOSTED_CI` (unchanged) or `M81_LIMA_VM` (new). Guest namespace strictly `pef-m81-[0-9]+-[0-9]+`; exact matching guest-only cgroup and `/tmp/<namespace>/root` path; root-owned private staging/canary and netns, pinned Node interpreter, only Property/Host allowlist, readback cgroup limits and child UID/network/canary assertions; never fall back to unisolated Node driver | IMPLEMENTED (source), no real root guest subprocess launched |
| **B1.3** Observability | `src/runtime/m81-b1-isolation-contract.js`, `npm run m8:isolation -- --contract`, dashboard ARM64 Virtual Lab → M8.1.B1 `m81Isolation`; static contract explicitly `CODE_READY_GUEST_NOT_RUN`, `readyForM81B2=false`; pure policy never authorizes a guest from imported JSON | IMPLEMENTED in dashboard/CLI; guest NOT_RUN |
| **B1.4** Verification | `test/m81-lima-isolation.test.js` and dashboard HTTP integration cover explicit authorization, bad guest/host/CI spoofing, quota plan, CLI rejection and status separation. `docs/contracts/m81-lima-isolation-v1.json` pins scope and ownership. | TESTS CREATED; operator `npm test` still NOT_RUN |

**Guest authorization is deliberately not attestation.** A root process in a guest can alter its own hostname and environment; the guard is a *safety boundary for operator-controlled software lab*, not a hostile-root security boundary. The private disposable sandbox must be provisioned, verified and later dismantled by the **B2 caller**. B1 owns the worker process termination only, and does **not** create/delete cgroups, namespaces or VM services itself. Do not label `GUEST_KERNEL_ENFORCEMENT_OBSERVED` true without an actual same-guest run and post-run `cpu.max`, `memory.max`, `memory.swap.max`, `pids.max`, UID and `/proc/<pid>/cgroup` evidence.

**Read-only local smoke:**

```bash
git switch main && git pull
npm run m8:isolation -- --contract
node --test test/m81-lima-isolation.test.js test/dashboard-integrated.test.js
# Dashboard: npm run dashboard → ARM64 Virtual Lab → M8.1.B1
```

**Not approved or executed in this task:** `sudo`, root-only `--guest-check`, VM start/reboot, cgroup/netns creation, systemd install, Cloud Lite deployment, fault injection, kernel stress. Any later root execution requires a distinct explicit guest operator approval and a reviewed B2 isolation harness with cleanup, not only setting environment variables. **No GitHub Actions run is a gate.**

[B1 static implementation and verification audit](../audit/m81-b1-linux-guest-adapter-2026-10-22.md).

## M8.1.B2 — same-guest integrated harness (2026-10-25)

**Scope:** source implementation for the already existing `pef-r28s-1g` Lima guest. The root runner **has not been invoked**. Operator approval must be separately supplied; do not infer it from this document.

| Task | Implemented | State / acceptance |
| --- | --- | --- |
| **B2.1 — Disposable guest sandbox** | `scripts/arm64-vm/m81-b2-guest.sh`: fails closed before mutation unless Linux ARM64, actual root, B1 live guest scope, exact VM, Node >=20, systemd PID1 and cgroup v2 controllers. Creates two never-reused `pef-m81-PID-RANDOM` private rootfs trees; copies allowlisted site worker, site command contract, pinned Node and shared libraries. | CODE; VM_STAGE_NOT_RUN |
| **B2.2 — Kernel quotas + teardown** | Two independent cgroups, netns, root-owned private canaries and readback of manifest-derived `cpu.max`, `memory.max`, `memory.swap.max` and `pids.max`. EXIT trap owns only newly created objects and attempts `cgroup.kill`, `rmdir`, `ip netns del`, staged-dir cleanup; refuses scope collision. | CODE; ACTUAL_CLEANUP_NOT_RUN |
| **B2.3 — Edge and Cloud Lite** | `src/runtime/m81-b2-guest-stack.js` composes both concurrent `createAutonomousEdgeHost` instances with B1 `M81_LIMA_VM` driver injection, actual Cloud Lite HTTPS TLSv1.3 mTLS loopback, certificate enrolment for each device and durable Edge journal. No unsandboxed fallback. | CODE; GUEST_INTEGRATION_NOT_RUN; **systemd-managed services are not yet implemented** |
| **B2.4 — Assert isolation + offline recovery** | Each worker must report `RUNNING`, `LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM`, real PID; quotas and `/proc/<pid>/cgroup` read from guest kernel, `memory.peak` within manifest cap; Property/Host operations ACK only after fsync; synthetic WAN offline blocks sync, then correct client mTLS replays queued operations. | CODE; ACTUAL_GUEST_ASSERTIONS_NOT_RUN |
| **B2.5 — Evidence + dashboard** | `src/runtime/m81-b2-plan.js` produces a static plan and validates an operator's report structurally (never attests it). `bin/pef-m81-b2.js` exposes `--plan`, `--inspect`, and guest-gated `--run`. Dashboard ARM64 Virtual Lab has a read-only plan button and limited JSON import. Tests `test/m81-b2-integration.test.js` and HTTP regression added. | CODE; NODE_TESTS_NOT_RUN; OPERATOR_GUEST_EVIDENCE_NOT_RUN |

### Authorization and operation boundaries

Use `npm run m8:integrated -- --plan` or `bash scripts/arm64-vm/m81-b2-lima.sh --plan` **locally on Mac** to inspect the plan (no VM interactions).

**Only after separate explicit approval to change the existing guest**, the operator may execute the *existing running VM* experiment:

```bash
# CAUTION: creates/deletes private cgroups, netns and /tmp trees INSIDE the VM.
# No VM start/stop and no persistent services. Operator-controlled; do not automate.
PEF_M81_B2_MAC_ACK=EXPLICIT_EXISTING_RUNNING_LIMA_B2 \
 bash scripts/arm64-vm/m81-b2-lima.sh --run > m81-b2-guest.json

npm run m8:integrated -- --inspect m81-b2-guest.json
```

The wrapper only accepts a running **`pef-r28s-1g`** from `limactl list --json`. It never starts the VM, changes Mac network state, touches Mac system services or silently installs packages. `sudo -n` is invoked **inside the guest only**. It passes separate B1 Linux root/VM scope and B2 operator ACK values. Any missing ACK, tool, controller or scope causes `BLOCKED`.

All generated PKI keys, token and journal data live in the disposable guest scope and are removed via the shell trap. Evidence emitted to stdout contains checks/PIDs/peak memory and cleanup status, **not secrets**. If cleanup fails the run fails, and a technician must inspect the named VM before re-running; never blindly delete existing resources.

### Honest acceptance / remaining gaps

- Source and fail-closed contracts are present. Actual guest root orchestration, netns/chroot, systemd, Cloud TLS and resource measurements **NOT_RUN**, and `npm test` on the complete checkout is **NOT_RUN** in this task. No GitHub Actions used.
- Unlike the original M8 integrated goal, **B2 currently runs both Edge instances and Cloud Lite under a temporary guest Node coordinator, not as systemd units**; systemd PID1 is only a safety preflight. Thus `systemdManagedValidated=false`, `vmRebootValidated=false`, `readyForM81C=false`, and no field or hardware GO may be inferred.
- Imported successful-looking JSON is marked `OPERATOR_REPORTED_UNATTESTED`; valid cleanup and quota fields can be checked structurally but are not independent proof. Only a reviewed live guest run supports a local VM test claim, never a physical one.
- Next execution gate: local tests → operator approval → actual guest run and cleanup evidence → if green, design systemd guest service lifecycle/restart under M8.1.C without replacing or overwriting pre-existing M5.4 services.

### 2026-10-26 — Operator read-only guest observation and B2 kernel/tool preflight

Operator-provided M8.1.A guest observation: `platform=linux`, `arch=arm64`, `memoryMiB=972`, `cpuCount=4`, `nodeMajor=20`, `pid1=systemd`, `cgroupV2=true`, controllers contain `cpu`, `memory`, `pids`, `vmDetected=true`. The observation reports `readOnly=true`, services and host routes unchanged. **This is locally reported evidence, not independently authenticated; B2 execution and kernel isolation are still NOT_RUN.**

Added a stricter read-only B2 gate before any sandbox mutation: `bin/pef-m81-b2-guest-check.js` evaluates **actual guest facts as root** (B1 hostname/VM, Node20, systemd, memory), root cgroup subtree controllers, cgroup2 mount type, available toolchain and canonical pinned Node binary. `scripts/arm64-vm/m81-b2-lima.sh --check` requires the **read-only** `PEF_M81_VM_ACK=EXPLICIT_READ_ONLY_LIMA_M81` approval and an already-running exact guest. It does **not** require the separate sandbox-mutation ACK and does not invoke `--run`. `sudo -n` runs the guest **read-only inspector**, never installs services or creates cgroups.

```bash
git pull --ff-only
PEF_M81_VM_ACK=EXPLICIT_READ_ONLY_LIMA_M81 \
  bash scripts/arm64-vm/m81-b2-lima.sh --check
```

Expected safe result: `status=READY_FOR_OPERATOR_OPT_IN`, `ok=true`, `guestSandboxStarted=false`, `operatorRunApproved=false`. A blocked result identifies exactly which checks need repair, **without** attempting privileged sandbox staging. A green inspection is **not** B2 `LAB_PASS` and cannot authorize the next gate without a separate approval.

### 2026-10-26 — B2 authorized runtime attempt (BLOCKED, cleanup reported)

The operator ran the B2 privileged harness in the existing `pef-r28s-1g` VM; actual worker boot returned `WORKLOAD_BOOT_FAILED:EXIT_SIGABRT`. Guest harness emitted `M81_B2_GUEST_INCOMPLETE exit=78 cleanup=true` (shell-reported cleanup, not independent proof). Consequently **B2 remains operationally BLOCKED**, and M8.1.C/D must not start on the basis of this attempt.

Follow-up patch: M81-only Node flag `--v8-pool-size=1` and `UV_THREADPOOL_SIZE=1` for the already pinned 16-PID cgroup; bounded kernel `pids.events`/`memory.events` and stderr diagnostics to distinguish causes; expose real supervisor worker PID; stage chroot `/tmp`; return machine-readable `LAB_FAIL` JSON on early abort **after** cleanup. Existing manifest quotas, netns/chroot policy and VM-only authorization remain unchanged.

**Next dependency:** operator confirms the updated local tests; rerun the bounded B2 integration once to obtain detailed live kernel counters if it still aborts. Do not count attempted execution as `LAB_PASS`.

### 2026-10-26 — Linux Debian Node 20 chroot bootstrap correction

Second authorized B2 guest attempt returned `EXIT_SIGABRT` at `libnode.so.115::InitializePrimordials`, but actual cgroup counters were `pids.events.max=0`, `memory.events.oom=0`, `oom_kill=0` and `memory.peak=5193728`. This points away from cgroup quotas and toward the incomplete Node runtime copied into `chroot`. Debian Node links externalized builtin JS files under `/usr/share/nodejs`, which ELF `ldd` alone does not copy. The patch now stages a small fixed distro-only JS allowlist, then proves Node initialization as uid=65534 within the chroot **before** starting the isolated Edge worker. A failure captures the earliest fatal stderr line and aborts/cleans up, without reducing isolation.

**Tests are not yet confirmed by the Mac operator for this patch.** `B2.3/B2.4` stay `GUEST_LAB_FAIL` until live replay and zero-residue cleanup; no automatic jump to M8.1.C.

### 2026-10-26 — third guest attempt rootfs dependency proof

The B2 chroot bootstrap probe failed before any Edge worker with `Cannot load externalized builtin: internal/deps/undici/undici:/usr/share/nodejs/undici/undici-fetch.js`. The cleanup JSON remained `LAB_FAIL` and reported `ownedResourcesRemoved=true`. This is a **confirmed omission in the staged chroot rootfs**, not proof of systemd/kernel or mTLS success.

The rootfs allowlist now contains the exact `undici-fetch.js` path; it is required to exist in the guest source and destination. A **read-only** preflight `NODE_EXTERNALIZED_UNDICI_FETCH_PRESENT` detects missing source files before another sandbox run. New tests assert mandatory staging and immutable isolation settings. B2 remains `GUEST_LAB_FAIL` pending local tests and actual guest validation; M8.1.C remains blocked.

### 2026-10-27 — B2.4 replay sequencing corrected (operator revalidation required)

Actual guest attempt reached Property Cloud Lite replay but failed `M81_B2_MTLS_REPLAY_FAILED:property`, with JSON `LAB_FAIL` and operator-reported `cleanup=PASS`. Source analysis isolated missing policy reconciliation: after `/lab/wan`, the Edge controller still reports `LOCAL_ONLY` until `/lab/sample`; the B2 harness called sync prematurely, unlike the validated M7.3 test. Fix now requires `WAN → sample → controller CONNECTED → sync`, fails closed if the transition is not committed, and adds sanitized replay diagnostics. Unit/integration regressions use local fake remote transport; M7.3 cryptographic tests remain unchanged. B2 stays blocked until the operator reruns local tests and one authorized ARM64 guest test. No GitHub Actions workflows should be reinstated.

## 2026-10-27 — M8.1.B2 operator-run functional closure

**Operator-supplied live guest JSON** (pasted in this thread, independently unattested): `kind=PEF_M81_B2_GUEST_STACK_V1`, `status=LAB_PASS`, `ok=true`, `elapsedMs=739`, guest profile `pef-r28s-1g`. All eight required booleans are `true`:

- `GUEST_SCOPE_AUTHORIZED`
- `BOTH_WORKERS_ISOLATED`
- `MANIFEST_CGROUP_LIMITS`
- `WORKER_UID_AND_NETNS`
- `LOCAL_INCIDENT_FSYNC`
- `CLOUD_TLS13_MTLS`
- `OFFLINE_QUEUE_REPLAY`
- `LOCAL_CLOUD_AND_BOTH_EDGES_CONCURRENT`

Actual operator-reported worker fields: Property PID `3154`, `memoryPeakBytes=13725696` (13.09 MiB), Host PID `3160`, `memoryPeakBytes=13635584` (13.00 MiB); both `LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM`, `actualLimitsEnforced=true`, `offlineDurable=true`, `replayed=true`. Transport `TLS1.3_MTLS_LOOPBACK`. Teardown `cleanup.status=PASS`, `ownedResourcesRemoved=true`.

The repository inspector's pure `inspectM81B2Evidence` function, evaluated against exactly these submitted fields, returns `accepted=true`, `status=OPERATOR_REPORTED_UNATTESTED`, `schemaChecksValidated=true`, `workerCount=2`. The inspector intentionally returns `readyForM81C=false` as a **non-attestation guard**: it does not remotely verify kernel provenance or grant service/reboot privileges. This **does not prevent read-only design** of M8.1.C; it prevents interpreting copied JSON alone as authorization/certification of a new privileged action.

**Functional B2 checkpoint:** accepted **LAB_PASS in operator-reported Lima guest**, no physical/production certification. `systemdManagedValidated=false`, `vmRebootValidated=false`, `physicalValidated=false`, `productionAuthorized=false`. The next dependency is M8.1.C (systemd service lifecycle + persistent journal + explicitly authorized guest reboot/recovery). M8.1.D evidence and hardware/field validation remain pending. No GitHub Actions workflow may be recreated without a separate explicit request.

See [M8.1.C isolated systemd/recovery plan](m81-c-systemd-recovery-plan.md).

### 2026-10-27 — superseding scope decision: VM C/D no longer on the critical path

By product-goal review, **M8.1.B2 operator-reported LAB_PASS** is sufficient for a **conditional GO to physical PoC preparation**. Additional complete integrated systemd/VM-reboot demonstrations would add less decision value than real-device bring-up and failover/powercut/thermal/physical-storage observations. Therefore **M8.1.C/D in Lima = DEFERRED_OPTIONAL_REGRESSION**, not mandated before procurement or M9, and not falsely labeled `LAB_PASS`. Transfer C1/C2/C3 service/recovery and D measurements to actual device acceptance under [M9](m9-physical-device-poc.md), keeping strict operator permissions. The sidecar Core-first physical POC intentionally does not validate the original two-WAN+LAN full appliance requirements.
