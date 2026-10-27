# M9 — Physical PEF proof-of-concept / device-first validation

**Decision 2026-10-27:** `CONDITIONAL_GO_FOR_ONE_UNIT_DEVICE_POC_PREPARATION`. **No purchase has been authorized and no device is reported acquired.** Do not label an appliance, physical pilot, production deployment or actual WAN failover `PASS` until measured.

## Purpose, source and product scope

Validate that the **same** PEF Product Core, journal, isolated Property/Host workloads and local authenticated Cloud Lite actually work on affordable, commercially obtainable ARM hardware, surviving ordinary reboots and controlled real power interruption while respecting storage, power, heat and resource limits.

The business thesis remains [01 — product foundation](../01-product-foundation.md): private resilient local infrastructure with eventual Multi-WAN, private site network and remote management. **Initial prototype** uses the later-approved low-cost `CORE_SIDECAR_BEHIND_EXISTING_ROUTER` topology from [E4 R28S topology](../contracts/pef-r28s-e4-topology-v1.json). The external router retains the WAN switching duty; on-device physical 2WAN + LAN is **not** claimed or a dependency for the first sideloaded Core validation. The full-networking appliance still requires a separate network hardware and integration proof.

## Existing evidence / reason to stop extending VM

- M8.1.B2 `LAB_PASS` **operator-reported and not independently attested**: 8/8 actual-guest checks, concurrent Property/Host, cgroup/netns/chroot, fsync and TLS1.3 mTLS queue replay, cleanup PASS. The run lasted 739 ms, which is not endurance validation.
- M3/M5 separate labs already exercise service restart/rollback/systemd primitives; M7/M6 provide authenticated offline replay. Further M8.1.C/D Lima execution **deferred**, except for targeted reproduction.
- The VM does **not** measure Rockchip A53 throughput, physical NIC and network routes, onboard Debian image, storage wear or abrupt powercut, temperature, watts, or landed unit BOM. Those are now the highest-value unknowns.
- Keep local test harnesses; do not restore `.github/workflows`.

## Candidate and acquisition guard

**Primary hypothesis:** NanoPi R28S 1GiB RK3528A, 2× GbE, existing-router **sidecar**. Official FriendlyElec product listing as observed 2026-10-27: USD 20 bare board, microSD option USD 15.99, case USD 9, Debian 13 Core and 5V 2A (non-PD). A complete landed Spain one-unit quote, qualified high-endurance flash, hardware supply, available boot image and permitted 3rd-party router model are NOT_VERIFIED. Manufacturer reference: https://www.friendlyelec.com/index.php?product_id=320&route=product%2Fproduct.

**Fallback, not automatic purchase:** NanoPi R3S-LTS 2GiB ($57 bare board) if memory/CPU/storage or exact driver support makes R28S unsuitable. Vendor options and quotations may change; compare actual delivered totals, not just board catalog price: https://www.friendlyelec.com/index.php?product_id=311&route=product%2Fproduct.

**Hard budget policy:** legacy ≤EUR60 complete-device target was provisional; it is not demonstrated by a USD board listing. Obtain one-unit landed price before approval. Do not order 50 units, provision paid cloud resources, alter real customer networks, or assume device availability from web catalog alone.

## Tasks — stage gates with 1–2 levels

| Task | Depends on | Subtasks / measured acceptance | Status |
| --- | --- | --- | --- |
| **H0 — Prototype definition + procurement gate** | M8.1.B2 | H0.1 verify board OS image/kernel/Node>=20, native NIC inventory, cgroup v2, systemd, source images/checksums and device access; H0.2 quote one R28S + high-endurance media + 5V/2A non-PD PSU + power/data cables + case if necessary + shipping/taxes; H0.3 record real router availability and whether sidecar topology is achievable without touching production routes | **NEXT; read-only assessment only** |
| **H1 — Physical boot and baseline** | H0 + separately approved acquisition | H1.1 boot real Linux ARM64 and capture image hash, kernel, memory pressure, cgroups, interfaces, thermals and storage layout; H1.2 run unchanged Product Core golden traces, journal reopen and isolated worker scope preflight | NOT_RUN; no hardware |
| **H2 — Integrated on-device runtime** | H1 | H2.1 adapt B2's **guest-only** driver to an explicitly authorized **device** scope (do not spoof VM hostname, CI or bypass authorization); H2.2 launch distinct owned systemd units/approved supervisor for Property, Host and Cloud Lite, persist journals outside disposable `/tmp`; H2.3 enforce manifest quotas and local HTTPS mTLS replay with actual device resources | NOT_RUN |
| **H3 — Failures and recovery on hardware** | H2 | H3.1 offline operations/ACK fsync, duplicate-proof replay, controlled workload crash and service restart; H3.2 authorized actual power removal and restore, compare journal digests and boot identity, zero false durable ACKs, reboot safe-mode/rollback behavior. Never interrupt uncontrolled devices | NOT_RUN |
| **H4 — Real system resources and site topology** | H2–H3 | H4.1 idle/peak power, board/flash temp, RAM, CPU, disk pressure, recovery latency, bounded soak and retention budget; H4.2 sidecar connected behind existing router, actual Ethernet reachability and isolated LAN/Cloud outage. **No claim of on-device dual-WAN switching** | NOT_RUN |
| **H5 — Product/gateway decision** | H3–H4 | H5.1 compare physical metrics with W1.5/W1.8 requirements, cost and support burden; H5.2 choose continue Property/Host sidecar, scale up board to 2GiB, or acquire 3+ physical interfaces/verified router integration for full WAN/LAN product. Decide next pilot only with evidence | NOT_RUN |

## Go/no-go criteria

**GO to hardware bring-up** only if one-unit acquisition, bootable supported Linux/Node/kernel, access/debug and safe laboratory network are confirmed and explicitly authorized.

**GO to physical functional PoC** only after H2/H3: genuine running Property/Host on one real board, local-only operation, crash/reboot persistence, mTLS replay and correctly bounded cgroups. Report limitations of the single-board test.

**GO to broader field pilot/production: NOT implied.** Must independently address real multi-WAN/LAN where claimed; 72h P0/P1 offline retention, hardware powercut correctness, thermal and long-load margins, signed/provisioned identity, OTA/revocation/watchdog, third-party integrations, installation/support and plausible per-unit economics.

## First safe execution block

H0 is immediately executable as source/vendor verification and purchase BOM without privileged tools or new cost. No hardware order, systemd installation, VM restart or physical power-cut has been performed or authorized. Report the complete BOM and exact blockers before H1.
