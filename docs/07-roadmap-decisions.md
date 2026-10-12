# 07 — Wave 1 Plan, ADR register y riesgos

**Última actualización:** 2026-10-12. **Entrega:** baseline arquitectónica W1.1–W1.7 (design/spec only) documentada para `krukmat/logistica` (`main`); **sin código de producto PEF ni tests de producto**.

## A. Definición de completitud

- `DOCUMENTED`: artefacto de diseño escrito. **Sí** aplica a W1.1–W1.5.J como diseño (sin validación técnica).
- `VALIDATED`: test o evidencia externa reproducible revisada. **Ningún test ejecutado en esta entrega.**
- `IMPLEMENTED`: código/config/servicio operativo. **Ninguno creado.**
- `CLOSED (design task)` sólo cuando documento, decisiones, open questions y trazabilidad están registrados. No confundir con `VALIDATED`.

## B. Wave 1 task map

| ID | Task | Estado al corte | Artefacto / falta |
|---|---|---|---|
| W1.1 | Core boundary (MUST/LATER/OUT) | **DOCUMENTED** | [`02-core-requirements`](02-core-requirements.md) |
| W1.2.A–I | Failure taxonomy, invariants, transport/cloud/offline, persistence, security, recovery, observability, gates | **DOCUMENTED** | [`04-failure-offline-contract`](04-failure-offline-contract.md) |
| W1.3.A–J | Planos, componentes, owners, interfaces, dependencies, bootstrap, recovery, cloud boundary, workload API, master diagram | **DOCUMENTED** | [`03-logical-architecture`](03-logical-architecture.md) |
| W1.4.A–F | Property/Host overlays, commonality, stress, SKU hypothesis, architecture gate | **DOCUMENTED (conceptual)** | [`05-overlays-workload-contract`](05-overlays-workload-contract.md); empírico pendiente |
| W1.5.A | Workload profiles | **DOCUMENTED / PROVISIONAL** | [`06-resource-envelope`](06-resource-envelope.md) |
| W1.5.B | Networking envelope | **DOCUMENTED / PROVISIONAL** | [`06-resource-envelope`](06-resource-envelope.md) |
| **W1.5.C** | **Compute/Memory Envelope** | **DOCUMENTED / PROVISIONAL** | [`06-resource-envelope`](06-resource-envelope.md): presupuesto CPU/RAM hipotético; validación pendiente |
| **W1.5.D** | **Storage Envelope** | **DOCUMENTED / PROVISIONAL** | [`06-resource-envelope`](06-resource-envelope.md): scenario capacity, reservations, durability; sampling/testing pending |
| **W1.5.E** | **Workload Resource Model** | **DOCUMENTED / UNVALIDATED** | manifests, admission, isolation, network intents |
| W1.5.F | Power/Thermal Envelope | **DOCUMENTED / UNVALIDATED** | idle/load/peak, UPS/thermal budget |
| W1.5.G | Recovery Performance Targets | **DOCUMENTED / UNVALIDATED** | umbrales medibles p50/p95/p99 + metodología |
| **W1.5.H** | Base vs Pro Resource Matrix | **DOCUMENTED / PROVISIONAL** | matriz consolidada |
| W1.5.I | Hardware-agnostic Constraints | **DOCUMENTED / PROVISIONAL** | minimum/recommended specs sin modelos |
| W1.5.J | Resource Gate | **DOCUMENTED / PROVISIONAL** | GO/revisit y riesgos |
| W1.6 | Software Runtime Contract | **DOCUMENTED / DESIGN ONLY** | [`09`](09-runtime-contract.md): bootstrap, IPC/state, journal, sync, trust, workload; tests pending |
| W1.7 | Benchmark & Failure Harness Specification | **DOCUMENTED / SPECIFIED** | [`10`](10-benchmark-harness.md) + scenario/evidence schemas; drivers/benchmarks pending |
| **W1.8** | Architecture Shootout | **NEXT — DESIGN ONLY** | comparativa ARM router vs ARM edge vs x86 vs split bajo el mismo harness |

## C. Execution contract / granular W1.5 subtasks

The working decomposition is [**W1.5 execution breakdown**](tasks/w1.5-resource-execution.md), with exactly one level of subtasks (`C1`, `D1`) and an **optional** second level (`C1.a`) where evidence genuinely differs. Each task must produce an output, linked requirements, acceptance conditions and honest state. No third level.

