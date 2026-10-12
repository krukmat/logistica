# 06 — Resource envelope v0.1 (W1.5)

**Status:** W1.5.A/B and W1.5.C DOCUMENTED, **PROVISIONAL / UNMEASURED**; W1.5.D–J TODO. Este es un **contrato de benchmarks por evaluar**, NO una lista certificada de prestaciones o especificaciones físicas ya aprobadas.

## Convención de etiquetas

- `MUST (propuesto)`: umbral candidato a gate técnico; pendiente de validar coste, energía y capacidad.
- `TARGET`: prestación aspiracional; sirve para comparar soluciones, no bloquear PoC automáticamente.
- `STRESS`: carga que explora el límite; no equivale a soporte comercial.
- `TBD`: no decidido; agente no debe sustituir por valores inventados.
- **Duda importante:** los targets `1 Gbps` NAT/firewall Base, múltiples WAN físicas, failover p95 y bajo consumo deben evaluarse **juntos** en W1.8; pueden forzar trade-offs y deben reabrirse con evidencia si no son económicamente viables.

## W1.5.A — Workload profiles (synthetic scenarios)

| Perfil de prueba | Core-only | Property Base | Property Pro | Host |
|---|---:|---:|---:|---:|
| WAN monitorizadas simultáneas | 2 | 2 | 2–3 | 2–3 |
| Endpoints/clientes | 5 simulados | 20–50 | 50–100 | H50 / H100 / H150; **250 stress** |
| VLAN/redes lógicas | 1–2 | 2–4 | 4–8 | 6–16 |
| Workloads simultáneos | 1 test | 1–3 ligeros | 3–8 mixtos | 4–12 mixtos |
| NVR | no | excluido del baseline | opcional | opcional |
| Cloud dependency | ninguna para Core/local | ninguna | ninguna | ninguna |

**Core-only:** referencia para tests de fallo sin vertical. **Property Base:** energía/coste mínimos. **Property Pro:** NVR/storage opcional, más compute. **Host:** segmentación, alta concurrencia y network traffic; H50/H100/H150 son escalones de test, no SKUs.

### Tráfico de eventos sintético (para test, NO de campo)

| Perfil | Eventos/s sostenidos | Burst eventos/s |
|---|---:|---:|
| Core-only | 0.5 | 10 |
| Property Base | 2 | 20 |
| Property Pro | 10 | 100 |
| Host | 20 | 200 |

**Offline backlog:** `MUST propuesto ≥72 h` a carga normal; `TARGET ≥7 días`. El **servicio local** puede seguir por tiempo indefinido *condicionado* a recursos disponibles; **la retención del backlog no es infinita**. Bajo presión aplica cuota y backpressure sin ACK falso.

**Punto de atención para W1.5.D:** `storage_bytes ≈ sustained_events_per_second × offline_seconds × persisted_bytes_per_event × overhead_factor`. Por ejemplo Host a 20 eventos/s durante 7 días produce **12.096.000 eventos**, *antes* de considerar tamaño de evento, índices, evidencia y compresión. No deducir GB hasta medir forma del payload y write amplification.

### Failure workload por perfil

Repetir cuando aplique: WAN principal caída; WAN link-up pero degradada; WAN flapping; ninguna WAN; cloud inaccesible; workload kill/crash loop; CPU pressure; disk-full; reboot/power-cut; config rollback; OTA interrumpida. Casos y evidencia en [`04`](04-failure-offline-contract.md).

## W1.5.B — Networking envelope propuesto

