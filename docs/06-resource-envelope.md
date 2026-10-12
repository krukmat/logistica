# 06 — Resource envelope v0.1 (W1.5)

**Status:** W1.5.A–J DOCUMENTED (DESIGN ONLY), **UNMEASURED**; no hardware or software implementation. W1.5.H–J decision/benchmark handoff is [08](08-resource-gate.md). Este es un **contrato de benchmarks por evaluar**, NO una lista certificada de prestaciones o especificaciones físicas ya aprobadas.

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


## W1.5.D — Storage Envelope (D1–D5, provisional y sin pruebas físicas)

**Estado:** DOCUMENTED (contrato y cálculos por escenarios), **EMPIRICAL VALIDATION PENDING**. Subtasks [W1.5.D](tasks/w1.5-resource-execution.md); entradas: [W1.5.A/C](06-resource-envelope.md), [requisitos REQ-STA-01/02/03, REQ-REC-02, REQ-WRK-02, REQ-OBS-01](02-core-requirements.md) y [contrato W1.2](04-failure-offline-contract.md). Este presupuesto no implica un SSD/eMMC concreto, sistema de archivos, base de datos ni tamaño final del hardware.

### D1 — Capacidad de journal y eventos offline

**D1.a — Plan de instrumentación, no ejecutado.** En W1.7 obtener un corpus por perfil (Core-only, Base, Property Pro y Host), con muestras de eventos O0/O1 y O2/O3, incluyendo steady, burst, reconnect y fallos. Para cada tipo medir cantidad de eventos, bytes serializados (`payload + headers`), percentiles p50/p95/p99/máximo, tamaño real almacenado incluyendo índices/WAL/metadata, ocupación antes/después de checkpoint/compactación, bytes físicos escritos, frecuencia de `fsync` y latencia p50/p95/p99 de commit. Muestrear una ventana temporal representativa y, como punto de partida operativo, ≥10.000 registros por perfil cuando existan datos; registrar insuficiencia de muestra, sesgo, serializador y versión. No almacenar PII/credenciales en los artefactos. **No existen muestras reales todavía.**

**D1.b — Modelo calculado** a partir de tasas de eventos sintéticas definidas en W1.5.A. Se modela conservadoramente que todos los eventos de la tasa del perfil requieren persistencia; la clasificación real entre O0/O1/O2/O3 se revisará con el corpus. 72 h = 259.200 s; 7 días = 604.800 s.

```text
events(R,t)                  = R_events_per_second × t_seconds
effective_record_bytes      = serialized_event_bytes + measured_index_and_metadata_bytes
journal_gib                 = events × effective_record_bytes × capacity_factor / 1_073_741_824
physical_write_gib_per_day  = R × 86400 × effective_record_bytes × write_amplification / 1_073_741_824
```

- `capacity_factor` debe incluir el espacio transitorio para WAL/checkpoints/compactación, índices auxiliares y margen de crecimiento **que no esté contabilizado ya** en `effective_record_bytes`. Evitar doble contabilización.
- `write_amplification` es **diferente** de `capacity_factor`: representa bytes escritos al medio físico frente a datos lógicos comprometidos; usarla para **endurance**, no para duplicar tamaño de retención.
- En el ejemplo siguiente se fija `capacity_factor = 1`, `effective_record_bytes = 1 KiB o 4 KiB`, sin reservas P0, filesystem, OTA ni vídeo. **Ambos tamaños son hipótesis sintéticas, no percentiles observados.**