**Completed as design:** C1–C5, each DOCUMENTED / UNMEASURED. See [06 § W1.5.C](06-resource-envelope.md). Proposed memory fixtures Base 4 GiB / Pro 8 GiB are **experiment resources**, not selected device specifications. Packet-rate formulas and RAM arithmetic remain subject to benchmark.

**W1.5.D–G output:** [06](06-resource-envelope.md) and [05](05-overlays-workload-contract.md) + [schema](contracts/workload-manifest-v0.1.schema.json). **W1.5.H–J output:** [08 Resource Gate](08-resource-gate.md), consolidates Base/Pro, hardware-neutral constraints and conditional design GO. **No empirical validation conducted**. W1.6/W1.7 are next.

## D. Decisiones y ADRs (acuerdo conceptual; no evidencia de campo)

| ADR | Status | Decisión | Motivo / alternativa diferida |
|---|---|---|---|
| ADR-001 | ACCEPTED-DESIGN | Único Core para Property y Host | evitar duplicación vertical; validar común real después |
| ADR-002 | ACCEPTED-DESIGN | Cloud gestiona, no condiciona supervivencia | local-first y anti-SPOF |
| ADR-003 | ACCEPTED-DESIGN | Cinco bloques lógicos + Cloud Lite tres capacidades | minimizar sobrearquitectura |
| ADR-004 | ACCEPTED-DESIGN | Workloads sin privilegios de networking/identity; Network Intent | aislamiento y seguridad |
| ADR-005 | ACCEPTED-DESIGN | Base/Pro son **perfiles de recursos** primero, SKUs no aprobados | no congelar hardware |
| ADR-006 | ACCEPTED-DESIGN | Store-and-forward bounded, prioridad y backpressure | durabilidad sin disco infinito |
| ADR-007 | ACCEPTED-DESIGN | Signed validation + rollback local en Core; fleet OTA cloud después | seguridad crítica sin plataforma completa |
| ADR-008 | ACCEPTED-DESIGN | Sin private 5G, PCB propia, Kubernetes, bonding requerido en v0.1 | coste/alcance |
| ADR-009 | ACCEPTED-DESIGN | Estado Health independiente de Connectivity y Cloud | W1.6.C resuelve diseño, implementación pendiente |
| ADR-010 | ACCEPTED-DESIGN | Trusted bootstrap lógico mínimo antes de servicios y workload | W1.6.B resuelve orden sin escoger stack |
| ADR-011 | ACCEPTED-DESIGN | H/I/J: GO sólo a diseño runtime/harness, no a hardware, producción ni SKU | baselines numéricas no verificadas; pruebas W1.7/1.8 obligatorias |
| ADR-012 | ACCEPTED-DESIGN | Runtime contract: bootstrap minimal, cinco owners, state orthogonal, P0/P1 segregated | [`09`](09-runtime-contract.md), sin proceso/stack fijado |
| ADR-013 | PROPOSED | Cloud ingest at-least-once, dedup event ID + ACK/cursor, revision compare-and-apply | por validar W1.7; conflicto de estado local aún abierto |

**Criterio para reabrir ADR ACCEPTED-DESIGN:** evidencia de requisito incumplido, coste/energía inaceptable o incompatibilidad demostrada; documentar alternativa y efecto.

## E. Registro de riesgos/ambigüedades

