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