| Perfil | Eventos/s | Eventos 72 h | Eventos 7 d | 72 h @1 KiB (GiB) | 72 h @4 KiB (GiB) | 7 d @1 KiB (GiB) | 7 d @4 KiB (GiB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Core-only | 0.5 | 129.600 | 302.400 | 0.12 | 0.49 | 0.29 | 1.15 |
| Property Base | 2 | 518.400 | 1.209.600 | 0.49 | 1.98 | 1.15 | 4.61 |
| Property Pro | 10 | 2.592.000 | 6.048.000 | 2.47 | 9.89 | 5.77 | 23.07 |
| Host | 20 | 5.184.000 | 12.096.000 | 4.94 | 19.78 | 11.54 | 46.14 |

**Interpretación:** Host a 20 eventos/s y 7 días offline **no cabe dentro de una supuesta reserva de journal de 8–16 GiB** si el tamaño real se acerca a 4 KiB/evento. Aún faltan índices transitorios, P0, OS, rollback, almacenamiento de workloads y margen. La cifra de almacenamiento definitivo queda **TBD** hasta medir payload y estrategia de persistencia. El objetivo de retención `MUST propuesto ≥72 h` y `TARGET ≥7 d` permanece **condicionado al perfil de carga y al tamaño máximo admitido por registro**; debe definirse una política contractual de tamaños y tasas aceptados. Aportar más disco no garantiza disponibilidad ilimitada.

**Escenarios de sensibilidad para W1.7:** variar tamaño persistido p50/p95/p99, ráfaga de 200 eventos/s Host, compactación concurrente, retrasos en cloud ACK, I/O lento y ocupación de P2 por NVR. El `p95` de bytes **por sí solo no** acota matemáticamente todo el backlog: hay que incluir cola pesada, máximos, tamaño contractual y ráfagas.

### D2 — Clases de almacenamiento y reservas de supervivencia

| Dominio lógico | Clase | Incluye | Política bajo presión |
|---|---|---|---|
| Boot/trust/known-good | P0 | device identity reference, configuración válida, selector de software activo/rollback, recovery metadata | proteger, verificar integridad; nunca reemplazar identidad silenciosamente |
| Journal/sync | P1 | eventos comprometidos, ACK/cursor, operaciones durables, evidencia O0/O1 | reserva finita + cuota supervisada; **nunca descartar evento ACKed**; al llenarse rechazar *nuevos* commits con error explícito |
| Vertical workloads | P2 | NVR, PMS/automation caches, historiales no Core | aislamiento por cuota/volumen, throttling o parada; no puede consumir reserva P0/P1 |
| Disposable/telemetry | P3 | logs verbosos, debug, estadísticas reconstruibles O2/O3 | borrar/compactar primero con políticas documentadas |

**Criterios de diseño (technology-neutral):**
1. Separar garantías de espacio de P0/P1 respecto de P2/P3 mediante **particiones/volúmenes/cuotas exigibles** o aislamiento físico equivalente. Las simples carpetas o una quota sin enforcement no son protección suficiente. Implementación W1.6; comprobar adversarialmente en W1.7.
2. No comprometer toda la reserva P1 a backlog normal: mantener un *emergency evidence budget* para O0/O1/metadata y un umbral de high-water que active degradación y backpressure antes de agotarlo. **Cuánto reservar y cuáles son los umbrales: TBD medible**, no asumir capacidad infinita de evidencia.
3. Calcular el disco utilizable como `OS+boot/update/rollback + protected_P0 + journal_P1(72h/7d) + bounded_transient_space + P2_workloads + P3 + free_operational_reserve`. Medir cada sumando y evitar doble conteo.
4. La clave privada o trust root puede residir en hardware seguro u otro almacenamiento protegido: este modelo no selecciona TPM/secure element ni asume que su capacidad de almacenamiento comparte la del journal.
5. OTA/rollback debe conservar **al menos una ruta conocida válida de boot** frente a actualización interrumpida; el dimensionamiento de imagen activa, candidata y fallback depende de la estrategia elegida en W1.6.
6. El journal de eventos P1 no debe alojarse en la misma cuota de NVR, aunque ambos compartan el mismo medio físico. Un fallo físico del propio medio o pérdida de energía más allá de sus garantías queda fuera de una promesa absoluta de cero pérdida; debe declararse límite de fiabilidad.

### D3 — Commit, ACK, backpressure y recuperación

```text
append request
  -> validate identity/class, event_id, limits and remaining reserved capacity
  -> append into durable transactional store / WAL
  -> guarantee commit according to chosen sync/write-barrier semantics
  -> ACK committed (and only then tell caller the event is durable)
  -> when connected: replay ordered pending batches (at-least-once)
  -> cloud durable-ingestion ACK -> atomically advance local cursor
  -> prune only records eligible after ACK and applicable retention
```

- `Journal.Append` puede usar **group commit**, pero sólo devuelve ACK de los registros cuya durabilidad ya está confirmada; nunca ACK sólo por buffer de proceso, page cache sin barrera comprobada o envío de red.
- Si se pierde alimentación **antes** de ACK, el evento puede existir o no tras reboot: reintento seguro exige `event_id` estable y deduplicación. Si el corte ocurre **después** de ACK, debe permanecer. Persistencia física real sujeta a controlador, firmware, barreras/flush y medio probado.
- Reenvío **at-least-once + ingestion idempotente** es propuesta de contrato: un replay duplicado no debe duplicar efectos; transacciones cloud/cursor y semántica exacta se confirman en `OPEN-SYNC-01`, W1.6. No anunciar exactly-once.
- Proteger cursores y metadatos de recuperación como transacciones durables; si cloud ACK es dudoso, **no avanzar** cursor. Eliminar/compactar registros sólo después de cumplir ACK remoto y política local de retención O0/O1.
- Estados de presión: `NORMAL → PRESSURE → P1_WRITE_RESTRICTED → SAFE_DEGRADED`. Recuperar con histéresis y evidencia. Acciones: purgar O3/P3, agregar O2, limitar/quitar P2, preservar O0/O1 y P0/P1; rechazar nuevas escrituras P1 antes de ACK con error `STORAGE_FULL_OR_UNSAFE`, permitir reintento y visibilizar backlog no aceptado. Si la capa de storage no puede garantizar la durabilidad, deshabilitar funciones que la requieran, **sin bloquear arbitrariamente LAN/DHCP/DNS**.
- Diferenciar `Core local operativo` de `todos los workloads con capacidad de escritura`. Un sistema offline indefinidamente y un journal finito **no pueden** aceptar una tasa positiva e ilimitada de eventos P1 sin pérdida: debe haber backpressure/degradación o expansión.

#### D3 — Matriz de pruebas requerida (W1.7)

| Test | Estímulo | Evidencia mínima de aceptación |
|---|---|---|
| D-PER-01 / G-PER-01 | corte abrupto **después** de ACK P1 | evento y hash presentes tras reboot; identidad/config intactas |
| D-PER-02 | corte **antes** de ACK P1 | caller distingue estado incierto; `event_id` permite replay/idempotencia |
| D-PER-03 / G-OBS-03 | journal casi lleno y cloud offline | high-water, error explícito antes de promesa de durabilidad, O0/O1 protegidas |
| D-PER-04 / G-PER-03 | workload Host/NVR consume toda su P2 | P0/P1 no afectados; operación LAN/Core recuperable |
| D-PER-05 / G-PER-04 | corromper P2 | fallo aislado; Core intacto |
| D-PER-06 | corrupción P1 / read-only filesystem / media I/O error | evidencia diagnóstica si aún escribible; safe mode y ninguna falsa confirmación |
| D-SYN-01 / G-CLOUD-02 | crash/reboot entre cloud ACK y persistir cursor | duplicación tolerada, ningún evento P1 perdido ni doble efecto en cloud |
| D-OTA-01 / G-OTA-01 | corte durante staging/boot de nueva imagen | fallback boot válido y known-good accesible |
| D-END-01 | steady/burst 72h simuladas + cloud replay/compactación | tamaño real, write amp, IOPS, sync latency p95/p99, backlog drain sin starvation |

**Método obligatorio:** registrar `scenario_id, profile, event_schema, payload_size_distribution, event_rate, retention_window, OS/kernel/filesystem/storage_model, flush_policy, phase, event_ids/hashes, p95/p99 latency, bytes_written, power_cut_timing, result`. Ninguno de estos tests se ha ejecutado ni puede declararse PASS en esta task documental.

### D4 — Endurance, IOPS y lifecycle del medio

- **Escrituras del journal:** `physical_write_gib/day = event_rate × 86400 × effective_record_bytes × observed_write_amp / 2^30` (añadir actualizaciones de P0/OS/logs/OTA/replay y workloads, especialmente NVR). `observed_write_amp` se obtiene de instrumentación, **no** del tamaño de la imagen del SO.
- Ejemplo exclusivamente de sensibilidad: Host, `20 eventos/s × 1 KiB efectivos × write_amp hipotética 3` ≈ **4.94 GiB físicos/día del journal**; ≈ **1.76 TiB/año**, antes de otros escritores. No extrapolar esto a TBW certificada ni a NVR.
- **Rendimiento:** medir latencia durable de commits individuales y por lote (p50/p95/p99), burst sostenido, checkpoints, compaction, IOPS aleatorias, read amplification, backlog replay y efectos de latencia/concurrencia sobre LAN/Recovery.
- **Endurance:** comparar bytes totales escritos por año y vida útil requerida frente a especificaciones reales de TBW/DWPD (una vez elegido medio), con margen, temperaturas, wear level y power-loss characteristics. No extrapolar desgaste de flash del simple volumen lógico. 
- **Rollback y mantenimiento:** incluir tamaño de dos estados recuperables, staging/firmware, space reclamation y estrategia para reemplazar migrar la unidad sin regenerar identidad. Estrategia tecnológica se decide W1.6.

### D5 — Gate de dimensionamiento

| Gate de diseño | Resultado W1.5.D | Qué falta para validar |
|---|---|---|
| Formula volumétrica 72h/7d trazable por perfil | **DOCUMENTED** | distribución real de tamaños + amplificación |
| Base/Pro capacity specification definitiva | **TBD** | medir eventos, OS, runtime, fallback y workload datasets |
| Protección P0/P1 versus P2/P3 | **DEFINED** | prueba de cuotas/particiones ante fill y corrupción |
| Durable ACK + idempotencia + cursor seguro | **DEFINED** | test de power-cut y failover entre ACK y cursor |
| Retención sin cloud y high-water/backpressure | **DEFINED** | stress prolongado con backlog y carga mixta |
| SSD/eMMC endurance y elección física | **TBD** | medición de writes, thermal, TBW y hardware shootout |

**Decisión:** `GO_TO_W1.5.E (DESIGN ONLY)` con reservas explícitas; **NO GO para capacidad de disco comercial o elección de medio**. No hay tamaños mínimos de hardware certificados. El riesgo dominante es Host siete días offline con eventos mayores a 1 KiB, junto con la reserva para rollback y workloads. La validación física pertenece a W1.7/W1.8.

**Requisitos impactados (sin cambio de prioridad):** `REQ-STA-01` (ACK durable), `REQ-STA-02` (bounded backlog/quota/backpressure), `REQ-STA-03` (P0/P1 protection), `REQ-REC-02` (known-good software recovery), `REQ-WRK-02` (workload storage admission), `REQ-OBS-01` (O0/O1 evidence). **Sin sextos componentes ni dependencia cloud.**


## W1.5.E — Workload Resource Model (E1–E4)

**Status: DOCUMENTED / UNIMPLEMENTED / UNVALIDATED.** Dependencias [C CPU/RAM](06-resource-envelope.md), [D storage](06-resource-envelope.md), [Workload Contract](05-overlays-workload-contract.md). Referencia de contrato versionable: [JSON Schema](contracts/workload-manifest-v0.1.schema.json), [ejemplo](contracts/workload-manifest-base.example.json). El esquema permite revisar manifests, **no implementa** aislamiento por sí solo.

### E1 — Declaración de recursos y capacidades

Cada módulo debe declarar `workload_id`, `manifest_version`, `connectivity_mode`, prioridad `essential|optional`, `cpu_request/limit_millicores`, `memory_request/limit_mib`, `storage_request/limit_mib`, clase de datos P2/P3, intents de red permitidos, health contract y política de restart **acotada**. Requests siempre ≤ limits; requests son reserva/admission, limits son techo de ejecución, nunca una garantía de rendimiento sin cgroups/runtime real. Configuración, secrets y principal de identidad pertenecen al runtime/Trust; **no** incluir claves privadas en el manifest.

- `LOCAL_ONLY_CAPABLE`: workload funciona localmente sin WAN ni Cloud; **no implica** que sus integraciones remotas funcionen.
- `INTERNET_OPTIONAL`: mantiene función degradada local, pero no se certifica funcionalidad completa.
- `INTERNET_REQUIRED`: no sirve para prometer continuidad local durante all-WAN outage.
- `essential` es una etiqueta de admisión/prioridad, **no** licencia para reservar CPU/RAM o P1 por encima de Core; la evaluación de función crítica requiere evidencia y puede fallar. No elevar datos del workload a P0/P1 implícitamente.

**Network Intent** sólo expresa capacidades limitadas a revisión: `local_service_discovery`, `egress`, `isolated_network`, `local_service_publish`; contiene `scope`, `destination_class` cuando aplica y `justification`. El modelo no acepta comandos shell, reglas raw firewall, bind host arbitrario ni escrituras a Trust/Journal. Supervisor autoriza y Connectivity aplica la intención bajo la política del sitio; Runtime actúa de intermediario. Las categorías de destino y políticas concretas quedan en W1.6.

### E2 — Admission control / accounting

```text
REGISTER → SCHEMA_VALIDATION → TRUST/POLICY_VALIDATION
         → RESOURCE_FIT (CPU, RAM, P2 storage, intents, reserve)
         → ADMIT | REJECT(reason)
ADMIT → START → HEALTHY | DEGRADED | FAILED
FAILED → BOUNDED_RESTART | ISOLATE; no Core dependency on workload
```

Para el **perfil PoC de prueba**, calcular:

```text
available_workload_memory_mib
  = physical_memory_mib − observed_OS_and_Core_peak_mib
    − recovery_reserve_mib − extra_unallocated_headroom_mib
required_mib = Σ admitted_memory_requests_mib + proposed_memory_request_mib
ADMIT iff required_mib ≤ available_workload_memory_mib
```

La misma disciplina se aplica a storage P2 (enforcement por volumen/cuota) y CPU requests, además de revisar que los limits individuales no superen política. **No sumar dos veces** recovery reserve y la reserva libre si ésta ya la incluye el modelo W1.5.C; los presupuestos Base 4 GiB / Pro 8 GiB son fixtures, no compromisos de SKU. Bajo presión real puede degradar workloads admitidos; `ADMIT` no promete ausencia de throttling. Los números de `available_` sólo son verificables tras instrumentación de SO/runtime.

Causas explícitas de rechazo: `INVALID_MANIFEST`, `UNTRUSTED_WORKLOAD`, `INSUFFICIENT_CPU`, `INSUFFICIENT_MEMORY`, `INSUFFICIENT_P2_STORAGE`, `NETWORK_INTENT_DENIED`, `CORE_RESERVE_AT_RISK`, `INCOMPATIBLE_RUNTIME`. Registrar decisión y `correlation_id` en journal (sin aceptar nuevas escrituras si P1 ya no admite ACK).

### E3 — Aislamiento, presión y degraded mode

1. P0 (identidad/known-good), P1 (journal/commits), control local y recovery nunca comparten cuota writable sin protección exigible con workload P2/P3.
2. Una carga opcional que supera `memory_limit`, CPU o I/O se regula, reinicia acotadamente o aísla; si supera `storage_limit`, las escrituras se rechazan dentro de su cuota P2. Nunca pasar datos de vídeo/debug al journal crítico por defecto.
3. `PRESSURE` → denegar nuevas admissions → frenar opcionales → aislar offender → preservar Core local + evidencias P1 si aún se pueden confirmar; si P1 está al límite, **backpressure honesta** y operación local degradada.
4. Recovery ejecuta escalación tras crash-loop bounded con backoff; workloads no pueden impedir rollback, safe mode ni local recovery API autenticada.
5. Workload `essential` con presión se notifica y puede degradarse: proteger supervivencia Core no implica garantía absoluta de servicio opcional o dependiente de Internet.

### E4 — Contract test design (W1.7, NOT RUN)

| Gate | Fixture | PASS observable |
|---|---|---|
| E-01/G-WRK-02 | manifest Base light válido; RAM/CPU/P2 bajo presupuesto | admit, health y límites visibles |
| E-02/G-WRK-02 | manifest NVR/Host sobre RAM o P2 disponible | REJECT code, Core y P0/P1 siguen |
| E-03/G-WRK-01 | workload pide raw routing/firewall/keys o intent no autorizado | deny sin modificación de política ni identidad |
| E-04/G-SW-01/02 | CPU hog, OOM, disk-fill, crash loop | aislamiento/backoff bounded; LAN/Core observable |
| E-05/G-CON-03 | workload local-only, WAN/cloud desconectados | función local certificada continúa |
| E-06/G-PER-03 | journal casi lleno + workload productor de eventos | sin ACK falso, backpressure y prioridad evidenciada |

**Design DoD:** schema + ejemplo concretos, reason codes, lifecycle, budgets y tests especificados. **No se han ejecutado implementaciones/test engines**; enforcement y timings permanecen TBD (W1.6/1.7).


## W1.5.F — Power & Thermal Envelope (F1–F4)

**Status: DOCUMENTED / UNMEASURED.** Depende de recursos C/D/E. No se asignan watts arbitrarios ni se asegura fanless/UPS; separar perfiles **Base low cost/power** y **Pro capacity/support**, no elegir SKU.

### F1 — Modelo de potencia a medir

```text
P_at_wall = P_appliance_board + P_internal_storage + P_internal_WAN_interfaces
            + P_power_conversion_loss (+ P_integrated_radio_if_present)
E_24h_Wh = sum_over_modes(P_mode_W × duration_mode_h)
E_month_kWh = E_24h_Wh × days / 1000
```

Registrar si adaptador de pared está incluido. **Excluir y mostrar aparte** APs, switches, cámaras PoE, antenas/modems externos, NVR externo y UPS; mezclar estos consumos falsearía comparaciones Base/Pro. Los periféricos sí cuentan para dimensionar **UPS de sitio completo** si se les promete continuidad.

| Profile/mode | Idle W | Steady routing W | VPN+journal W | Peak/recovery W |
|---|---|---|---|---|
| Core-only | TBD | TBD | TBD | TBD |
| Property Base | TBD | TBD | TBD | TBD |
| Property Pro | TBD | TBD | TBD | TBD |
| Host | TBD | TBD | TBD | TBD |

Para cada modo: measured wall power `avg,p95,peak`, energía Wh, CPU frequency, NIC link rates, disco/módem conectado, firmware/kernel, temperatura ambiente y ruido cuando relevante. Promesa de bajo consumo sólo después de datos.

### F2 — Thermal/cooling constraints

- Definir antes de benchmark rango de temperatura ambiente de instalación y ventilación (TBD por segmento/sitio); medir temperaturas SoC, SSD, modem, NIC y caja externa.
- Test con carga conjunta: routing/firewall (packet size mix), overlay, journal burst/compactación y workloads admitidos, no sólo pruebas aisladas.
- Registrar throttling, pérdida de throughput, fallos de fsync, fallo por sobretemperatura y recuperación bajo ambiente elevado.
- `Fanless` es una **preferencia Property**, no requisito congelado; ventilación/ventilador pueden ser necesarios en Pro.

### F3 — Resilience eléctrica / UPS

```text
effective_backup_Wh = UPS_nominal_Wh × observed_usable_fraction
runtime_h = effective_backup_Wh / measured_average_supported_load_W
```

La fracción usable depende de descarga, conversión, aging, temperatura y corte/traspaso; no asumir 100%. Fijar luego target de autonomía por caso de uso; **no** prometer LAN/automations cuando switch, AP, cámaras o actuadores externos carecen de energía. Power-loss sudden (sin UPS) debe mantener garantías de P0/P1 ACK conforme a D/W1.2, condicionado a hardware real.

### F4 — Tests requeridos (W1.7/W1.8, NO RUN)

| Test | Escenario | Evidencia / regla |
|---|---|---|
| F-PWR-01 | 24h simuladas/medidas por perfil con WAN y journaling real | idle/avg/p95/peak W; Wh y fuentes incluidas |
| F-PWR-02 | sustained 1Gbps Base / 2.5Gbps target Pro, overlay, pressure | saturación, watts/throughput, failure rate; registrar incompatibilidades |
| F-THM-01 | carga conjunta en ambiente representativo y elevado | throttling, temperature/time, servicio degradado, recuperación |
| F-UPS-01 | brownout/corte+reconexión, opcional UPS validada | ACK P1 tras reboot, boot path válido; presupuesto completo de dependencias locales |

**Design DoD:** magnitudes y método contrastable; tablas TBD explícitas; retorno a W1.5.B/C si el consumo/thermal invalida el target. La validación necesita hardware y medición; no está completada.


## W1.5.G — Recovery Performance Targets (G1–G4)

**Status: DOCUMENTED / UNMEASURED.** Se mantienen [W1.2 acceptance gates](04-failure-offline-contract.md) y los **únicos** tiempos candidatos previamente acordados: WAN failover **<10 s p95 MUST propuesto, <5 s p95 TARGET**. Ningún otro valor temporal puede afirmarse como alcanzado ni inventarse.

### G1 — Clock and scenario model

Registrar ambos relojes: UTC (trazabilidad) y monotonic (duraciones), `scenario_id`, `correlation_id`, `t0_fault_injected`, `t_detected`, `t_action_started`, `t_service_restored`, `t_stable`, `t_cloud_synced` si procede. Distinguir:

- `WAN_LINK_DOWN` y `UPSTREAM_BLACKHOLE_CARRIER_UP`; outage cloud solo vs all-WAN; no combinar distribuciones.
- En failover: `t0` = pérdida real inducida (confirmada por harness), `t1` = **primera conexión nueva útil** por WAN alternativa y acceso LAN requerido; **no** prometer preservación de sesiones TCP existentes (sin bonding/seamless migration).
- En failback: `t0` = WAN primaria vuelve detectable; `t1` = conmutación estable tras ventana configurable; minimizar falsos positivos tiene prioridad sobre tiempo mínimo.
- En boot: inicio observable de energía/boot → local Core ready **sin necesidad de cloud**. Para reboot/recovery distinguir warm/cold/powercut.
- En journal replay: medir `pending_events`, tasa de ACK confirmado y tiempo hasta cursor actualizado, con nuevos eventos concurrentes.

### G2 — Matriz de tiempos candidatos

| Operation | Proposed MUST | Proposed TARGET | Distribution & caveat |
|---|---|---|---|
| WAN failover normal | **p95 <10 s** | **p95 <5 s** | medir separado link-down y carrier-up blackhole; estado de conexión nueva |
| WAN failback stable | bounded / policy-controlled | TBD | estabilidad mínima, false flips y sesiones; jamás fastest wins |
| Workload restart/recovery | bounded retries, health pass | TBD p50/p95 | esencial/optional por separado |
| Core boot to local-ready | local-first, cloud independent | TBD p50/p95 | hardware-specific; report cold/warm |
| Cloud reconnect/auth | eventual success with backoff | TBD p95 | excluye caída persistente del proveedor |
| Journal replay | no committed event lost / cursor idempotent | TBD events/s, drain time | backpressure y backlog concurrente |
| Config rollback | known-good restored and verified | TBD p95 | no failure-induced lockout local |
| Software rollback | valid boot path, signature verified | TBD p95 | depende de update mechanism |
| Crash-loop/isolation | finite attempts/no infinite loop | TBD max attempts/time | no starvation de LAN/Core |

**S3 safety:** un test rápido que destruye P1, omite autenticación o entra en bucle **FAIL**, aunque cumpla latencia.

### G3 — Reliability, sampling and acceptance

- Para diseño exploratorio **≥30** corridas por escenario independiente; para evaluar p95 con mínima estabilidad, **≥100** (aumentar según varianza y confianza requerida); p99 con pocas corridas se reporta como **exploratorio**, no gate estadísticamente defendible. Protocolo final y CIs W1.7.
- Mantener raw samples, errores, censura/timeouts, runs fallidas, firmware/hardware y carga concomitante. No excluir automáticamente fallos de timeout de percentiles.
- Flapping: definir falso failover bajo red sana y flip count/intervalo observado. Objetivo es **no oscilación ilimitada**, no una falsa cifra de 0 falsos positivos sin evidencia.
- La aceptación exige invariantes (INV-01/02/08/10) además de tiempo; almacenamiento a presión y cloud outage se ensayan por separado y combinados.

### G4 — Evidence handoff a W1.7

Formato mínimo de trial: `run_id, scenario_id, profile, fault_type, t0_mono, detected_mono, first_service_mono, stable_mono, duration_ms, correlation_id, transport_before/after, remaining_backlog, ACK_count, duplicate_count, false_flips, cpu/mem/disk/watts, outcome, artifacts`.

**DoD de diseño:** cada latencia define `t0/t1`, modos, método, límites de estadística y dependencias de W1.2. **No PASS / no test físico**. Las latencias TBD se ajustarán con un harness y hardware piloto, no con afirmaciones teóricas.


## W1.5.H–J — Consolidación y gate

Matriz de recursos Base/Pro, constraints agnósticos y decisión de diseño en [**08 — Resource Gate**](08-resource-gate.md). Evitamos duplicar cifras A–G en este archivo; 08 enlaza valores y hace explícitas las incertidumbres. **No hay hardware elegido, ni pruebas ejecutadas.**

## W1.5.C–J — Implementation roadmap / inputs y outputs

| Task | Inputs de esta baseline | Entregable / gate |
|---|---|---|
| **C Compute & Memory** | perfiles A + envelopes B | **DOCUMENTED PROVISIONAL**: presupuesto CPU/RAM, fixtures de validación y falsificación; pendiente benchmark |
| **D Storage** | eventos/s y 72h/7d + clases P0–P3 | **DOCUMENTED / CONDITIONAL**: escenarios de capacidad, P0/P1 quotas, ACK/pressure/endurance; mediciones pendientes |
| **E Workload Resource Model** | manifest + C/D | **DOCUMENTED / UNVALIDATED**: schema JSON, admission, isolation and negative tests |
| **F Power/Thermal** | C + perfiles Base/Pro | **DOCUMENTED / UNMEASURED**: power/UPS models, method, temperatures TBD |
| **G Recovery Targets** | fallos W1.2 + B | **DOCUMENTED / UNMEASURED**: t0/t1 definitions, failover thresholds proposed, test protocol |
| **H Base vs Pro Matrix** | B–G | **DOCUMENTED / PROVISIONAL** en [08](08-resource-gate.md); trazabilidad por categoría |
| **I Hardware-agnostic Constraints** | H | cpu/RAM/NIC/storage/power thresholds sin nombres de vendors |
| **J Resource Gate** | I + benchmark plan | **CONDITIONAL DESIGN GO** W1.6/W1.7; NO-GO compra/producción, en [08](08-resource-gate.md) |

### Hipótesis de ingeniería aún no confirmadas

W1.5.C convierte el posible límite de CPU sostenida (≤70%) y RAM no comprometida (≥25%) en **hipótesis de validación**, no condiciones técnicas ya demostradas. F/G deben fijar metodología de potencia, térmicas y tiempos de recuperación. Ninguna de estas cifras supone una selección o benchmark de SoC.

## Política de cambios

Si se descubren incompatibilidades entre `MUST`, coste, potencia y plataforma candidata, **no ocultar la tensión**: abrir decisión en [`07`](07-roadmap-decisions.md), conservar requisito anterior con justificación, proponer nueva prioridad/target y documentar test que resuelve la discrepancia.
