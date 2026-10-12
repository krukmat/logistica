# 08 — W1.5.H–J: perfil Base/Pro, constraints agnósticos y Resource Gate

**Date:** 2026-10-12 · **Status:** DOCUMENTED / PROVISIONAL; **NO hardware, software implementation, field or benchmark validation**. Fuentes normativas: [02 requirements](02-core-requirements.md), [04 failure gates](04-failure-offline-contract.md), [06 resource envelope](06-resource-envelope.md) y [W1.5 granular tasks](tasks/w1.5-resource-execution.md). Este documento es un **handoff de evaluación**: no es una ficha técnica de un producto disponible.

## W1.5.H — Base vs Pro Resource Matrix

**Objetivo:** preservar el Core idéntico y exponer sus rangos de carga y trade-offs. **H1** consolida; **H2** evalúa sensibilidad; **H3** documenta brechas.

### H1 — Matriz de presupuestos por perfil

| Recurso | Base / Property Base | Pro / Property Pro–Host | Fuente y naturaleza |
|---|---|---|---|
| **CPU/architecture** | TBD núcleos/ISA; normal steady ≤70% target de test | TBD núcleos/ISA; normal steady ≤70% target | W1.5.C hipótesis de headroom, no benchmark |
| **RAM fixture PoC** | **4 GiB** (stress negativo 2 GiB) | **8 GiB** (stress negativo 4 GiB); 16 GiB sólo exploración NVR | W1.5.C escenarios de test, **NO mínimo HW final** |
| **RAM planificación desglosada** | 1.760 MiB asignaciones modelo (incluye workloads 512 y recuperación 256) | 4.096 MiB (incluye workloads 2.048 y recuperación 512) | W1.5.C allowances, revisar doble contabilidad/observables |
| **WAN simultáneas monitorizadas** | ≥2 propuesto MUST / 3 definidas target | ≥3 propuesto MUST / 4 definidas target | W1.5.B; interfaz lógica ≠ número de NIC físicas |
| **Throughput routed/NAT+firewall** | 1 Gbps propuesto MUST/target | 1 Gbps propuesto MUST; 2.5 Gbps target | W1.5.B; paquete/pps/offload TBD |
| **Overlay cifrado** | 100 Mbps MUST, 250 target | 250 Mbps MUST, 500 target | W1.5.B; sólo accesos seleccionados |
| **Endpoints** | 50 MUST / 75 target | 150 MUST / 250 target (300 stress) | W1.5.B |
| **Conntrack simultáneas** | 8k MUST / 16k target | 32k MUST / 64k target | W1.5.B; RAM por flow medida en harness |
| **VLAN** | 4 MUST / 8 target | 8 MUST / 16 target (32 stress) | W1.5.B |
| **Workloads** | 1–3 ligeros | 3–8 mixtos Property Pro; 4–12 Host | W1.5.A; admisión real depende de E |
| **Journal event load** | 2 eventos/s sustained, 20 burst | 10 Property Pro / 20 Host sustained; burst 100/200 | W1.5.A cargas *sintéticas* |
| **Journal 72 h @1–4 KiB/record** | 0,49–1,98 GiB | 2,47–9,89 GiB Property Pro; **4,94–19,78 GiB Host** | W1.5.D ilustrativo, **no disco total** |
| **Journal 7 d @1–4 KiB/record** | 1,15–4,61 GiB | 5,77–23,07 GiB Property Pro; **11,54–46,14 GiB Host** | W1.5.D target, sin WAL/staging/reserva |
| **Media/FS/dual boot** | TBD capacidad real y endurance | TBD; SSD/NVMe probable sólo hipótesis | W1.5.D + W1.6; sin tecnologías fijadas |
| **Power wall idle/peak** | TBD, minimizar coste/consumo | TBD, priorizar capacidad/confiabilidad | W1.5.F; sin W medidos |
| **Thermals/UPS** | TBD ambiente, fanless deseable | TBD ambiente/ventilación, UPS dimensionada | W1.5.F; medir sitio completo |
| **Failover WAN p95** | <10 s MUST propuesto / <5 s target | mismos targets | W1.5.B/G; sin datos de test |
| **Recovery/boot/replay** | bounded, integridad primero; tiempos TBD | idem; cargas mayores pueden alargar drenaje | W1.5.G |

**No convertir la tabla en SKUs.** Property Pro y Host son configuraciones/workloads sobre el mismo perfil Pro; NVR no es requisito base ni del Core. [Workload manifest](contracts/workload-manifest-v0.1.schema.json) común, con políticas y cuotas independientes de vertical.

### H2 — Sensibilidad de plataforma/PoC

