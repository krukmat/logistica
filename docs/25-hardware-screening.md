# 25 — W1.10.C2 Low-cost Edge hardware screening

**Status:** **SCREENING / SOFTWARE_LAB_ONLY**. No board acquired or installed. Machine-readable [hardware-shortlist-v1.json](contracts/hardware-shortlist-v1.json) · [C1 safety contract](24-device-integration.md) · [W1.8 hard gates](11-architecture-shootout.md).

## Cheap-first correction — 2026-10-15

**Owner priority:** inexpensive **complete MVP device**, not an expensive router development board. We now use a **provisional target of ≤60 EUR all-in for the Core-only POC** as a screening constraint. It is **not a validated total cost**, not a guaranteed quote and not a user-authorized purchase. Do not increase this target silently to accommodate a favorite board; disclose over-budget alternatives as rejected/deferred.

**Architecture trade-off:** the minimum POC is a **LAN-attached local logistics Edge** behind an existing site router. One Gigabit NIC is sufficient for this phase's physical P1 receipt/journal/restart/powercut experiments. It does **not** claim control of two WANs, NAT/firewall or three independent Ethernet interfaces. Keep dual-WAN networking in the shared Product Core and the emulator; the separate `FULL_DUAL_WAN_GATEWAY` profile remains **BLOCKED** until real 3-port hardware and its price are proven. This **narrows the first physical test**, not the Product requirement.

| Low-entry candidate | Listed price in EUR (not BOM) | Network/RAM/storage | Qualification for cheap POC |
|---|---:|---|---|
| **HP T620 refurbished** | **24 €** (incl. PSU according to seller) | 4GB RAM, 16GB flash, 1x Gigabit; Linux x86_64 to verify | **First low-cost POC investigation**, used/EOL |
| **Dell Wyse 5070 refurbished** | **54 € from seller variant** | 4GB/16GB selected configuration, 1x Gigabit; PSU unconfirmed | Backup; shipping/PSU may break 60 € cap |
| **Orange Pi R1 Plus LTS 1GB** | **59 € secondary listing** | 1GB RAM, 2x Gigabit, microSD and PSU extra | Router experiment only; low RAM and all-in budget likely fail |

References, **not guaranteed stock or landed cost:** [HP T620 24 EUR incl. supply, refurbished](https://amso.eu/es/products/ordenadores/tipo-de-caja-de-ordenador/ultra-small-form-factor-usff/terminal-hp-thin-client-t620-amd-gx-415ga-4x1-5ghz-4gb-ram-16gb-ssd-flash-wifi-fuente-de-alimentacion-275422) (delivery Spain must be confirmed), [Dell Wyse 5070 listing from 54 EUR](https://www.ebay.es/itm/127819904422) (seller variants, shipping and PSU unknown), [Orange Pi R1 Plus LTS 59 EUR secondary listing](https://es.findthedeal.org/p/B0F6S2Z77C/) (confirm direct seller checkout). Values are seller snapshot references observed 2026-10-15; no currency conversion.

**Excluded from C2 MVP selection:** NanoPi R5S-LTS (128 USD board only), Raspberry Pi 4 4GB (108.54 EUR board only), GL-MT3000 (101.99 EUR router). They may be useful later for the separately priced **full dual-WAN device**, but **are not financially justified as a first local-logistics POC**.

**All-in budget enforcement:** each candidate lists required but still unpriced items. HP T620 leaves **36 EUR** of the *provisional* 60 EUR budget to cover delivery Spain, cables and storage contingency; it is not a 60 EUR confirmed build. Dell leaves only **6 EUR**, so likely fails once confirmed shipping/PSU is added. Orange Pi leaves **1 EUR** before power/storage and is unlikely to fit. No recommendation can be approved until checkout and complete landed quote; verify stock, PSU and correct unit variant. Electricity (external wattmeter), reliability, SSD/flash endurance, and lifetime support remain unmeasured. Low upfront cost is not proven low total ownership cost.

**Technical risk:** the HP T620 is older, so verify Linux kernel drivers, Node ≥20 x86_64 support, actual fsync and real power interruption before any production inference. Protect the 16GB medium: the journal workload can exhaust it. External USB NICs may be added as experiments, but their price and Linux behavior must be validated and must not silently turn a 1-port local node into a claimed dual-WAN gateway.

## Executable C2 screening (no root, no hardware effects)

```bash
npm test
npm run device:candidates
npm run device:candidates -- --output /tmp/pef-c2-candidates.json
npm run dashboard
# Laboratorio integrado → Evaluar candidatos y observaciones
```

`src/runtime/hardware-screening.js` reads only documented specs and the BOM fixture, producing `PEF_HARDWARE_SHORTLIST_ASSESSMENT_V1`. `src/runtime/device-observation.js` observes **the host that executes Node**: CPU count, installed memory, process RSS and 8 temporary local-receipt append+fsync durations with reopen. It does not touch network routes, SPI/UART, block device partitions or privileged OS controls; temp data are removed. Results carry `scope=LOCAL_DEVELOPMENT_HOST` on the Mac or `EPHEMERAL_CI_RUNNER` in Actions. **Neither is an HP/Dell/Orange Pi device measurement**. In particular wall timing is not calibrated latency, and `networkThroughputMbps`, `boardIdleWatts`, `thermalDegreesC` and `actualPowerCutRecovered` are all explicitly `null`.

The [C2 test file](../test/device-candidate-screen.test.js) rejects mixed-currency BOMs, fabricated completion and forged hardware acceptance claims, verifies no false watts, and prevents physical backend promotion. `PEF_C2_PHYSICAL_ACCEPTANCE_V1` remains `NOT_RUN` until a completely separate trusted pipeline exists.

## Physical execution protocol — W1.8.E/F/G (not executed)

1. **Procurement prerequisite**: confirm variant RAM/storage and full EU *landed* quote with tax/delivery; agree to buy one chosen sample. No automatic purchasing.
2. **Reproducible OS**: image checksum, Linux/kernel/Node versions, read-only device inventory and exact driver/NIC mapping; boot authority and secure provisioning reviewed before any privileged deployment.
3. **Minimum functionality**: two independent WAN links and LAN, real link-down/upstream blackhole, failback and route readback; lock/fence orphan OS route subprocesses before permitting Core commit.
4. **Durability/hostile events**: 72h backlog sizing, real disk exhaustion, simulated partial/fsync faults followed by independent **physical power cut** via controlled rig, supervised boot/recovery, no ACK false positives.
5. **Workloads and security**: cgroups, storage quota, watchdog, mTLS credential provisioning/revocation, anti-rollback and OTA recoverability; accept only evidence from signed/device-controlled rig.
6. **Performance**: controlled traffic profiles 64/512/1500 bytes, simultaneous LAN/WAN/firewall, measured p50/p95 failover, CPU/RAM load, thermal soak, calibrated wall wattmeter idle/load/peak; 24h/72h reliability test before field discussion.
7. **Economics**: full BOM incl replacements and UPS, energy over expected lifetime and support/setup labor; measured watts determine actual annual running electricity, not vendor board power ceiling.

For each test: capture candidate ID, board revision and serial privacy-safe hash, image/distro/kernel/Node version, operator/timestamp, physical lab fixture ID, raw timestamped source evidence and cleanup/recovery state. Fail/missing evidence remains `NOT_RUN/BLOCKED`. W1.8.E–G and `device` backend cannot be unlocked by CI, self-reported `DEVICE_PASS`, board specs or PEF emulator outputs.

**Next:** W1.10.C2 physical acquisition decision and actual test execution, then W1.10.C3 independent enablement gate. The report only approves continuation into device investigation.
