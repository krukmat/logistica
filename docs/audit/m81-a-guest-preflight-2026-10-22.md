# M8.1.A — guest readiness contract audit (2026-10-22)

**Scope:** `krukmat/logistica` `main`. Read-only preparation for the existing named `pef-r28s-1g` Lima guest. No guest creation, boot, stop, reboot, service activation, cgroup modification, network route change, external cloud or physical device intervention.

## Implementation and evidence

| Gate | Result | Evidence / limitation |
| --- | --- | --- |
| Portable Core contract, manifest-derived Property and Host quotas | STATIC_SMOKE_PASS | `src/core/m81-guest-contract.js` and `src/runtime/m81-guest-preflight.js`; inspected actual code. Existing manifest limits Property 150mCPU /64MiB, Host 180mCPU/80MiB, swap 0 and pids 16 |
| M5.4 systemd service unit composition | STATIC_SMOKE_PASS | Pure `runM54ServiceContract()` exercised with existing unit renderer; does **not** start systemd |
| CLI and read-only Lima observer | JS_SYNTAX_PASS / GUEST_NOT_RUN | `bin/pef-m81-preflight.js` and `scripts/arm64-vm/m81-lima-observe.sh`. Existing running guest and explicit operator acknowledgement required |
| Dashboard UI and HTTP test | SOURCE_IMPLEMENTED / LOCAL_E2E_NOT_RUN | `m81Preflight` action, local unauthenticated JSON inspection, `test/dashboard-integrated.test.js` |
| Unit/negative tests | SOURCE_IMPLEMENTED / NODE_TEST_NOT_RUN | `test/m81-guest-preflight.test.js`. Source syntax parsed, but no complete `npm test` was executed on a checked-out repository |
| Linux guest driver support | BLOCKED | Current `assertHostedLinuxIsolationPreflight` requires GitHub-hosted CI root and cannot run in an ordinary Lima VM. Do **not** spoof CI flags |
| 1GiB guest memory/CPU/kernel observation | NOT_RUN | No operator guest JSON obtained; cannot claim guest preflight PASS |
| Combined systemd + isolated workers + mTLS Cloud Lite | NOT_RUN | Scope belongs to M8.1.B, requires distinct Lima authorization and integrated guest implementation |

## Local validation performed

- All modified/new JavaScript source files parsed successfully in an isolated JavaScript check, including the Core, CLI, dashboard UI and integration tests. The executable CLI shebang was excluded only from the parser test.
- The pure Core guest evaluator was executed on a *synthetic, explicitly unauthenticated* guest fixture (972MiB Linux ARM64, 4 CPUs, Node 22, systemd PID1, cgroup v2 controllers) and rejected misleading `readyForM81B`, returning `BLOCKED`. Invalid scope/read-only claim was rejected; memory mismatch was detected.
- The wrapper composing real manifest Linux quota plans and existing systemd unit rendered `STATIC_CONTRACT_PASS`, with `GUARDED_GUEST_ISOLATION_DRIVER_AVAILABLE=false`.
- **Not executed:** Node `npm test` full suite or targeted tests, bash `-n` on a checked-out copy, dashboard HTTP server live, guest `limactl` invocation, resource/performance measurements. No GitHub Actions results are used.

## Next gates

1. Operator executes `npm test` or targeted `node --test test/m81-guest-preflight.test.js test/dashboard-integrated.test.js` locally and supplies failures if any.
2. If desired, inspect the *already running* named VM in read-only mode: `PEF_M81_VM_ACK=EXPLICIT_READ_ONLY_LIMA_M81 bash scripts/arm64-vm/m81-lima-observe.sh r28s-1g > /tmp/m81-guest-observation.json`. Preserve report; import into CLI/dashboard.
3. M8.1.B cannot begin guest service/kernel integration until a separately reviewed Lima-scoped Linux isolation driver has been implemented, with opt-in, deterministic cleanup and tests. Even correct guest observations are not operator-attested or device proofs.

**Decision:** M8.1.A implemented as static, fail-closed readiness and observation interface, **not** validated on an actual guest. No physical pilot clearance; M8.1.B integration remains BLOCKED.
