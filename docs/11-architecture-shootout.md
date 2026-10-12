# 11 — Architecture Shootout v0.1 (W1.8)

**State:** `DESIGN_READY / EXECUTION_BLOCKED`. W1.8.A–D documented; W1.8.E–G cannot be validated without a minimally functional PEF runtime, lab fault-injection drivers and real instrumented candidate hardware. **No vendor hardware chosen and no pricing/benchmark claims.** Inputs: [08 resource gate](08-resource-gate.md), [09 runtime](09-runtime-contract.md), [10 harness](10-benchmark-harness.md); [task plan](tasks/w1.8-shootout-execution.md).

## A — Hard gate before scoring

All candidates must pass:
1. LAN and local Core available with all WAN/Cloud gone (G-CON-03, G-CLOUD-01).
2. P1 durable ACK after real power cut, P0/P1 quotas protected from P2 (G-PER-01/03).
3. Stable device identity, authenticated local API, no insecure remote downgrade; signed config/software recovery (G-SEC/OTA).
4. Workload resource isolation and Network Intent denial for elevated privileges (G-WRK-01/02).
5. Bounded recovery and evidence offline (G-REC/OBS).

A **measured hard-gate failure** rejects the candidate *configuration* until remediation. Unexecuted evidence means **BLOCKED/UNKNOWN**, not PASS. 1 Gbps Base and 2.5 Gbps Pro remain performance MUST-proposed/TARGET respectively and must be measured on declared packet mixes; revisit with ADR if economically infeasible.

## B — Architecture candidates (hypotheses only)

| Candidate class | Potential advantage — HYPOTHESIS | Decisive risk to measure |
|---|---|---|
| ARM router-class | small appliance, low cost/idle energy and potentially fast offloaded routing | RAM/storage for P1, VPN, workloads, signed rollback |
| ARM edge-class SBC | compute and storage expansion, common Core | NIC paths, thermal/idle power, Linux driver support |
| x86 low-power | multi-NIC, storage and flexible runtime | idle energy, cooling, BOM/support |
| Split router + compute | separates dataplane from heavy workloads | two-box cost/support/UPS and loss of local functions during cross-node failures |

No hardware model, OS, secure element, container runtime or exact pricing implied by these classes.

## C — Benchmark methodology

One versioned software Core and fixed test vectors for Core-only, Property Base/Pro and Host H50/H150. All scenarios use the [W1.7 registry](contracts/harness-scenarios-v0.1.json) and evidence schema; compare same 64/512/1500-byte traffic, firewall/overlay settings, WAN carrier-down and upstream blackhole, disk pressure, P1 committed event + physical cut, signed update rollback, remote auth failure and recovery. Record offload, driver/firmware, actual test topology and whether any driver lacks capability. Use wall meter and physical thermal sensor for energy/thermal; emulator/VM is **not** a substitute. Split candidate gets additional injected failure of compute while router remains present and vice versa, with Core ownership spelled out.

## D — Commercial/operational comparison

```text
TCO_year_1 = purchase_BOM + storage + WAN_option + NIC/PSU/UPS
           + installation + licenses + electricity_12mo
           + expected field maintenance and support + spares
Recurring_cost = cloud + telemetry/OTA/security operations
               + support + optional connectivity subscription
```

Distinguish supplied vs external AP/switch/radio/camera energy. Cost of split includes management and repair of **two** nodes. Prices, power watts, lifecycle failure and support costs remain `TBD` until sourced/measured; no scoring from estimates disguised as measurements.

## E — Execution prerequisites / blocker ledger

| Requirement to execute | Current state |
|---|---|
| PEF Core deployment with LOCAL_READY and journal ACK | **BLOCKED — code not yet implemented** |
| WAN/cloud/power/storage workload fault drivers plus restore plan | **BLOCKED — harness specified, not built** |
| At least one instrumented hardware DUT per candidate / justified exclusion | **BLOCKED — hardware not selected or provisioned** |
| Independent wall/thermal and P1 power-cut evidence | **BLOCKED — no physical lab evidence** |
| Raw result dataset and candidate comparison | **NOT_RUN** |

Software-only lab simulations may prepare the system and exercise logical contracts, but do **not** count as physical offload/power/flash/UPS validation.

## F — Scoring policy

First compare hard gates as `PASS/FAIL/BLOCKED`; no winner if any critical gate UNKNOWN. Then normalize measured throughput+headroom, reliability, power/thermal, first-year TCO, support complexity and site installation. **Weights TBD** (product decision after evidence); no zeroing missing numbers or awarding points to speculation. Sensitivity must show boundary between Base 1 Gbps, cost and power, plus Host 7-day journal. Score `TARGET` separately from `MUST`.

## G — Shootout Gate

**Current conclusion:** `DESIGN_READY / EXECUTION_BLOCKED`. No measured winner and no SKU freeze. Next technical dependency is a **software-first PEF Core minimal implementation in an isolated lab**, followed by driver implementation and measured candidates. No third-party platform purchase, infrastructure mutation or deployment authorized by this documentation.

**W1.8 completion evidence needed:** hardware/software revision, raw runs/hashes, PASS of every hard gate, cost/power sources, documented exceptions, and explicit GO/REVISIT/REJECT decision. 