| Recurso | Base MUST propuesto | Base TARGET | Pro MUST propuesto | Pro TARGET | STRESS / nota |
|---|---:|---:|---:|---:|---|
| WAN monitorizadas simultáneamente | 2 | 3 definidas | 3 | 4 definidas | NICs/radios no equivalen a logical transports |
| Routed/NAT + firewall throughput | 1 Gbps | ~1 Gbps sostenido | 1 Gbps | 2.5 Gbps | definir tráfico/paquete y offload en W1.7 |
| Secure overlay throughput | 100 Mbps | 250 Mbps | 250 Mbps | 500 Mbps | Base 500 Mbps stress; Pro 1 Gbps stress |
| Endpoints activos | 50 | 75 | 150 | 250 | 300 stress |
| Conntrack entries simultáneas | 8k | 16k | 32k | 64k | medir memoria y límite real |
| VLAN/redes lógicas | 4 | 8 | 8 | 16 | 32 stress Pro |
| DHCP leases | 64 | 128 | 256 | ≥256 | 512 stress Pro |
| Local DNS QPS burst | TBD | 100 | TBD | 250 | no implica DNS sustained QPS |
| Active workload network intents | TBD | 16 | TBD | 64 | unit/per-intent semantics pendientes |
| Failover WAN p95 | <10 s | <5 s | <10 s | <5 s | objetivo del research: <10 s; condiciones por fijar |

**El «1 Gbps» de Routed/NAT + firewall y «<10 s» son thresholds propuestos, NO resultados.** El reporte fuente plantea `<10 s normal, medir p95`; el refinement conversacional propuso <10 s p95 MUST y <5 s p95 target, una restricción más fuerte que aún debe someterse a trade-off de precio/reliability.

### Capacidad y semántica mínima a medir

- **WAN:** probes de link, gateway, external reachability, RTT, loss; `HEALTHY/DEGRADED/FAILED/RECOVERING`. Selección que considere prioridad/coste/metered; no suponer `carrier-up` = Internet.
- **Failover/failback:** latencia de detección vs conmutación; health probes y hysteresis; failback sólo tras ventana estable. No bonding ni seamless transport migration garantizados; las sesiones existentes pueden interrumpirse y reconectar según protocolo.
- **Routing:** throughput (p50/p95), packets/sec, NAT/firewall cost, software/hardware acceleration, carga CPU, memory pressure, RTT bajo carga, carga mixta LAN↔WAN.
- **Concurrencia:** active conntrack, DHCP leases, DNS burst, VLANs, acceso LAN/guest y ACLs bajo tráfico WAN.
- **Overlay:** administración/site access selectivo; no se presupone full-tunnel de toda la Internet ni reemplazo de WAN física.
- **Network Intents:** número activo + policy application latency + rechazo privilege escalation, no feature completa de captive portal o QoS.

### Vacíos deliberados que W1.7 deberá cerrar

- Traffic mix: tamaño de paquetes (64/512/1500 bytes), TCP/UDP, new flows/s vs concurrent, TLS overhead, NAT on/off, firewall policy set, offloading y criterio fair compare.
- WAN failover: definición `t0` (link failure o degradación), cuándo se considera restaurado servicio (`t1`), número de corridas, falsos positivos y path de DNS.
- VPN/overlay: cifrado y protocolo concreto (WireGuard es candidato, no selección), clientes concurrentes, CPU/latencia a caudal.
- Al menos una prueba con fallo upstream **sin link-down** y otra con recuperación/flapping.

## W1.5.C — Compute & Memory Envelope (design budget, unmeasured)

**Status:** DOCUMENTED-PROVISIONAL; **NOT VALIDATED**. Execution breakdown: [tasks/W1.5](tasks/w1.5-resource-execution.md). No CPU type, RAM SKU, kernel, accelerator or OS selected. This section supplies **test-fixture assumptions**, not claimed production hardware requirements.

### C1 — CPU load accounting