- **Un único equipo de prueba configurable** puede simular límites de CPU/RAM de Base y Pro para test funcional, pero **NO** simula coste, consumo idle, NIC reales, offload, endurance de flash o térmica de un equipo Base económico.
- Si se precisa 1 Gbps Base con paquetes mínimos de 64 bytes, la carga puede superar un CPU generalista sin offload; evaluar 64/512/1500 bytes y uso de aceleración *por separado*, sin presentar pps teóricos como rendimiento.
- Host bajo 7 días offline y 4 KiB/evento **no cabe** en una reserva de journal pequeña sin renegociar límites de backlog, ampliar storage o definir compresión/retención contractual; no perder P1 ACKed.
- Workload Host NVR con 16 cámaras (escenario exploratorio, no especificación) puede trasladar costo y desgaste a **P2**. Nunca debe sacrificar P0/P1 ni forzar un tercer SKU automáticamente.
- Diferencias de NIC/cooling/storage sólo justifican nuevo SKU **si mejora coste, consumo, capacidad o instalación** respecto del mismo Core.

### H3 — Decisiones / brechas para estudio

| Brecha | Estado | Regla de avance |
|---|---|---|
| 1 Gbps Base vs coste/idle power | OPEN / RISK-01 | medir offload, tráfico y watts; revisitar MUST con ADR si inviable |
| Host 7 días O1 journal vs BOM | OPEN / RISK-02/13 | muestrear bytes y WAF + límites P1 sin falso ACK |
| 4/8 GiB fixture vs mínimos físicos | OPEN | fijar sólo después de memoria y OOM/pressure tests |
| Same OS image Base/Pro | OBJECTIVE, not PROVEN | W1.6 runtime + W1.8 candidate support |
| Commonality 90–95% | HYPOTHESIS | medir contra código después de W1.6 |
| Seguridad del storage/boot/identity | OPEN | failure/power-cut + secure trust path W1.6/W1.7 |
| NVR/guest workload stress | OPTIONAL | no bloquear Core-only/Property Base inicial |

**H design DoD:** matriz trazable + hipótesis/limitaciones. No aceptación de precios, plataforma o SKU.

## W1.5.I — Hardware-agnostic Constraints

**Objetivo:** requisitos que cualquier candidato ARM router/ARM edge/x86 low power/split pueda cumplir y un filtro de comparación independiente de marketing.

### I1 — Capability constraints (tipo)

| Dimensión | Restricción de contrato (no vendor) | Prueba/fuente |
|---|---|---|
| Network underlay | transportar 2 WAN Base / 3 Pro monitorizables y LAN privada; PHY, USB modem, Wi-Fi WAN y switch trunk son alternativas | REQ-CON-01/03, G-CON-01/03; **no equiparar** WAN con número de NIC |
| NAT/firewall | capacidad de throughput B bajo tráfico controlado y observabilidad de offload/ruta fast/slow | C-CPU-01; W1.7 routing harness |
| Overlay | autenticación y throughput B con latencia/load medibles | C-CPU-02, G-SEC-01 |
| CPU/RAM | budgets C, aislamiento E, Core ready offline bajo presión | C-CPU, C-MEM, E-01–E-06 |
| Persistence | P0/P1 separable de P2/P3, durable ACK y boot/rollback seguro | D-PER-01/02/04/06, D-OTA-01 |
| Identity | identidad persistente sin regeneración silenciosa, canal remoto seguro y recovery local | G-SEC-04, G-CLOUD-01 |
| Workloads | runtime para isolate/admit; contrato común al menos un test workload | REQ-WRK-01–03 |
| Power/thermal | consumos medibles y no throttling que invalide servicio acordado | F-PWR/F-THM, W1.5.F |
| Field servicing | recuperación known-good y auditoría de fallos incluso cloud disconnected | G-OBS, G-REC y tests D/G |
| Expandability | storage P2 opcional, radios/HaLow/LoRa extensiones sin alterar Core | W1.4 + W1.6 |

**No derivados todavía:** elección de OS, SoC, número obligatorio de NIC físicas, TPM, unidades GB de boot, cantidad de núcleos, potencia máxima, necesidad de SSD, UPS integrada; quedan **TBD**. No inventar valores para habilitar compras.

### I2 — Eliminación / comparación de candidatos

- **Disqualifying failures para tesis Core**: cloud imprescindible para arranque/operación local; pérdida de evento ACKed con corte dentro de garantías declaradas; workload P2 llena disco P1 o puede modificar identity; recuperación sin known-good; ausencia de canal seguro; incapacidad sistemática de emitir evidencia fiable en fallo.
- **Feasibility mismatch pendiente de trade-off**: no alcanzar 1 Gbps Base, 2.5 target Pro, overlay target, p95 WAN, 25% RAM libre, bajo consumo o coste. Documentar resultado bajo tráfico/energía/temperatura especificada; **no confundir TARGET con MUST ni fallos del harness con imposibilidad tecnológica**.
- **Business filter posterior**: costo total BOM + licencias + soporte + mantenimiento/energía; no comparar sólo precio de SBC. W1.8 deberá cotejar oferta real entonces, no estimación sin fuente.

