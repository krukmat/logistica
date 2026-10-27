# M8.1.B2 — disposable Lima kernel sandbox and local integrated stack

**Date:** 2026-10-25. **Repo:** `krukmat/logistica`, `main`. **Execution:** SOURCE_ONLY. No privileged guest commands, real network operations, guest boot, physical hardware, or GitHub Actions were executed during this session.

## Delivered (B2.1–B2.5)

1. `src/runtime/m81-b2-plan.js`: shared manifest CPU/RAM/swap/PID plan with fail-closed status `GUEST_NOT_RUN`, limited operator-report schema validation (accepted reports still `OPERATOR_JSON_UNATTESTED`, `readyForM81C=false`).
2. `scripts/arm64-vm/m81-b2-lima.sh`: Mac operator entry, requires separate `PEF_M81_B2_MAC_ACK=EXPLICIT_EXISTING_RUNNING_LIMA_B2`; checks exact **already-running** `pef-r28s-1g` through Lima inventory and never calls `limactl start`, `stop`, or `create`. Host `--plan` is read-only.
3. `scripts/arm64-vm/m81-b2-guest.sh`: guest-only explicit `PEF_M81_B2_ACK` + B1 actual guest root/systemd/ARM64/cgroup checks; separate private root-owned `/tmp/pef-m81-PID-RANDOM` staging for each worker, `cpu.max`, `memory.max`, `memory.swap.max=0`, `pids.max=16`, netns/chroot Node worker files, readback of kernel quotas. The script never modifies root cgroup-controller delegation. It records owned scopes and traps EXIT for cgroup kills, rmdir, netns removal and temp removal. Bound operator run: `timeout -k 5s 120s`. **Final cleanup must succeed before evidence can become LAB_PASS.**
4. `src/runtime/m81-b2-guest-stack.js`: same guest Node coordinator with **both** Edge profiles using the existing B1 kernel-isolated worker driver plus genuine localhost Cloud Lite `TLSv1.3` mTLS certificate enrollment and signed/durable ACK transport. Requires each worker's kernel cgroup membership and caps, UID/netns/canary verified by driver, fsync incident open/ACK and synthetic offline/online durable replay. Worker memory peak checked against manifest. Does not silently switch to an unisolated driver.
5. `bin/pef-m81-b2.js`: `--plan`, `--inspect` (32KiB JSON cap), guest-scoped `--run`; dashboard `m81B2Plan` and `m81B2Inspect` are **local read-only**, with no direct VM execution control. Source tests in `test/m81-b2-integration.test.js` and dashboard HTTP regression.

## Validations performed in this session

- Parsed all affected JavaScript sources, tests and JSON contracts in an isolated JS syntax check: PASS. Inspected all client IDs and actions against the dashboard registry: PASS.
- Executed a pure JS verification of the B2 plan with actual existing Property/Host manifest-derived limits: Property 15000/100000 CPU, 67108864 memory; Host 18000/100000 CPU, 83886080 memory, swap 0, pids 16: PASS.
- Synthetic operator report inspection: status always `OPERATOR_REPORTED_UNATTESTED` and `readyForM81C=false` even when all fields claim green. Invalid cleanup, scope and worker memory cap reject: PASS.
- Inspected guard sources: unique Mac and guest ACKs, no implicit Lima start, explicit cleanup trap, bounded 120s runtime and post-teardown confirmation included in source: PASS (static inspection only).

**NOT_RUN:** full repo `npm test`, local `node --test` suites, checked-out Bash `bash -n`, actual Lima `limactl`, guest `sudo`, cgroups, namespaces, Node/chroot subprocesses, Cloud mTLS service under guest and kernel resource evidence. No shell or root smoke was performed. Tests exist but no PASS claims for them yet.

## Scope gap / DoD

- The Edge pair and Cloud Lite would be supervised by a temporary guest Node coordinator. This is **not** an installed/transient verified systemd unit; systemd PID1 is only a mandatory guest fact in the B1 preflight. `systemdManagedValidated=false`.
- A real guest execution is necessary before claiming successful B2.3/4 or cleanup. A source-only audit cannot prove container/cgroup ownership, missing libraries, TLS SAN matching or child readiness. If actual execution fails, retain its error/evidence and return BLOCKED; do not weaken isolation.
- The B2 source implementation is ready for local software verification. `M8.1.C` (systemd lifecycle, guest reboot and durable state after boot) and `M8.1.D` (same-run resources/performance) remain pending. Hardware and field pilot are NO-GO.

## Operator command order (not executed by this assistant)

```bash
git pull --ff-only
node --test test/m81-b2-integration.test.js test/dashboard-integrated.test.js
npm run m8:integrated -- --plan
bash scripts/arm64-vm/m81-b2-lima.sh --plan
```

