# 27 — W1.10.E1–E5 · PEF ARM64 1GB resource viability

**Date:** 2026-10-18. **Scope:** SOFTWARE / virtual device / cost-first architecture. **State:** E1–E5 implementation delivered; CI and virtual Mac operator runs are distinct. **NOT a NanoPi R28S hardware certification.**

[VM guide](26-arm64-virtual-device-lab.md) · [E4 options](contracts/pef-r28s-e4-topology-v1.json) · [prior D4 7/7 operator evidence](audit/w1.10-d3-d4-mac-1g-2026-10-18.md).

## E1 — Guest resource envelope

E1.1: Read-only `/proc/meminfo`, `/proc/pressure/memory`, `/proc/vmstat`, cgroup v2 `memory.current`, `memory.peak`, `memory.events`, swap, and Node process RSS. E1.2: unisolated **bounded 32MiB** child allocation (~1s), measure minimum guest-wide `MemAvailable`, OOM-kill delta where cgroup v2 is available and headroom (provisional 10% or 64MiB). No root privileges on Mac, no host route edits, no cgroup quota changes. This is **not** full PEF supervised workload stress or a memory-isolated Linux admission benchmark.

- `npm run arm64:e1` executes as a read-only diagnostic on a Linux host.
- `lima.sh e1 r28s-1g` uses `--strict`: refuses results if guest memory/arch do not match the 1GiB profile.
- GitHub ARM64 runner is **NOT 1GiB constrained**, so its reported memory can only be `UNCONSTRAINED_ISA_OBSERVATION`.

## E2 — Bounded offline retention and 72h estimate

E2.1: 72h × 2 events/s **518,400 events**. Illustrative raw payload space 1KiB → ~0.494GiB; 4KiB → ~1.978GiB, both **excluding** event envelope, checksums, journals, indexes, OS and backups. E2.2: two **temporary, cleanup-on-exit** bounded test cases per Lima guest — 2,000 x 1KiB and 1,000 x 4KiB payload, OS `fsync` after each event; measure byte/event, `fsync` append p50/p95/p99, normal reopen latency, process RSS and idempotency. Reject insufficient free space before writing (minimum 256MiB), stop on <128MiB guest free; max experiment 3,000 events and 32MiB journal.

The 72h estimate scales empirical byte/event. **It is a projection, not a successful 72h test.** The current standalone Edge config still caps journal at 100MiB; the test-only E2 journal is 32MiB. Endurance of a purchased microSD is wholly unverified. CI sampled ~0.612GiB projected for 1KiB records from an unconstrained 1,200-event run; only the operator's own 1GiB Lima report can validate that resource envelope.

## E3 — Streaming journal loader improvement

The previous `os-file-journal.load()` read the entire journal into a Buffer, decoded the entire text and split all lines before parsing, creating a memory spike on reopen. E3 now parses fixed **64KiB chunks** using `fs.readSync` and `StringDecoder`, keeping validation checks for signed records, checksum, duplicate, schema, missing newline and fail-closed corrupted tail. New tests stress split multibyte UTF-8 and >100KiB event line. Existing golden traces, disk fault and compaction tests must continue to pass.

**Remaining bound:** the `entries` Map still stores every retained event/payload; ~518,400 events will scale heap size and reopen time. E3 is an incremental mitigation, not a proof of a 72h backlog with 1GiB RAM. Consider indexed on-disk journal + bounded cursor iteration only if further experiments justify it, with compatibility and failure semantics preserved.

## E4 — Networking cost decision (core-only first)

**Provisionally choose** `CORE_BEHIND_EXISTING_ROUTER`: R28S uses one Ethernet link for local services; existing router owns physical upstream/WAN failover, and a future authorized read-only/status adapter can observe it. PEF cannot claim to switch WANs itself unless an actual router integration is developed and tested. **This is a smaller product scope than a stand-alone 2WAN+LAN gateway.**

Vendor R28S: Rockchip RK3528A, 1GiB RAM, **2 GbE**, Wi-Fi 6, microSD and eMMC module option, USB-C for power/eMMC upgrade and debug UART. No assumption of a third USB-host Ethernet link. Alternate network designs (single-WAN gateway, managed-switch/VLAN trunk, WiFi as WAN B, USB NIC) remain blocked or more expensive until physical validation.

Quoted vendor R28S **USD 20** bare board, **USD 15.99** 32GB MicroSD optional, **USD 9** optional metal case = **USD 44.99** subtotal for that selection. PSU, shipping, taxes, duty, endurance-grade media and one-unit checkout are **UNQUOTED**. The R3S-LTS 2GiB variant is USD 57 bare board, excluding storage, PSU and shipping. Do **not** convert USD to EUR or claim a ready PEF under EUR 60. Stock/lead times must be reconfirmed before purchase. Official source: https://www.friendlyelec.com/index.php?path=69&product_id=320&route=product%2Fproduct and https://www.friendlyelec.com/index.php?limit=25&manufacturer_id=8&order=ASC&page=5&product_id=311&route=product%2Fproduct&sort=p.price

## E5 — Fail-closed consolidated virtual decision

E5 checks:
1. Prior D4 **7/7 PASS** for pinned core semantics on constrained ARM64 guest;
2. E1 real 1GiB guest memory headroom **with known cgroup OOM result**;
3. E2 1KiB sample with measured fsync p95, reopen and projection;
4. E2 4KiB sample with measured fsync p95, reopen and projection;
5. E3 both E2 reopen paths explicitly report `STREAMING_64K`;
6. E4 lower-cost `CORE_BEHIND_EXISTING_ROUTER` topology and explicit lack of hardware certification.

When all six pass, status may be **`CORE_ONLY_1GB_VIRTUAL_RESEARCH_COMPLETE`**, *never physical-board or purchase GO*. This is limited to short experiments and independently unverified operator evidence. The dashboard accepts an operator-selected local JSON, without uploading or validating hardware attestations.

## Operator run on Mac M5

Requires the existing `pef-r28s-1g` Lima VM and the prior successful D4 local report.

```bash
cd ~/logistica
git switch main && git pull

# New measurements in the real 1GiB ARM64 Lima VM:
bash scripts/arm64-vm/lima.sh e1 r28s-1g
bash scripts/arm64-vm/lima.sh e2 r28s-1g
bash scripts/arm64-vm/lima.sh e5 r28s-1g
bash scripts/arm64-vm/lima.sh e5-export r28s-1g > /tmp/pef-r28s-e5.json

npm run dashboard
# ARM64 Virtual Lab -> E5 -> select /tmp/pef-r28s-e5.json
```

CLI evidence from the guest is stored under `~/.local/share/pef-arm64-lab/{r28s-1g-e1.json,r28s-1g-e2-1k.json,r28s-1g-e2-4k.json,r28s-1g-e5.json}`. Test files are deleted, not the reports.

## Decision

**R28S 1GiB remains candidate for low-cost Core-only POC, not approved for procurement or 72h offline production.** Next gating risks: on-disk index growth, true workload concurrency, flash endurance, route ownership and verified delivered cost. Keep `device` blocked until physical acceptance.

## CI verification — 2026-10-18

[Run #39135843686](https://github.com/krukmat/logistica/actions/runs/39135843686) **SUCCESS**: ARM64 135/135 passed, emulator 134/135 passed + 1 intended ARM-only skip, netns PASS, prehardware handoff PASS. [Audit](audit/w1.10-e1-e5-2026-10-18.md). Guest 1GiB E1/E2/E5 still requires actual Mac run; unchanged physical gates.
