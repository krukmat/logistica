# 06 — Resource envelope v0.1 (W1.5)

**Status:** W1.5.A/B DOCUMENTED, **PROVISIONAL / UNMEASURED**; W1.5.C–J TODO. Este es un **contrato de benchmarks por evaluar**, NO una lista certificada de prestaciones o especificaciones físicas ya aprobadas.

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

## W1.5.C–J — Pendiente / inputs y outputs

| Task | Inputs de esta baseline | Entregable / gate |
|---|---|---|
| **C Compute & Memory** | perfiles A + envelopes B | budgets por Core/OS/workload/recovery; min/target/max; p95 utilization y headroom; sin SoC |
| **D Storage** | eventos/s y 72h/7d + clases P0–P3 | reserva Core, tamaños journal, IOPS/fsync, endurance, recovery, quota y presión |
| **E Workload Resource Model** | manifest ejemplo + C/D | schema de requests/limits/admission/isolations; test de rechazo y no-starvation |
| **F Power/Thermal** | C + perfiles Base/Pro | idle/load/peak W, temperatura, throttle, UPS/autonomía y cooling constraints |
| **G Recovery Targets** | fallos W1.2 + B | métricas p50/p95/p99; scopes (WAN, cloud, restart, boot, config, OTA, replay) |
| **H Base vs Pro Matrix** | B–G | min/target/stress consolidado y trade-offs |
| **I Hardware-agnostic Constraints** | H | cpu/RAM/NIC/storage/power thresholds sin nombres de vendors |
| **J Resource Gate** | I + benchmark plan | GO / REVISIT / BLOCKED con supuestos y prioridades explícitos |

### Hipótesis de ingeniería previas de C/F/G, sin elevar a baseline

La discusión preliminar mencionó `CPU normal sostenida <60–70%` y `RAM normal <70–75%` como posibles márgenes. Son ideas no dimensionadas. **No se congelan** hasta W1.5.C. El research original propone failover, intervención remota, OTA y fiabilidad como targets de PoC; éstos no han sido ensayados.

## Política de cambios

Si se descubren incompatibilidades entre `MUST`, coste, potencia y plataforma candidata, **no ocultar la tensión**: abrir decisión en [`07`](07-roadmap-decisions.md), conservar requisito anterior con justificación, proponer nueva prioridad/target y documentar test que resuelve la discrepancia.