**Only if separately authorized** to change the existing running Lima guest:

```bash
PEF_M81_B2_MAC_ACK=EXPLICIT_EXISTING_RUNNING_LIMA_B2 \
  bash scripts/arm64-vm/m81-b2-lima.sh --run > m81-b2-guest.json
npm run m8:integrated -- --inspect m81-b2-guest.json
```

The operator output is not cryptographically attested. Do not paste private keys, credentials, or disclose guest private paths in public CI logs.

## Addendum 2026-10-26 — preflight observation and B2 read-only gate

The operator ran the M8.1.A Lima observation after starting the existing VM. Reported: Linux ARM64, 972 MiB, 4 vCPU, Node 20, PID1 systemd, cgroup v2 including cpu/memory/pids, virtualization detected. Host routes and guest services were not modified by that read-only observation. No verified M8.1.B2 runtime execution yet.

Follow-up change: `bin/pef-m81-b2-guest-check.js`, operator gated `m81-b2-lima.sh --check`, tests for host-denial and missing read-only ACK. The inspector does not touch the Linux kernel beyond reading files or run the sandbox. **LIVE_GUEST_B2_CHECK_NOT_RUN**, **PRIVILEGED_SANDBOX_NOT_RUN** at commit time. The next operator report is necessary to confirm root B1 hostname and cgroup subtree delegation.

## 2026-10-26 — first operator-authorized guest attempt failed closed

The operator supplied the exact privileged B2 Lima command after separate approval. The real guest attempt **did not complete**:

```text
M81_B2_BLOCKED:Error: WORKLOAD_BOOT_FAILED:EXIT_SIGABRT
    at Object.listen (src/runtime/autonomous-edge.js:229:31)
    at async runM81B2GuestStack (src/runtime/m81-b2-guest-stack.js:96:14)
M81_B2_GUEST_INCOMPLETE exit=78 cleanup=true
```

The failure is **at isolated worker startup**, not at Cloud Lite ingestion or durable replay. The shell reported cleanup success (`cleanup=true`); this is not an independently measured zero-residue proof. No full B2 guest report was produced, no kernel isolation PASS is claimed, and M8.1.C remains blocked.

**Potential causes not yet distinguished:** 16-PID cgroup cap includes shell/ip-netns/chroot processes and Node native threads; Node SIGABRT can also result from missing runtime facilities, image libraries or memory/runtime initialization. Do not claim confirmed OOM or PID exhaustion without actual `pids.events`/`memory.events` and stderr.

**Corrections committed in response**, without widening manifests or changing guest infrastructure:

- `src/adapters/linux-isolated-process-driver.js`: only in explicit M81 Lima runtime, worker Node receives `--v8-pool-size=1` and `UV_THREADPOOL_SIZE=1`; CI driver remains unchanged. On early worker exit, the supervisor error now includes bounded worker stderr plus kernel `pids.events.max`, `memory.events.oom`/`oom_kill` and `memory.peak` when accessible.
- `src/core/workload-supervisor.js`: surface the **actual** active worker handle PID when available, rather than requiring a PID that the existing supervisor previously omitted. M8 kernel membership checks continue to use the actual PID, never an invented value.
- `scripts/arm64-vm/m81-b2-guest.sh`: stage a private `/tmp` in the chroot, and emit a failure-only JSON `LAB_FAIL` report including the post-teardown cleanup result when the coordinator aborts before writing its report. The existing 120 s limit and private-scope teardown remain.
- Regression tests added to `test/m81-b2-integration.test.js` for PID exposure and diagnostic format. An isolated JavaScript evaluation of the supervisor PID and mock kernel diagnostic returned PASS. The complete Node test suite and privileged guest rerun after these changes are **NOT_RUN** in this session.

**Next operator gate:** pull latest `main`, execute `node --test test/m81-b2-integration.test.js test/dashboard-integrated.test.js`. Only with passing tests and the already granted B2 guest-run authorization, repeat the single bounded guest run; capture stdout as `m81-b2-guest.json` and stderr as `m81-b2-guest.stderr` for inspection. **Do not blindly repeat if it fails again**; read `EXIT_SIGABRT:cgroup{...}:stderr=...` and investigate. Do not loosen quotas, enable broad host permissions or impersonate GitHub CI.

## 2026-10-26 — second guest retry: Debian Node bootstrap SIGABRT

Observed from the operator's real existing Lima VM:

```text
WORKLOAD_BOOT_FAILED:EXIT_SIGABRT:
 cgroup{pidsMaxHits=0,memoryOom=0,memoryOomKill=0,memoryPeakBytes=5193728}
 stderr tail: node::InitializePrimordials / libnode.so.115
M81_B2_GUEST_INCOMPLETE exit=78 cleanup=true
```

