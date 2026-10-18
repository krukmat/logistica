# W1.10.D ARM64 PEF VM

D1/D2 ARM64 MAC GUEST OPERATOR EVIDENCE PASS (2026-10-16, supplied terminal log), with 1GiB constrained guest and guest-only netns. Actual R28S physical hardware untested; device backend remains BLOCKED. [Evidence audit](audit/w1.10-d1-d2-arm64-mac-2026-10-16.md).

The same src/core/, edge-service, on-disk OS fsync/reopen, and four pinned Golden Traces run in ARM64 Linux; no fork of Product Core. Lima Apple VZ VM on Mac M5 uses four virtual ARM64 CPUs, Debian 13, nominal 1 GiB RAM and 16 GiB virtual disk; it does NOT emulate Rockchip RK3528A/Cortex-A53 clock speed, WiFi drivers or real microSD endurance.

Mac commands (repository under home folder, which Lima mounts read-only):
- brew install lima
- cd ~/logistica
- git switch main && git pull
- bash scripts/arm64-vm/lima.sh create r28s-1g
- bash scripts/arm64-vm/lima.sh run r28s-1g
- bash scripts/arm64-vm/lima.sh stop r28s-1g

Guest installs Debian Node >=20 with apt if necessary, runs npm test, pinned Golden Traces and port conformance, then the new arm64:profile strict mode. VM reports stay on guest virtual disk under ~/.local/share/pef-arm64-lab/. The strict mode refuses to label a guest constrained unless observed memory is within 12 percent of nominal and <=4 vCPUs; resource measurement includes process RSS, CPU and journal disk bytes, but not whole system peak. Experimental 768MiB and 512MiB profiles use separate VMs and may fail during boot/provisioning.

CI ubuntu-24.04-arm runs native ARM64 but is NOT a 1GiB VM, so must return LAB_PASS_PROFILE_NOT_ENFORCED. It verifies ISA compatibility and actual shared Core results, not CPU equivalence with Cortex-A53.

D2.2 guest-only Linux namespaces coupled to shared Core route adapter was operator-reported PASS on 2026-10-16. D3/D4 operator-supplied constrained-1GiB VM comparison was later reported PASS on 2026-10-18; see audit. Physical device validation remains pending. The two native Ethernet ports of the target board cannot be falsely described as physical dual WAN plus LAN without additional interfaces.

D2.2 now provides an ARM64 Linux VM-only adapter, 3 temporary veth logical paths (WAN A, WAN B, LAN), Core-controlled real namespace route writes/readback, failover from WAN A to WAN B, local-only, then recovery. Root operations apply only inside VM namespaces; no host default route changes. Do not confuse three virtual paths with the R28S's two physical Ethernet ports.

Guest network evidence is stored in the VM at ~/.local/share/pef-arm64-lab/r28s-1g-network.json. A green ARM64 CI run does not validate this guest root-scoped test because it deliberately cannot be executed in CI.

## Actual local Mac ARM64 VM run — 2026-10-16

See [operator terminal-log audit](audit/w1.10-d1-d2-arm64-mac-2026-10-16.md). The reported 972 MiB observed guest RAM, Node v20.19.2 ARM64, four pinned traces, 34/34 port conformance, 50/50 receipts across normal close/reopen, process RSS 53.83 MiB, and WAN failover/local-only/recovery are **operator-observed guest evidence**. They do not validate host-wide memory under sustained load, abrupt powercut, physical 2WAN+LAN wiring, real microSD durability or the R28S Rockchip SoC.

## D3 — VM forced stop with an active journal writer (IMPLEMENTED, Mac guest NOT_RUN)

A **new** guest-owned directory d3-r28s-1g on the Lima VM's private disk contains 120 fsync-ACKed O1 receipt records and a synced manifest. The writer process stays alive with the journal **OPEN**. Host launcher checks writer readiness before calling Lima's `stop --force` on the **explicitly named** `pef-r28s-1g` VM, then restarts this VM and verifies recovered receipts, idempotency and conflicting event rejection. No host/default network route writes, Mac root, guest artifact deletion, device backend enable or physical-board claims. **Never run against an existing non-PEF VM.**

