# M4.1 — Property overlay: local alert and acknowledgement

**Date:** 2026-10-19 · **Branch:** `main` · **Status:** IMPLEMENTED; CI validation tracked separately. This block is software lab only.

## Scope, input and dependency

- Reuse M3 autonomous Edge (same Core, single-writer fsynced journal, health and bounded supervisor) without paid hosting, hardware or sensors.
- `Property` is a representative operations workflow: **ALERT** from an emulated facility asset → locally durable **OPEN** → operator **ACK** → **ACKNOWLEDGED**. The emulated actor invokes the authenticated loopback API; no physical sensor/protocol input is supported.
- Declare `workload.profile="property"` with `workload.enabled=true` in the existing validated Edge configuration. Default remains `receiver` for backward compatibility.
- `pef-property` uses an allowlisted static Node process, Core manifest admission/restart/health and `processOperation` IPC; no user-provided command or arbitrary executable is admitted.
- Property events are **O1 operational evidence** (not privileged P1 control). The journal retains the original alert and its ACK as immutable records. No silent event loss or assertion of 72h storage endurance.
- `src/core/property-incidents.js` validates commands again at the persistence boundary and writes into the original shared journal port; no second datastore. Only confirmed fsync/duplicate returns success.

## Tasks and DoD (two levels maximum)

| ID | Scope | Dependency | Output and acceptance | Status |
| --- | --- | --- | --- | --- |
| M4.1.1 | Contract: ALERT / ACK, stable immutable event IDs, schema, error semantics | shared Core and journal | Domain commands; invalid/orphan ACK/conflicts rejected | IMPLEMENTED |
| M4.1.2 | Local workload + Edge composition | M4.1.1, M3 | Static allowlist + manifest + health + operator-authenticated localhost API | IMPLEMENTED |
| M4.1.3 | Actual Edge E2E and visual UI | M4.1.2 | Offline → alert → ACK → stop/reopen → retained state → synthetic WAN back → mock replay; HTTP dashboard action and CI proof | IMPLEMENTED — CI pending |

## Contract

Commands are JSON, **no extra properties**:

- ALERT: `{"operation":"ALERT","incidentId":"INC-001","assetId":"PUMP-01","severity":"CRITICAL"}`.
- ACK: `{"operation":"ACK","incidentId":"INC-001"}`.
- `incidentId` and `assetId`: 1–48 chars, alphanumeric starting char, ASCII letters/digits/`_`/`-`. Severity: `WARNING` or `CRITICAL`.

HTTP requires `x-pef-token` (24–256 chars in server configuration, not committed). Endpoints: `POST /property/incidents`, `GET /property/incidents`. Successful new event returns HTTP 201, idempotent repeat 200, mismatched payload/event ID 409, missing alert or invalid fields 400, unauthorized 403, unavailable property worker 409, fsync/storage failure 507. These are lab-only loopback APIs, not a production authentication or tenant access model.

Event IDs are `property.<deviceId>.<incidentId>.alert|ack`, with domain envelope `PROPERTY_ALERT_RAISED|PROPERTY_ALERT_ACKED`; immutable payloads, category `O1`, correlation key `property.<deviceId>.<incidentId>`. Existing `validateEnvelope` / mock cloud receive these events on the same sync protocol. No new Core subsystem or private Property journal.

## Execute and observe

```bash
npm test
npm run dashboard
# open http://127.0.0.1:8787 and select "Laboratorio integrado"
# click "M4.1 — Property: alerta local y ACK operativo"
```

CI exercises `test/property-overlay.test.js` (journal corruption-free reopen and real Edge HTTP scenario) and `test/dashboard-integrated.test.js` (dashboard HTTP action `propertySmoke` → actual Edge child/workload → evidence `LAB_PASS`). The smoke runner resides at `src/emulator/lab/property-smoke.js` and does not touch existing Mac interfaces or any remote Cloud.

### Invariants and negative cases

- ALERT is stored durably before returning 201. ACK is a *second* fsynced event and requires a recorded alert.
- Repeating either command is idempotent; conflicting asset/severity for the same incident ID returns `EVENT_ID_CONFLICT`; unsupported commands and extra fields fail closed.
- WAN outage cannot block local workflow. Cloud replay is attempted only when the synthetic WAN is restored and the **mock** acknowledges durably.
- Journal rejection must never produce a false positive ACK; protected control reserves are unchanged. `NODE_PROCESS_ONLY`, `actualLimitsEnforced=false`.
- Linux isolated workload driver is still receiver-specific and is not Property validated. Property is **not Linux cgroup, secure configuration, physical device, sensor, real WAN, real Cloud, hardware power-loss or production validated**.

## Change traceability

Task: M4.1.1–M4.1.3
Requirement ID: REQ-LOC-01, REQ-WRK-01/02, REQ-STA-01/02, REQ-OBS-01
Change: added
Rationale: Prove usefulness of one locally capable product overlay without forking Core.
Classification: MODULE + CONFIG
Evidence: `src/core/property-incidents.js`; `test/property-overlay.test.js`; `test/dashboard-integrated.test.js`; CI run to be linked once green.
Impacted docs: `docs/05-overlays-workload-contract.md`, `docs/12-emulator.md`, `docs/29-mvp-priorities-after-f1.md`, `docs/contracts/emulator-integration-v1.json` (existing contract maintained).
Open decision: Host workload/commonality (M4.2–M4.4) and physical integration remain outstanding.