- Distinguish the **dataplane** (NIC/driver, IRQ/softirq, NAT/firewall, optional offload) from Core control (Supervisor, journal, WAN health, Trust/Recovery) and workloads. Cloud sync is bursty and *not* required during `LOCAL_ONLY`.
- For Ethernet line-rate approximation: `pps = link_bit_rate / (8 × (L2_frame_bytes + 20))`, where 20 B accounts for preamble/SFD + inter-frame gap. At **1 Gbps**, illustrative packet rates are **~1.488 Mpps at 64 B**, **~235 kpps at 512 B**, **~82 kpps at 1500 B**; at 2.5 Gbps multiply by 2.5. These are theoretical link-load cases, **not** CPU performance requirements or achieved throughput.
- Measured CPU demand will be `total_cpu_core_equivalents = CPU_nanoseconds_consumed_per_second / 1e9`. Collect overall CPU as well as user/system/softirq, per-core utilization, packet drops and interrupt concentration. `core-equivalents` describe *measured demand*, not interchangeable hardware cores across ISAs.
- Measure at least `idle`, `normal steady`, `WAN routing+firewall`, `overlay`, `journal burst`, `cloud replay`, `workload pressure` and `fault/recovery` modes, with combinations (not just isolated maxima).
- **Headroom hypothesis (not acceptance result):** normal sustained total CPU ≤70% of provisioned capacity; a ≥30% margin should remain available for recovery, telemetry burst and service continuity. Failing this is a sizing signal, **not** licence to silently weaken P0/P1 durability or failover.
- The 1 Gbps Base MUST-proposed from B may be infeasible under small CPU/power budgets without acceleration; compare offload-on/off, packet sizes and VPN separately. **No vCPU/core count is asserted as final hardware specification.**

### C2/C3 — Candidate RAM accounting (MiB)

Each number below is a **planning allowance**, not a measured RSS or guaranteed quota. It includes likely overlap risk (e.g. kernel networking versus userspace daemons), which W1.7 must resolve. **1 GiB = 1024 MiB.**

| Allocation class | Base planning MiB | Pro planning MiB | Need to measure |
|---|---:|---:|---|
| OS/kernel/common services | 384 | 512 | slab, page cache reclaimability, daemons |
| Connectivity / networking incremental | 192 | 384 | conntrack, socket buffers, DNS/DHCP, NIC rings |
| Edge Supervisor | 96 | 128 | config transactions/reconcile buffers |
| Local State + Journal runtime | 96 | 192 | queues, DB cache, replay buffers (not disk) |
| Workload Runtime overhead | 128 | 192 | supervisor/container overhead, if any |
| Trust + Recovery | 96 | 128 | crypto, health, local API/recovery helpers |
| Admitted light/mixed workloads | 512 | 2048 | varies by profile; **NVR heavy excluded** |
| Reserved for recovery/survival | 256 | 512 | **must not be consumed by optional workloads** |
| **Subtotal planning** | **1760 MiB** | **4096 MiB** | arithmetic budget, no benchmark |
| **Capacity if ≥25% left unallocated** | **≥2347 MiB** | **≥5462 MiB** | subtotal / 0.75, rounded up |
| **Initial PoC memory fixture** | **4 GiB** | **8 GiB** | convenience test envelope, not SKU |
| **Negative pressure fixture** | **2 GiB** | **4 GiB** | intentionally constrained; may fail |
| **Heavy NVR exploration** | not Base | 16 GiB fixture candidate | separate resource profile, no video promise |

**Memory distinctions:** `MemAvailable` is diagnostic, not sole admission signal; measure cgroup/current/high/max where available, slab, pinned buffers, reclaim pressure, swap activity and OOM events. Do **not** double count reclaimable cache. Only promote hardware RAM minima after measuring real image/kernel/network workloads and deterministic recovery headroom.

For B's conntrack TARGET values (Base 16k, Pro 64k), **do not extrapolate RAM with a constant per-flow byte count**: kernel version, NAT extensions, timeout mix and slab overhead can change it significantly. Record `bytes_per_flow_observed = (memory_after - memory_before) / added_live_flows` alongside error bars.

### C4 — Survival and admission requirements

1. Memory and CPU protection priority is **P0 identity/known-good → P1 committed journal → Core connectivity/control/recovery → admitted essential local workloads → optional workloads/analytics**. Under pressure shed or rate-limit optional work before losing Core.
2. Workload admission must reserve declared recovery headroom and enforce per-workload memory/CPU limits; a workload's `request` and `limit` are different concepts. Do not overcommit guaranteed memory against Core-critical capacity.
3. When pressure is unavoidable: deny new optional workload, throttle or stop lowest-priority admitted workload, preserve durable ACK semantics and emit local evidence. Never invent a silent successful commit.
4. Core health must remain observable offline throughout the pressure event, including an eventual safe/degraded state rather than endless OOM/reboot cycles.