| ID | Riesgo | Próximo control |
|---|---|---|
| RISK-01 | 1Gbps Base + baja potencia/coste + WAN redundantes pueden ser incompatibles | W1.5.C/F/I + W1.8 comparativa |
| RISK-02 | Host 7d/20 eventos/s: 11.54–46.14 GiB **ilustrativos** para 1–4 KiB/evento, sin overheads; puede romper PoC económico | W1.7 medir payload p50/p95/p99 + storage amplification; W1.8 evaluar coste/capacidad |
| RISK-03 | P0/P1 deben protegerse del fill de P2; flush/commit/ACK no garantiza durabilidad ante controlador inseguro | W1.6 cuotas/fsync/boot; W1.7 power-cut, corrupción y disco lleno |
| RISK-04 | Recovery+identity como bloque único oculta dependencia boot/storage | `OPEN-BOOT-01`, W1.6 |
| RISK-05 | Estado `LOCAL_ONLY` y `HEALTHY` ambiguos | `OPEN-STATE-01`, W1.6 |
| RISK-06 | Reconciliación, idempotency y conflicto cloud/edge sin política final | `OPEN-SYNC-01`, W1.6 |
| RISK-07 | Workload Network Intent permite escalación si no hay policy enforcement | W1.5.E/W1.7 G-WRK-01 |
| RISK-08 | Commonality 90–95%, hardware BOM estimados sin baseline de código | W1.6–W1.8 y pilotos |
| RISK-09 | Router differentiation/WTP/installer economics sin pilotos | discovery comercial, mantener fuera de validación técnica W1 |
| RISK-10 | Claims de cloud/offline mal interpretados como remote access ilimitado | UX/contratos explícitos y local workload classification |
| RISK-11 | Fuentes externas del research pueden estar desactualizadas / citas no exportables | verificación independiente antes de compras y external claims |
| RISK-12 | Operación indefinida offline ≠ backlog infinito: con P1 lleno habrá rechazo/backpressure | W1.5.E admission, W1.7 stress y definición de error visible |
| RISK-13 | Tamaños/retención no pueden fijarse sin muestras y contrato de evento máximo | W1.7 corpus y percentiles; revisar W1.5.D y memoria/CPU |
| RISK-14 | Aceptar workloads mediante schema sin enforcement de cuotas sería una falsa garantía | W1.6 admission/runtime isolation; W1.7 E-01–E-06 |
| RISK-15 | Potencia y thermal de WAN/modem/disco/UPS pueden invalidar coste y failover objetivos | W1.7/1.8 F-PWR/F-THM, comparar carga combinada |
| RISK-16 | Percentiles p95/p99 no son defendibles sin muestras suficientes y t0/t1 precisos | W1.7 G protocol, raw runs y CIs |
| RISK-17 | El hardware split puede añadir dependencia inter-box que viole Local Survivability | W1.6 boot/recovery authority + W1.8 end-to-end tests |
| RISK-18 | Un único hardware fixture Base/Pro simula software, no garantiza BOM ni energía de Base | W1.8 dispositivos físicos y coste total, no marketing claims |
| RISK-19 | Deadlock bootstrap entre P0/identity y Journal, o fallback sin red local | W1.6.B model + W1.7 G-OTA/G-SEC/power-fault |
| RISK-20 | Cloud ACK ambiguo y réplica sin dedup producen doble acción o pérdida de cursor | W1.6.E + W1.7 D-SYN-01, G-CLOUD-02 |
| RISK-21 | Registry de escenarios o JSON Schema interpretado como evidencia ejecutada | W1.7 no PASS sin trace raw+hash; W1.8 gate bloqueado sin DUT |
| RISK-22 | Fault injection peligroso fuera de laboratorio aislado o cleanup incompleto | W1.7 preflight lab ID, dry-run, capability check y restore audit |

## F. Experimentos y estrategia de evidencia futura

- Un hardware flexible para **simular** Base/Pro con limitaciones CPU/RAM; no confundir simulación con consumo/coste/thermals reales de SKU Base.
- Capturar `scenario_id, revision, hardware/software baseline, workload profile, metrics, artifacts, unexpected failures, correlation_id` en pruebas.
- Gates W1.2 + G-WRK-01/02 son matriz mínima del harness. Pasar no depende sólo de medias: p95, falsos positivos, crash loops y retención de P1.
- Un PoC de mercado independiente deberá medir instalación, soporte, intervenciones físicas, willingness-to-pay y retención. Éxito del benchmark técnico **no prueba product-market fit**.

## G. Próxima acción en repositorio

Repositorio de trabajo: `krukmat/logistica`, rama `main`. **W1.5.A–J, W1.6.A–I, W1.7.A–I DOCUMENTED/SPECIFIED (DESIGN ONLY), benchmark evidence NONE.** [Runtime](09-runtime-contract.md) y [Harness Specification](10-benchmark-harness.md) permiten diseñar **W1.8 Architecture Shootout**. **No** existen drivers, DUT ni resultados medidos; hardware purchase/production/SKU freeze siguen NO-GO.
