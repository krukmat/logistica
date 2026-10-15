# 25 — W1.10.C2 New Seeed Studio hardware-only screen

**Owner scope 2026-10-15:** **new equipment listed at Seeed Studio only**; **no used/refurbished HP/Dell or products from other vendors** as primary acquisition candidates. Low-cost complete PEF MVP is the goal; the EUR 60 complete-unit target remains a provisional screen, not a purchasing commitment. Hardware not purchased, PEF physically NOT_RUN.

[Machine-readable C2 shortlist](contracts/hardware-shortlist-v1.json) · [C1 driver contract](24-device-integration.md) · [W1.8 physical gates](11-architecture-shootout.md).

## Three Seeed configurations, exact purchasing trap

| Model | Seeed listing | Actual prototype constraint | Core / WAN topology |
|---|---:|---|---|
| **LinkStar H28K-0408**, 4GB RAM, 8GB eMMC, 2x GbE | **USD 39.90** | **Minimum order 50 units** (USD 1,995 product-only); NOT one-unit POC | Best nominal unit-cost design lead. Only QWRT OS documented; Node >=20 NOT_VERIFIED, 8GB eMMC below preferred storage, 2 Ethernet not full 2WAN+LAN |
| **Seeed CM4 dual-GbE carrier + Raspberry Pi CM4 Lite 2GB** | **USD 45.00 carrier + USD 62.50 module = USD 107.50 minimum known parts** | No storage, PSU, case, VAT or shipping; CM4 warehouse backorders conditionally MOQ 250 | Carrier only is not a compute device. Linux/OpenWrt possible, Node and actual PEF installation NOT_RUN |
| **LinkStar H68K-0232**, 2GB, 32GB eMMC, 4x GbE | **USD 99.00** | **Out of stock** | Four Ethernet ports and larger onboard storage provide a more natural complete gateway topology, but over price goal and no unit available |

**Official Seeed sources and constraints:**
- [LinkStar H28K-0408](https://www.seeedstudio.com/LinkStar-H28K-0408-p-5849.html): 39.90 USD, *minimum purchase quantity 50 pcs*; [H28K QWRT/TF/eMMC installation wiki](https://wiki.seeedstudio.com/es/H28K-install-system/).
- [Dual Gigabit Carrier Board for CM4](https://www.seeedstudio.com/Rapberry-Pi-CM4-Dual-GbE-Carrier-Board-p-4874.html): USD 45, **carrier only**.
- [CM4 2GB Lite](https://www.seeedstudio.com/Raspberry-Pi-Compute-Module-CM4102000-p-4718.html): USD 62.50; the Seeed listing warns China-warehouse **backorders** under 250 pieces are cancelled. Stock/source warehouse needs checkout verification.
- [LinkStar H68K 2GB](https://www.seeedstudio.com/LinkStar-H68K-0232-p-5499.html): USD 99 and OUT OF STOCK.
- [reRouter CM4 complete 2GB/32GB](https://www.seeedstudio.com/reRouter-CM4102032-p-5734.html): USD 206.50 in stock, **excluded** because high cost.
- [ODYSSEY STM32MP135D+eMMC](https://www.seeedstudio.com/tag/SBC.html): as low as USD 39.99, but 4Gb/512MB DRAM and embedded Cortex-A7 Linux ecosystem are not suitable assumptions for today's PEF Node runtime; **excluded from Node Core shortlist**.

### Decision

**No verified Seeed configuration currently meets all of: NEW + directly orderable ONE UNIT + complete runnable PEF hardware + EUR 60 landed.** This is an explicit **commercial/engineering blocker**, not a failure of the software Core.

**Best low-cost design lead:** H28K if Seeed supplies a **single evaluation unit** or removes the 50-unit minimum. Verify Node >=20 on QWRT/alternative signed Linux image, P1 journal on eMMC/TF, a third NIC if routing two WAN+LAN, and the real delivered quote *before* treating it as selected. An order for 50 boards is neither affordable for an MVP nor authorized.

**One-unit alternative from Seeed:** CM4 carrier plus module exists as separately priced parts, but is already **USD 107.50** before microSD, PSU and enclosure. It must **not** be marketed as a USD 45 PEF or a sub-60 EUR finished unit.

## Screening code and visual proof

`npm run device:candidates` produces three reports and `SEEED_SINGLE_UNIT_SEARCH_BLOCKED` alongside `LAB_PASS_PHYSICAL_BLOCKED` for only the software host journal observations. `src/runtime/hardware-screening.js` requires `condition:NEW`, `manufacturer:Seeed Studio`, source URL on Seeed, explicitly verified single-unit availability and same currency as the EUR landed budget before eligibility. **No numeric comparison USD→EUR** or automatic claim that board price covers an entire system.

```bash
git switch main && git pull
npm test
npm run device:candidates
npm run dashboard
# Laboratorio integrado → Evaluar candidatos y observaciones
```

The C2 tool does **not** enable `device`; PEF route and receipt Core tests remain software-only. Hardware must separately prove kernel driver, journal powercut durability, trust/PKI, CPU and I/O performance and BOM/TCO using [W1.8](11-architecture-shootout.md). No root processes, host route changes, purchasing or physical provisioning.

**Next meaningful action:** obtain confirmation from Seeed of a one-unit H28K engineering sample and Linux/Node compatibility. If not possible, revisit the strict Seeed-only sourcing constraint or budget rather than pretend there is a qualifying new PEF device at EUR 60.