### I3 — Matriz de evaluación para W1.8

| Candidato | Test común | Mismatches |
|---|---|---|
| ARM router-class | WAN, 1Gb routing/packet sizes, RAM/flash P1, overlay, low idle W | CPU bajo VPN, almacenamiento/rollback y workloads |
| ARM edge | mismos tests + workload density/thermal | NIC y power/BOM |
| x86 low-power | mismos tests + 2.5Gb Pro target, storage/local service runtime | consumo idle, costo, enfriamiento |
| Split (router + compute) | mismos invariantes **end-to-end** (LAN survives compute/recovery faults, auth, persistence) | 2-box support, coste/UPS, ownership recovery |

**Comparabilidad obligatoria:** mismo firmware revision declarado, perfiles Base/Pro, tráfico, carga de journal, workload y fault injection. En hardware heterogéneo, anotar accelerators/fast-path; no convertir CPU cores entre ISAs en equivalentes.

**I design DoD:** criterios de descarte trazables a REQ/gates y test común; no plataforma elegida.

## W1.5.J — Resource Gate (design-only)

### J1 — Coverage matrix

| Requirement family | Fuentes y gates | Qué falta para VALIDATED |
|---|---|---|
| REQ-CON-01..04 | W1.5.B/G; G-CON-01..04; C-CPU-01 | WAN physical/virtual bench, packet mix, link-up degraded |
| REQ-SUP-01/02 | W1.3, W1.2 config/rejoin; G-CLOUD, G-PER-02 | transaction failure, revision/conflict test |
| REQ-STA-01..03 | W1.5.D; G-PER/G-OBS; D-PER/D-SYN | real event corpus, power cut, quota full, idempotent replay |
| REQ-WRK-01..03 | W1.5.E; G-WRK; E-01..06 | schema enforcement, resource isolation, denied raw network intent |
| REQ-SEC-01/02 | W1.2; G-SEC/G-OTA-03 | identity/key refusal, invalid signature, remote downgrade prevention |
| REQ-REC-01/02 | W1.5.G; G-REC/G-OTA; D-OTA/F-UPS | recovery times, non-convergent faults, boot fallback |
| REQ-OBS-01 | W1.2/D; G-OBS | evidence continuity offline/after cloud |
| REQ-API-01/REQ-LOC-01 | W1.3/W1.4; G-CLOUD/G-PEF-CORE | auth local API, LAN local-only services under all-WAN outage |
| REQ-CLO-01 | Cloud Lite; G-CLOUD-02/03, D-SYN | ingestion durable ACK + idempotency and revision reconcile |

### J2 — Decision

**`GO-TO-W1.6/W1.7-DESIGN` (conditional); `NO-GO-TO-HARDWARE-PURCHASE/PRODUCTION/SKU-FREEZE`.**

Motivo: las capacidades, responsabilidades y escenarios están definidos, pero **no existen resultados medidos ni software PEF construido**. No autorizar implícitamente compra o elección de hardware. W1.6 debe convertir las interfaces/contratos lógicos en un runtime elegible (incluidos state, identity, boot, OTA, isolation); W1.7 debe especificar/reproducir el harness; W1.8 debe ejecutar comparación de candidatos **después** de tener fixtures consistentes. Una aprobación de diseño no puede certificar hardware ni una viabilidad económica.

**OPEN/REVISIT:** precio de Base/Pro frente a throughput objetivo; límites concretos de storage/retención; recuperación p95 bajo WAN carrier-up y carga; Trust/Recovery bootstrap; ISR/per-Core isolation cuando storage está read-only.

### J3 — Handoff / next wave

1. **W1.6 Software Runtime Contract:** resolver `OPEN-BOOT-01`, `OPEN-STORE-01`, `OPEN-RUNTIME-01`, `OPEN-NET-01`, `OPEN-SYNC-01`, `OPEN-OTA-01` con ADR y escenarios falsables. No seleccionar plataforma por preferencia sin medir coste de integración y soporte.
2. **W1.7 Benchmark Harness Specification/implementation:** definir `scenario_id`, traffic mix, WAN faults, snapshots/hashes, P0/P1 ACK, manifest admission, power/thermal, time sync y p95/p99; separar `pass` de `instrumentation missing`.
3. **W1.8 Architecture Shootout:** medir ARM router / ARM edge / low-power x86 / split con el mismo harness; anotar imposibilidad de simulación de hardware y trade-offs; actualizar matriz H y product gate.

**J design DoD:** matriz requirements ↔ scenarios ↔ future evidence + decisión acotada + próximos contratos. **State W1.5.A–J: DOCUMENTED (design), empirical VALIDATED: NONE.**
