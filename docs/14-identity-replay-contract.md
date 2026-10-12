# 14 — Edge identity, event revisions and offline replay (W1.9.O)

**Status:** `IMPLEMENTED / CI VERIFIED (lab only)`; [audit W1.9.O](audit/w1.9-o-2026-10-12.md). This contract refines [09 Runtime](09-runtime-contract.md), [12 Emulator](12-emulator.md) and [13 Connectivity](13-connectivity-topology.md) without selecting hardware, distribution, PKI, storage engine or Cloud provider.

## O1 — Identity and versioned event envelope

| Field | Role | Lifetime |
|---|---|---|
| `siteId` | tenant/site partition for event namespace | stable under site provisioning |
| `deviceId` | device-level source of truth for remote dedup | stable after secure provisioning; **mock value in lab** |
| `sessionId` | distinct execution/boot epoch (not identity/secret) | one runtime session |
| `eventId` | deterministic per-event key: `wan.{deviceId}.{sessionId}.{sequence}` | immutable forever within dedup window |
| `correlationId` | joins incident, recovery and ingestion evidence; v0.1 equal eventId | event / incident |
| `configRevision` | effective configuration at event creation (not Cloud desired revision) | event snapshot |
| `schemaVersion` | codec discriminator; version `1` in current lab | event format version |

Payload structure: [`edge-event-envelope-v0.1.schema.json`](contracts/edge-event-envelope-v0.1.schema.json); `validateEnvelope` also checks cross-field `eventId` scope. Identity must be explicitly supplied to `createEdgeRuntime`; no user credentials, hardware private keys or real device IDs are stored in the repository. Tests inject non-secret `lab-site/lab-device` values. **A fresh session ID is not equivalent to a hardware-protected stable identity**; operator-provided session IDs must not be reused across boots. For production, the provisioning/root-trust story remains OPEN-SEC-01/OPEN-BOOT-01.

The `sha256` field in the lab journal hashes the Node.js-serialized event record (`kind,id,payload,category`); it is integrity detection, **not authentication, a signature or a cross-language canonical serialization guarantee**. The payload does not expose private keys or tokens.

## O2 — Edge journal, mock Cloud and failure handling

```mermaid
sequenceDiagram
  participant E as Edge Runtime
  participant J as P1 File Journal (lab)
  participant C as Cloud Replica (in-memory mock)
  E->>J: EVENT(eventId, revision, payload)
  J->>J: append + host fsync
  J-->>E: local ACK (not remote ACK)
  E->>C: ingest(eventId, scope, sha256)
  C->>C: record/dedup keyed eventId
  C--xE: remote durable ACK lost / ambiguous
  Note over E,J: P1 CLOUD_ACK marker NOT written
  E->>C: retry same eventId + digest
  C-->>E: durable ACK (matching scope, ID and digest; duplicate=true)
  E->>J: CLOUD_ACK(eventId) + host fsync
  J-->>E: local cursor advances
```

The transport is intentionally *mock-only* and bounded to **1..256 pending events per call**. Invalid or ambiguous remote responses leave local events pending and stop further processing within the batch. Remote ingest mock checks site/device scope, accepted config revisions, checksum and payload collisions; a locally persisted `CLOUD_ACK` is written **only if** the mock returned `ok=true`, `durable=true` and matching `eventId/sha256/siteId/deviceId`.

| Negative outcome | Behavior |
|---|---|
| `REMOTE_ACK_LOST` after mock committed event | leave local pending; replay remote dedup later |
| `INVALID_REMOTE_ACK` (wrong ID/digest/scope or no durable claim) | do not mark local cursor |
| `CONFIG_REVISION_CONFLICT` | refuse remote; preserve pending until explicit revision policy |
| `DEVICE_SCOPE_MISMATCH` | reject cross-site/device input in mock |
| `EVENT_ID_CONFLICT` | reject same ID with a changed event payload/checksum |
| `INVALID_EVENT_CHECKSUM`, `EVENT_ID_SCOPE_MISMATCH` | reject inconsistent event envelope |

No infinite backlog, remote durability, or end-to-end exactly-once **side effects** are promised. P1 quota/control reserve, O0/O1 retention and dedup tombstones remain bounded, as tested in W1.9.J–N. `CLOUD_ACK` only confirms the **mock's durable flag**; real production ingestion will require actual persistent Cloud storage, authentication and transaction boundaries.

## O3 — Adapter/hardware handoff

| Concern | Lab evidence | Future Linux/device gate |
|---|---|---|
| WAN detection/selection | Node sim + localhost + isolated Linux `veth` | real NIC/carrier, link probes, routing policy, packet throughput and p95 |
| Journal and cursor | host OS `fsync`, SIGKILL/reopen, compaction | physical power cut, controller/cache barriers, durable directory/boot recovery |
| Stable identity | explicit test `siteId/deviceId` and unique session epoch | protected provisioning, recovery/rotation, anti-cloning, real device attestation decision |
| Cloud replication | in-memory replay/dedup/ACK ambiguity simulation | authenticated transport (mTLS/overlay), persistent Cloud DB, replay protection, bounded deadlines |
| Encoding and signatures | Node `JSON.stringify` digest | canonical versioned wire encoding, signatures/MAC and migration strategy |
| Revisions/conflicts | revision allowlist; mismatch preserves pending | desired/effective revision contract, local override/merge policy, signed configuration updates |
| Power/thermal and LAN continuity | software sandbox only | instrumented DUT, AP/switch power boundary, hardware WAN and UPS |

**Still NOT_RUN:** W1.8.E–G physical shootout, real trust root, production Cloud, secure bootstrap, signed OTA, real blackout durability. No purchase/provisioning triggered.

## CI and task gate

[GitHub Actions #38268776321](https://github.com/krukmat/logistica/actions/runs/38268776321): **51/51 Node tests**, 7/7 deterministic `SIM_PASS`, loopback `LAB_PASS`, Linux namespace `LAB_PASS CLEANUP=CLEAN`. Scope: emulator and hosted Linux lab. [Audit](audit/w1.9-o-2026-10-12.md).

**Next (W1.9.P proposed):** trustworthy mock transport with bounded timeouts and explicit identity bootstrap/reference storage; harmonize wire encoding before connecting devices. Do not call it production security without PKI and external evidence.
