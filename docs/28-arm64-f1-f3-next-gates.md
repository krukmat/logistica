# 28 — W1.10.F1–F3: 1GiB journal scaling, offline retention and physical BOM

**Date:** 2026-10-18. **Implementation:** on main. **Scope:** virtual ARM64 research, NOT full 72h, NOT a NanoPi device approval.

## F1 — Guarded progressive 100k-event index test

F1.1: Experimental OS-file journal with a 256 MiB ceiling, a real fsync for every O1 event, stage checkpoints, integrity and dedup verification after normal reopen, sampled 1/20 append p95, current process RSS, guest MemAvailable, cgroup OOM-kill and free disk. Does not change the normal 100 MiB standalone Edge config.

F1.2: In a *real constrained* Linux ARM64 Lima VM, the explicit F1 run processes 10,000 then 50,000 then 100,000 total events (1KiB each) across three separate reopen checkpoints. Guardrails: at least 768 MiB starting free disk, retain at least 512 MiB free disk, stop if journal >255 MiB, process RSS >512 MiB, guest available RAM <128 MiB, any observed OOM kill, or elapsed time >20 minutes. Each temporary benchmark directory is removed on exit; checkpoint evidence remains in a separate VM JSON. A guard-triggered F1 STOP is useful evidence and is not counted as PASS.

CI runs **only smoke 100/500/1000**, on runners with substantially more than 1GiB RAM. Native ARM64 CI and the M5 guest are distinct evidence sources, and the guest uses Apple ARM64 virtual CPUs, not the R28S Cortex-A53 clock/performance.

## F2 — Capacity and retention policy (no product config mutation)

F2.1: model 72h at 2 events/s = **518,400 events** using prior fsynced E2 samples for 1KiB and 4KiB payloads. The journal includes metadata and checksums. Illustrative unconstrained ARM64 CI projections: **~0.612GiB** (1KiB) and **~2.095GiB** (4KiB), before the 25% journal headroom and 3GiB conservative whole-device/OS reserve in the model. Do not extrapolate these values to sustained microSD performance, flash write amplification, or linear index memory at 518,400 events.

F2.2: compare projected journal requirement with the hard **100MiB** limit of src/runtime/edge-config.js; the current limit is insufficient at both sample sizes. The model records available F1 stages and rough sampled RSS trend; GC and caching can invalidate a linear RSS inference. It does NOT authorize raising the production journal capacity, selecting a device, or calling 72h offline proven. Any eventual change to the journal index architecture should be separately specified, with compatibility, event dedup, fsync and crash gates.

## F3 — Minimum-complexity sidecar hardware

F3.1: Official FriendlyElec **NanoPi R28S 1GiB** listing [vendor](https://www.friendlyelec.com/index.php?limit=20&manufacturer_id=8&order=DESC&page=4&product_id=320&route=product%2Fproduct&sort=p.price): **$20 bare board**, optional 32GB SanDisk Ultra **+$15.99** and metal case **+$9**. Published subtotal is **$35.99 without case**, **$44.99 with case**. Requires a **5V/2A non-PD USB-C PSU**; shipping, VAT/duty, power supply, cable, endurance-grade SD and reliable delivery to Spain are NOT QUOTED. Vendor listing showed in stock; single-unit checkout with final taxes has NOT been verified. The optional vendor Ultra microSD is NOT endurance-qualified merely by brand.

Alternative [R3S-LTS 2GiB](https://www.friendlyelec.com/index.php?limit=25&manufacturer_id=8&order=ASC&page=5&product_id=311&route=product%2Fproduct&sort=p.price) **$57 bare**, before storage/PSU/tax/shipping. Do not claim a complete ready-to-run device under €60 without a real checkout.

F3.2: Architecture CORE_BEHIND_EXISTING_ROUTER: PEF runs receipts, local logic, journal and sync on the R28S; existing router owns physical WAN-A/WAN-B selection and failover. F3 now has a STRICTLY READ-ONLY observation contract (getStatus only, stale/invalid router observations fail closed) but NO router-specific connector, firmware, credentials, access to external router, or live failover test. Two native Gigabit Ethernet ports on the board **do not** form three physical WAN-A/WAN-B/LAN ports. No USB third NIC is assumed.

## Execute in Mac M5 constrained 1GiB Lima VM

Requires the pre-existing successful E2 result saved inside the VM at ~/.local/share/pef-arm64-lab/r28s-1g-e2-{1k,4k}.json.

```bash
cd ~/logistica
git switch main && git pull

# Full 10k -> 50k -> 100k event test under 1GiB, guarded and explicitly opt-in.
bash scripts/arm64-vm/lima.sh f1 r28s-1g

# 72-hour extrapolation, using F1 and the two earlier E2 samples.
bash scripts/arm64-vm/lima.sh f2 r28s-1g

# Export JSON to the host Mac for review (separate files).
bash scripts/arm64-vm/lima.sh f1-export r28s-1g > /tmp/pef-r28s-f1.json
bash scripts/arm64-vm/lima.sh f2-export r28s-1g > /tmp/pef-r28s-f2.json

npm run dashboard
```

Click **ARM64 Virtual Lab** at top and use the **F1** and **F2** report selectors. These are local unauthenticated input displays, not independent attestation. You may also use jq to see .ok, .status, .stages, .error, .projections and .decision. If F1 fails, preserve its report and do not raise the journal limit or force full retests blindly.

## Outcomes and boundaries

- **F1 code and CI smoke:** tested; *full 100k event F1 under 1GiB is NOT_RUN* until operator executes above commands.
- **F2:** 72h projection and current 100MiB capacity gap modeled. Real 518,400-event replay, 72h persistence, data retention, SD wear, crash under sustained pressure and aggregate workload admission are NOT tested.
- **F3:** official vendor component subtotal and abstract read-only router observer available; landed cost and router-model compatibility are BLOCKED.
- Production physical backend remains BACKEND_NOT_IMPLEMENTED, procurementApproved=false.

Next decision: read the operator F1/F2 JSON and determine whether to redesign on-disk index vs reduce offline expectations, without assuming a purchase is already approved.
