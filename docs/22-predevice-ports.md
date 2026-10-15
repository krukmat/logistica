# 22 — Predevice port conformance (W1.10.A)

**CI VERIFIED in software/laboratory (2026-10-15).** [Run #38735602133](https://github.com/krukmat/logistica/actions/runs/38735602133): 99/99 Node PASS, 17/17 port conformance LAB_PASS, isolated Linux and prehardware gate SUCCESS. The physical device backend remains blocked. No real device driver is present. [Tasks](tasks/w1.10-predevice-emulation.md) · [machine contract](contracts/predevice-ports-v1.json).

```mermaid
flowchart LR
 UI["Dashboard / headless CLI"] --> R["13-check conformance runner"]
 R --> W["Scripted WAN probe/route double"]
 R --> HOST["Existing Runtime host + temporary fsync P1"]
 W --> HOST --> CORE["One shared PEF Core + local receipts"]
 CORE --> EVID["Per-check evidence LAB_PASS/LAB_FAIL"]
 EVID --> UI
 DEVICE["Future Linux device adapter: BLOCKED"] -. "same ports; separate physical tests" .-> HOST
```

The same `src/core/edge-runtime.js` and actual OS-file journal are used in this software rehearsal, not a parallel set of business rules. Malformed probes and route refusals cause no Core state commit; idempotent offline receipt requires fsync; reopening P1 retains the receipt. No NIC/route on the operator's computer is modified.

**Important limitation:** the mocked route adapter rejects before mutation. An actual Linux driver can fail *after* changing some OS state. The current Core does not provide route rollback; W1.10.B must design verification, compensation, retry deadline and consistency checks before connecting device NICs. Physical power-cut persistence, PKI, workload isolation, boot/OTA, thermals, wattage and unit economics remain `NOT_RUN`.

Run `npm run ports:conformance` or from `npm run dashboard` → Laboratorio integrado → **Ejecutar matriz prehardware**. Evidence includes stable IDs, per-check observations, `physicalValidated:false` and `deviceBackend:BACKEND_NOT_IMPLEMENTED`.

## B1: verified route transaction (2026-10-15)

The port boundary `createVerifiedRoutePorts(raw)` requires `readRoute()` in addition to `probe` and `applyRoute`. It reads current route before mutation, applies the candidate and checks readback. Failure triggers compensation to previous route and verifies it; failed compensation enters **quarantine**, where all further route changes are rejected until explicit `reconcile(expectedRoute)` confirms the external state.

This protects the **Core commit boundary**, but does not prove kernel route atomicity: the test uses synthetic ports, including a deliberately partially-mutated route. A Linux driver needs trustworthy readback and bounded commands. A process crash between partial mutation and rollback still needs boot reconciliation; deadlines, persistence, watchdog and real-device tests remain W1.10.B2/C.

## B2 — Bounded WAN adapter and boot gate

`createBoundedWanPorts(raw,{probeTimeoutMs,routeTimeoutMs,reconcileTimeoutMs})` is **new adapter composition**, reusing the existing verified route adapter and Product `ConnectivityController`. The raw driver receives an advisory `AbortSignal` for probes, route apply, and readback. The wrapper enforces a timer-based deadline for each operation. A rejected/late probe does not advance Core clock nor change routes. A timed-out route **always** quarantines further writes, even if the underlying asynchronous operation later reports success.

```mermaid
sequenceDiagram
  participant C as Product Core
  participant B as Bounded + verified ports
  participant R as Raw OS port (synthetic)
  C->>B: applyRoute(backup)
  B->>R: applyRoute(backup, AbortSignal)
  Note over B: Deadline expires
  B-->>C: PORT_ROUTE_DEADLINE_EXCEEDED
  Note over C: No policy state commit
  R-->>B: Late completion may mutate route
  Note over B: Quarantine persists
  B->>R: readRoute after task settlement
  Note over B: Explicit reconcile(expected route)
  B-->>C: Unlock only on matching readback
```

**Bootstrap is fail-closed:** on every newly created bounded adapter, routing remains blocked until `reconcile(expectedRoute)` compares external readback with a *trusted* expected route (the lab passes this explicitly). Do not derive that expectation from a public HTTP parameter in production. A boot validator must obtain the expected state from durable, trusted local metadata. Neither the synthetic fixture nor JavaScript `AbortSignal` terminates Linux subprocesses, nor prevents commands started before a process restart from modifying OS state afterward. Real driver must fence orphan commands, handle readback timeouts and prove durable boot recovery independently.

The predevice dashboard matrix now contains **23 checks**, including six timing/fencing simulations. Timeout values (15ms) are **test fixtures**, not deployment recommendations. No real hardware, Linux route operations on host, physical power-cut or device certification.