Machine-readable response: `kind=PEF_M81_B2_GUEST_STACK_V1`, `status=LAB_FAIL`, `ok=false`, `error=GUEST_RUN_INCOMPLETE`, `cleanup.status=PASS`, `ownedResourcesRemoved=true`, `systemdManagedValidated=false`, `physicalValidated=false`.

**Root cause assessment:** cgroup PID exhaustion and cgroup OOM are not supported by observed counters. Debian's `libnode.so.115` can load externalized JavaScript builtins from `/usr/share/nodejs` during `InitializePrimordials`. The original B2 `chroot` copied ELF `ldd` libraries and worker JS but did **not** stage those `/usr/share/nodejs` external dependencies. Debian's published Node 20 packaging and historic `Cannot load externalized builtin` crashes have the same initialization stack. **Highly likely cause; not proven** because the truncated stderr did not include its first fatal-error line.

**Constrained source patch, NOT guest-validated yet:**
- `m81-b2-guest.sh` stages only explicit distro-installed paths for Acorn, Acorn-walk, cjs-module-lexer, minimatch and Undici. It does **not** copy `node_modules`, install packages, mount host paths or increase quotas. It aborts if no such files exist.
- Before the Edge/Cloud coordinator it performs an 8-second, unprivileged `chroot --userspec=65534:65534` probe running actual Node 20 with the B2 V8 flag. Probe failure emits the **start** of stderr and cleans up both owned temporary sandboxes, returning a failure-only JSON.
- B1 Linux driver now preserves both the beginning and end of Node's native-error stderr, while maintaining bounded output.
- Regression assertions added for allowlisted dependencies, probe ordering and first-line error preservation.

**Follow-up:** pull to latest `main`; run the local M81 B2 tests and Bash syntax check. Only then perform one bounded guest B2 run under the same previously authorized, explicit operator scope. If the probe emits `Cannot load externalized builtin`, capture the exact path and add it only after confirming it is an appropriate distro-installed Node dependency. If the probe passes but isolated Node still aborts, diagnose the separate cgroup/netns/IPC transition; do **not** weaken the 16-PID/64-MiB caps without measured evidence.

**Operational state:** `B2_LAB_FAIL`, `M8.1.C BLOCKED`. No systemd service deployment, VM reboot or hardware claims.

## 2026-10-26 — third guest attempt, confirmed externalized Undici builtin missing in chroot

User-supplied native guest probe error (exact error from real `chroot --userspec=65534:65534`):

```text
M81_B2_NODE_CHROOT_BOOT_FAILED profile=property builtins=5
Cannot load externalized builtin:
"internal/deps/undici/undici:/usr/share/nodejs/undici/undici-fetch.js".
Node::BuiltinLoader::AddExternalizedBuiltin -> InitializePrimordials
M81_B2_BLOCKED:guest chroot Node init rejected
M81_B2_GUEST_INCOMPLETE exit=78 cleanup=true
```

