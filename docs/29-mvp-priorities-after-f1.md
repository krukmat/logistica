# 29 — PEF MVP end-to-end priorities and deferred journal index

**Date:** 2026-10-18 · **Repository:** `krukmat/logistica`, `main` · **Decision:** stop optimizing the 72h journal now; prioritize end-to-end product usefulness. This does **not** silently revise baseline product requirements or certify physical hardware.

## Decision boundary

**W1.10.F1** operator evidence reports 100,000 durable events under a 1GiB ARM64 Lima guest, with 277.77MiB maximum sampled process RSS, >400MiB available guest RAM, normal reopen and dedup/conflict PASS; evidence [audit](audit/w1.10-f1-f2-mac-1g-2026-10-18.md). **W1.10.F2** shows the current standalone Edge `100MiB` journal cap is insufficient for the 72h/2-events-per-second target: modeled journal 0.612GiB (1KiB) or 2.095GiB (4KiB). 100MiB roughly covers **11.49h** or **3.35h** of those synthetic 2-events/s payloads, not a service SLA. The 100k benchmark uses a **separate 256MiB laboratory allowance**; do NOT claim 100k in the 100MiB product configuration.

**Defer W1.10.G1–G4** (bounded-memory index architecture, adapter replacement, 518,400-event test and comparison). This is technical debt **BACKLOG / DEFERRED**, not DONE or unnecessary. Keep per-event fsync, fail-closed errors, protected reserves and explicit rejection/backpressure; never silently discard business data. Do not raise the existing standalone journal quota or claim 72h. Any credible 72h/fleet/powercut guarantee must reopen this decision.

## Product-first next execution blocks (1–2 levels)

| ID | Deliverable | Core next subtasks | Acceptance in lab |
| --- | --- | --- | --- |
| **M1 — Vertical end-to-end** | One repeatable local operation surviving WAN/cloud loss and automatic recovery | M1.1 reuse current `pef-receiver` + shared Core journal + autonomous Edge; M1.2 demonstrable offline → receipt ACK → restart → replay → reconciliation flow | One script / observable evidence, no dashboard dependency; avoid parallel demo-only business logic |
| **M2 — Cloud Lite minimum** | Real but minimal remote plane, not only a mock | M2.1 device registry + authenticated event ingest/status; M2.2 durable dedup/replay cursor and reconciliation after reconnect | Cloud outage cannot stop local operation; remote ACK advances cursor only when validated |
| **M3 — Autonomous appliance lifecycle** | Reliable headless boot, configuration and safety | M3.1 single-writer/process supervision and status API integrated end-to-end; M3.2 trusted identity/config change/known-good recovery **design and lab gates**, no unverified physical claims | Restart and local-only are reproducible; secure remote commands blocked until trust is implemented |
| **M4 — Two business overlays, same Core** | PEF Property primary PoC and Host variant | M4.1 Property survival demonstration with a locally capable workload; M4.2 Host variant as configuration/workload change, quantify duplication | Same platform contracts; modules do not fork Core. Current logistics receiver is a **technical fixture**, not validation of Property/Host demand |
| **M5 — Pilot preparation** | Installation and pilot economics | M5.1 scripted VM/package deployment and operator runbook; M5.2 full delivered hardware BOM + customer validation plan for Property/Host | Reproducible setup and priced operational scenario; neither hardware purchase nor customer traction inferred |

Order: **M1 → M2 → M3 → M4 → M5**, with security and isolation considered in each applicable vertical slice, not delayed to the end. Prefer finishing an observable end-to-end workflow over extending component-level simulations.

## Deliberate product-scope decisions needing confirmation at acceptance

The current low-cost R28S candidate has **two** physical Ethernet ports. The least-cost proposed topology is **Core behind an existing router** (PEF does **not** itself switch physical WANs). This can support a useful local-first demonstration but is **narrower than the foundation's full multi-WAN gateway promise**. For the MVP showcase, disclose the external router dependency; original `REQ-CON-01/02/03` physical product acceptance remains open. Do not quietly mark it implemented by the virtual three-interface netns.

Likewise the foundation's 72h sizing scenario and `REQ-STA-02` bounded store-and-forward remain product-level ambitions. A shorter, bounded **lab demo** can proceed without meeting the 72h endurance objective, provided it is not sold as full product acceptance. Cloud Lite, secure provisioning, powercut, real NICs and paid pilots are not currently validated.

## Reopen W1.10.G if any condition is met

- A pilot/purchase contract **requires** 72h at defined traffic volume or audited durability.
- Storage pressure occurs before the limited lab workflow completes or retention requirement exceeds the configured quota.
- RSS/guest memory or reopen time exceeds measured safe thresholds with a representative workload.
- Event loss, false ACK, replay corruption or priority-reserve failure appears in the smaller workload.

**Next action:** inventory the existing standalone Edge, cloud/mock and logistics receiver, then implement a single **M1 end-to-end evidence flow** without replacing the shared journal or inventing a new simulator.