### C5 — Acceptance / falsification experiments (W1.7/W1.8)

| Trial ID | Profile and stimulus | Observable pass condition | Evidence |
|---|---|---|---|
| C-CPU-01 | Base/Pro packet mix 64/512/1500 B, NAT+firewall, offload on/off | characterize throughput-vs-CPU saturation; report if B MUST is unreachable | pps, throughput, per-core/softirq, drops, RTT |
| C-CPU-02 | Overlay TARGET together with normal journal/workload | authenticated overlay with intact Core and bounded workloads; report achieved target and headroom | CPU distribution, tunnel throughput, latency |
| C-CPU-03 | Link-up upstream WAN loss and cloud outage under load | local LAN/Core unaffected, recovery converges, evidence persists | failover p95, failures, journal records |
| C-MEM-01 | Base 4GiB, Pro 8GiB fixture with steady+burst load | no Core OOM, survival reserve remains available; quantify actual peak/p95 | RSS/cgroups, slab, MemAvailable, OOM |
| C-MEM-02 | constrained Base 2GiB / Pro 4GiB, hostile workload | reject/shed optional workload **before** P0/P1/Core exhaustion | admission verdict, event IDs, recovery proof |
| C-MEM-03 | abrupt reboot after committed journal ACK under memory pressure | committed records survive; P0/P1 boot and safe-mode viable | before/after event hashes, replay and logs |

**Decision triggers:** if a candidate needs >70% sustained CPU or exceeds RAM budget / 25% reserve in normal load, `REVISIT` the allocation/platform. If 1 Gbps targets force unacceptable power/cost, explicitly re-open B/ADR rather than quietly changing them. This is a *design gate*, not evidence that benchmarks passed.

**Inputs to D/E:** storage must bound journal write buffering and P0/P1 reserve; Runtime admission must map memory requests/limits to these budgets. **Open:** OS/kernel choice, process accounting, packet acceleration, swap policy, NVR-specific resource profile, observed peak RAM, actual PoC hardware.


## W1.5.C–J — Implementation roadmap / inputs y outputs

| Task | Inputs de esta baseline | Entregable / gate |
|---|---|---|
| **C Compute & Memory** | perfiles A + envelopes B | **DOCUMENTED PROVISIONAL**: presupuesto CPU/RAM, fixtures de validación y falsificación; pendiente benchmark |
| **D Storage** | eventos/s y 72h/7d + clases P0–P3 | reserva Core, tamaños journal, IOPS/fsync, endurance, recovery, quota y presión |
| **E Workload Resource Model** | manifest ejemplo + C/D | schema de requests/limits/admission/isolations; test de rechazo y no-starvation |
| **F Power/Thermal** | C + perfiles Base/Pro | idle/load/peak W, temperatura, throttle, UPS/autonomía y cooling constraints |
| **G Recovery Targets** | fallos W1.2 + B | métricas p50/p95/p99; scopes (WAN, cloud, restart, boot, config, OTA, replay) |
| **H Base vs Pro Matrix** | B–G | min/target/stress consolidado y trade-offs |
| **I Hardware-agnostic Constraints** | H | cpu/RAM/NIC/storage/power thresholds sin nombres de vendors |
| **J Resource Gate** | I + benchmark plan | GO / REVISIT / BLOCKED con supuestos y prioridades explícitos |

### Hipótesis de ingeniería aún no confirmadas

W1.5.C convierte el posible límite de CPU sostenida (≤70%) y RAM no comprometida (≥25%) en **hipótesis de validación**, no condiciones técnicas ya demostradas. F/G deben fijar metodología de potencia, térmicas y tiempos de recuperación. Ninguna de estas cifras supone una selección o benchmark de SoC.

## Política de cambios

Si se descubren incompatibilidades entre `MUST`, coste, potencia y plataforma candidata, **no ocultar la tensión**: abrir decisión en [`07`](07-roadmap-decisions.md), conservar requisito anterior con justificación, proponer nueva prioridad/target y documentar test que resuelve la discrepancia.