The stdout JSON is `LAB_FAIL` with `error=GUEST_RUN_INCOMPLETE` and `cleanup={status:PASS,ownedResourcesRemoved:true}`. No isolated Edge workload or mTLS replay was run in this attempt. This **confirms the missing exact file in the staged rootfs** (the host source file's presence must still be verified). No evidence of cgroup PID/OOM exhaustion in the earlier 2nd attempt.

**B2 narrow patch:** append `/usr/share/nodejs/undici/undici-fetch.js` to the existing fixed-path Linux distro builtin copy allowlist. Require both the source and copied destination as regular files, fail with `M81_B2_REQUIRED_NODE_BUILTIN_MISSING` when absent. Keep uid 65534 in the 8-second chroot Node bootstrap probe before Edge startup. Extend read-only `bin/pef-m81-b2-guest-check.js` with `NODE_EXTERNALIZED_UNDICI_FETCH_PRESENT`, and add unit assertions to prevent future omission. No distro install, recursive package copy, pids.max increase, ACL weakening or VM host modification.

**Validation status at commit:** source inspection / syntax only. User Mac tests, guest read-only preflight and full B2 runtime **PENDING**. Do not claim LAB_PASS or proceed M8.1.C. After `git pull --ff-only`, run relevant tests and read-only `m81-b2-lima.sh --check`; then the operator may execute a single already-authorized bounded B2 attempt if the check is green. If more externalized files are identified, record exact paths and reconsider staging the matching bounded Debian Node runtime manifest, rather than iterating blindly.

## 2026-10-27 — real Property mTLS replay blocked by missing WAN sample

Operator-provided guest attempt:

```text
M81_B2_BLOCKED:Error: M81_B2_MTLS_REPLAY_FAILED:property
    at runM81B2GuestStack (src/runtime/m81-b2-guest-stack.js:132)
M81_B2_GUEST_INCOMPLETE exit=78 cleanup=true
```

Guest JSON: `status=LAB_FAIL`, `error=GUEST_RUN_INCOMPLETE`, `cleanup={status:PASS,ownedResourcesRemoved:true}`. The prior Node chroot bootstrap and actual worker setup progressed far enough to execute the replay assertion, but the report does **not** certify complete Property/Host, TLS replay or independent cleanup attestation.

**Source-confirmed sequencing defect:** `/lab/wan` invokes `ports.set(...)`, changing only virtual probes; the authoritative controller's `selectedWan` remains `null` until `engine.sample()`. The `/lab/cloud-lite/sync` route refuses sync with `CLOUD_UNAVAILABLE` when that controller remains offline. The B2 guest stack had `/lab/wan` then immediate `/lab/cloud-lite/sync`, missing `/lab/sample`. The existing M7.3 mTLS lab already uses `/lab/wan` + `/lab/sample` + sync. **This is the code-confirmed mismatch and most likely cause of the observed replay failure**; the exact remote response for this guest attempt was not captured.

**Fix:** `commitM81B2SyntheticWan(api,url,token)` explicitly sequences virtual WAN update, `/lab/sample` (must report `primary`/`CONNECTED`), and authoritative `/state` validation before any TLS replay; it fails closed on sample/state failure and verifies offline events remain queued. Replay error now emits bounded, credential-free `http`, `sync`, `error`, `attempted`, `remaining`, `localPending` and `wan` fields.

**Regressions:** dedicated B2 integration test uses real standalone virtual-lab Edge and durable journal with stubbed remote ingest to demonstrate `/lab/wan` alone leaves sync blocked (`CLOUD_UNAVAILABLE`), and `/lab/sample` enables replay. Separate test denies a failed sample and validates sanitized error messages. The existing M7.3 genuine TLS1.3/mTLS test remains the independent cryptographic check. A pure JS check of sequence, failure behavior, diagnostic and syntax passed; the full Node test suite and ARM64 guest replay after this patch remain operator-pending. No GitHub Actions workflow, VM lifecycle, network routing, cgroup quotas or host infrastructure changes.

## 2026-10-27 — successful operator B2 guest stack / closure

```json
{
  "kind":"PEF_M81_B2_GUEST_STACK_V1",
  "task":"M8.1.B2",
  "profile":"pef-r28s-1g",
  "status":"LAB_PASS",
  "ok":true,
  "checks":{
    "GUEST_SCOPE_AUTHORIZED":true,
    "BOTH_WORKERS_ISOLATED":true,
    "MANIFEST_CGROUP_LIMITS":true,
    "WORKER_UID_AND_NETNS":true,
    "LOCAL_INCIDENT_FSYNC":true,
    "CLOUD_TLS13_MTLS":true,
    "OFFLINE_QUEUE_REPLAY":true,
    "LOCAL_CLOUD_AND_BOTH_EDGES_CONCURRENT":true
  },
  "workloads":{
    "property":{"workloadId":"pef-property","isolation":"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM","actualLimitsEnforced":true,"pid":3154,"memoryPeakBytes":13725696,"offlineDurable":true,"replayed":true},
    "host":{"workloadId":"pef-host","isolation":"LINUX_CGROUP_NETNS_CHROOT_M81_LIMA_VM","actualLimitsEnforced":true,"pid":3160,"memoryPeakBytes":13635584,"offlineDurable":true,"replayed":true}
  },
  "elapsedMs":739,
  "transport":"TLS1.3_MTLS_LOOPBACK",
  "systemdManagedValidated":false,
  "vmRebootValidated":false,
  "physicalValidated":false,
  "productionAuthorized":false,
  "cleanup":{"status":"PASS","ownedResourcesRemoved":true}
}
```

**Source of evidence:** operator-pasted guest run JSON; no independent signed provenance or authenticated source retrieval. Local in-code inspector output for these supplied values: `accepted=true`, `status=OPERATOR_REPORTED_UNATTESTED`, `integrityVerified=false`, `guestKernelEvidenceIndependentlyVerified=false`, `readyForM81C=false`. The eight checks and reported teardown allow a B2 operator-lab functional checkpoint; they do not authorize systemd writes or a reboot.

**Next gate:** M8.1.C design can proceed; privileged guest service installation and VM stop/start require new explicit operator opt-in. Persistent service data must not be placed in B2's disposable temp directory. Ensure cleanup never touches M5.4 existing units or unrelated Lima resources.
