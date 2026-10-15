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
