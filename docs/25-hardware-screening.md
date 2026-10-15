# 25 — W1.10.C2 Low-cost Edge hardware screening

**Status:** **SCREENING / SOFTWARE_LAB_ONLY**. No board acquired or installed. Machine-readable [hardware-shortlist-v1.json](contracts/hardware-shortlist-v1.json) · [C1 safety contract](24-device-integration.md) · [W1.8 hard gates](11-architecture-shootout.md).

## Business constraint and selection logic

Prioritize a low-cost, locally reliable logistics/property/host Edge node carrying the **same Product Core**. At least two WAN links plus one site LAN should work without exotic dependencies. Initial **screening** threshold is 2GiB RAM / three usable Ethernet connections / 16GiB boot medium, subject to later W1.8 measured revision; these are C2 *screening heuristics*, not certified specifications or product standards.

| Candidate | Vendor-proven technical fit | Example source board price (2026-10-15) | Provisional role |
|---|---|---|---|
| **NanoPi R5S-LTS 4GB/64GB eMMC** | RK3568B2 arm64 quad A55, 1x GbE + 2x 2.5GbE, eMMC, NVMe M.2, Debian 13 Core image | **USD 128** bare board, plus USD 15 case; EU duty/VAT/delivery/PSU missing | **First physical investigation** |
| **Raspberry Pi 4 Model B 4GB** | Broadcom BCM2711 arm64, native Gigabit Ethernet, USB3; requires 2 extra USB NICs for 2WAN+LAN, storage/power/case | **EUR 108.54** incl local seller VAT for board; extras and delivery missing | Compatibility fallback |
| **GL.iNet GL-MT3000 Beryl AX** | MT7981 dual-core, 512MB RAM, 256MB NAND, 1x2.5GbE WAN and 1xGigabit LAN, USB3, OpenWrt | **EUR 101.99** EU online store listing; external storage and third port/compute missing | Router companion or experimental split architecture only |

**Verifiable primary sources:**
- NanoPi R5S-LTS [manufacturer specifications and purchase options](https://www.friendlyelec.com/index.php?product_id=287&route=product/product); [board/OS wiki](https://wiki.friendlyelec.com/wiki/index.php/NanoPi_R5S). **Seller explicitly indicates buyer may owe import duty**. The quote is in USD, **not converted** to EUR.
- Raspberry Pi 4 [official technical specifications](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/specifications/) and [4GB Spanish price listing](https://www.raspipc.es/index.php?accion=verArticulo&idProducto=1752&src=raspberrypi&ver=tienda).
- GL-MT3000 [manufacturer specification](https://www.gl-inet.com/es/products/gl-mt3000) and [EU store listing](https://store-eu.gl-inet.com/collections/new-year-deals); [OpenWrt platform entry](https://openwrt.org/toh/hwdata/gl.inet/gl.inet_gl-mt3000).

**Price semantics:** these are dated per-product snapshot references, not quotes or EU landed BOM/TCO. Requirements for a complete quote: board, PSU, enclosure/cooling, durable storage and spare, enough Ethernet adapters/cables, customs/VAT/shipping, optional UPS, deployment labor, power, maintenance and possible replacement. The executable comparator rejects mixed currencies and returns `totalCost:null` while anything required remains unpriced. Do not assert R5S cheapest: its EU import and eMMC endurance remain uncertain.

**First candidate rationale:** R5S has three Ethernet ports as shipped and a usable 64GiB eMMC option and M.2 path. Pi 4 is more mainstream for Linux experimentation but the three-link topology introduces USB NIC complexity. MT3000 has attractive integrated networking, but 512MB/256MB and the USB port limit prevent a robust all-in-one Core assumption without profiling; it may suit a separate routing front-end. No design/OS/platform selection is binding.

## Executable C2 screening (no root, no hardware effects)

```bash
npm test
npm run device:candidates
npm run device:candidates -- --output /tmp/pef-c2-candidates.json
npm run dashboard
# Laboratorio integrado → Evaluar candidatos y observaciones
```

`src/runtime/hardware-screening.js` reads only documented specs and the BOM fixture, producing `PEF_HARDWARE_SHORTLIST_ASSESSMENT_V1`. `src/runtime/device-observation.js` observes **the host that executes Node**: CPU count, installed memory, process RSS and 8 temporary local-receipt append+fsync durations with reopen. It does not touch network routes, SPI/UART, block device partitions or privileged OS controls; temp data are removed. Results carry `scope=LOCAL_DEVELOPMENT_HOST` on the Mac or `EPHEMERAL_CI_RUNNER` in Actions. **Neither is an R5S/Pi/MT3000 measurement**. In particular wall timing is not calibrated latency, and `networkThroughputMbps`, `boardIdleWatts`, `thermalDegreesC` and `actualPowerCutRecovered` are all explicitly `null`.

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