```bash
cd ~/logistica
git switch main && git pull
bash scripts/arm64-vm/lima.sh d3-prepare r28s-1g
bash scripts/arm64-vm/lima.sh d3-force-stop r28s-1g
bash scripts/arm64-vm/lima.sh d3-verify r28s-1g
bash scripts/arm64-vm/lima.sh d3-export r28s-1g > /tmp/pef-arm64-d3.json
```

Each phase is explicit; force-stop is **not automatic** during ordinary D1/D2 runs. If the crash test was already prepared, D3 refuses to overwrite its evidence: preserve or rename the guest's directory before a new run. Guest D3 logs are at `~/.local/share/pef-arm64-lab/d3-r28s-1g.log`.

The final report explicitly marks `evidenceOrigin:LIMA_FORCE_STOP_HOST_CLI_SELF_REPORTED` and `physicalPowercutValidated:false`. CI never force-stops a VM. It tests the D3 state/interface guard only. This VM stop exercises guest virtual-disk behavior, not real microSD power interruption, flash cache guarantees or real boot/watchdog/OTA.

## D4 — Bounded load and operator-imported virtual evidence comparison

```bash
cd ~/logistica && git switch main && git pull
# Rerun D1/D2 after updating golden trace digest in the JSON:
bash scripts/arm64-vm/lima.sh run r28s-1g
bash scripts/arm64-vm/lima.sh load r28s-1g
# After D3 prepare → force-stop → verify:
bash scripts/arm64-vm/lima.sh d4-compare r28s-1g
bash scripts/arm64-vm/lima.sh d4-export r28s-1g > /tmp/pef-r28s-1g-comparison.json
npm run dashboard
```

Dashboard → **ARM64 Virtual Hardware Lab** → choose that local comparison JSON. File is loaded in-browser as text (not uploaded to Cloud); the dashboard does not trust reports as device attestation. D4 requires 4 canonical SHA-matching traces, restricted ARM64 guest memory, D3 force-stop operator evidence, WAN state transitions and at least 1000 fsync-acknowledged/retained events. It returns at most `R28S_1GB_CORE_ONLY_PROMISING`, never physical GO. The stress test is a **bounded 2000-event burst**, not a 72-hour retention/storage guarantee. CPU/perf figures reflect Apple ARM64 virtual CPUs, not the R28S SoC.

D4 output remains blocked if any evidence file is missing/inconsistent. Host/local guest import is operator-supplied and unauthenticated. No Mac root, real ISP route writes or purchases.

**CI evidence augmentation:** native Linux ARM64 runner repeats 2,000 receipt fsync/reopen workload and records bounded-process resource figures as `pef-arm64-2k-load-no-memory-cap`. This must not be treated as the 1GiB VM test; rerun `lima.sh load r28s-1g` locally for genuine constrained VM evidence.

## D3/D4 CI closure — 2026-10-16

[Audit](audit/w1.10-d3-d4-virtual-arm64-2026-10-16.md) · [CI SUCCESS #38964168864](https://github.com/krukmat/logistica/actions/runs/38964168864). 123/123 ARM64 tests, D3 process SIGKILL with live journal, 2,000/2,000 D4 synthetic receipts retained. **No Lima force-stop executed on the operator Mac in this change.**

## D3/D4 1 GiB Mac operator comparison — 2026-10-18

[Evidence interpretation and next E phase](audit/w1.10-d3-d4-mac-1g-2026-10-18.md). The supplied D4 summary reports **7/7 PASS** with 972 MiB guest memory, 53.11 MiB Node RSS, 2,000 virtual receipts and 2,302.74 receipts/s on Apple ARM64 virtual CPUs. D3 force-stop recovery is **self-reported** rather than independently attested. This closes the initial D3/D4 *operator laboratory* acceptance only; does not validate full guest memory, 72h offline retention, powercut, hardware, or a complete two-WAN-plus-LAN device.
