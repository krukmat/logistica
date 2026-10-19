# 07 — Wave 1 Plan, ADR register y riesgos

**Última actualización:** 2026-10-12. **Entrega:** baseline arquitectónica W1.1–W1.8.D (design/spec only) más W1.9.R **Core compartido y Linux lab implementados** para `krukmat/logistica` (`main`); **sin dispositivo PEF productivo ni tests físicos**.

## A. Definición de completitud

- `DOCUMENTED`: artefacto de diseño escrito. **Sí** aplica a W1.1–W1.5.J como diseño (sin validación técnica).
- `VALIDATED`: test o evidencia externa reproducible revisada. **Hay pruebas verificadas del emulador y laboratorios Node/Linux; no tests físicos del producto.**
- `IMPLEMENTED`: código/config/servicio operativo. **Emulador y lab integrados implementados y probados en CI; no producto desplegado.**
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
| W1.8 | Architecture Shootout | **A–D DOCUMENTED; E–G BLOCKED** | [`11`](11-architecture-shootout.md) / candidate architecture templates; no hardware result |
| W1.9 | Virtual Edge Emulator + Portability Bridge | **A–R (software) IMPLEMENTED / CI VERIFIED**; device HW UNVALIDATED | [R arquitectura](18-hardware-portability-bridge.md), [CI](https://github.com/krukmat/logistica/actions/runs/38284356529): 76 Node PASS, 7 SIM_PASS, loopback/Linux veth LAB_PASS |

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
| RISK-23 | Virtual-only PEF PoC cannot verify hardware power/flash/offload/UPS | W1.8 requires instrumented physical evidence and declared gaps |
| RISK-24 | Scoring without measured hard gates could select a false winner | W1.8 HARD GATES first; all candidates BLOCKED until tested |
| RISK-25 | Un `SIM_PASS` puede interpretarse como prueba física de durable ACK/failover | [W1.9](12-emulator.md) tags and Linux/device evidence separado |
| RISK-26 | Divergencia del emulador ante restricciones de SO/kernel/NIC/storage reales | W1.9.H test confirmó necesidad de restaurar rutas de retorno WAN para HTTP end-to-end; W1.8 físico aún pendiente |
| RISK-27 | Journal puede consumir toda capacidad y bloquear CLOUD_ACK/evidencia O0/O1, sin compactación segura | W1.9.J1 controlReserveBytes implementado y probado, **no** reserva específica O0/O1; W1.9.J2 compactación con O0/O1 retenidos implementada/CI; horizonte de tombstones y reserva O0/O1 independiente pendientes |

## F. Experimentos y estrategia de evidencia futura

- Un hardware flexible para **simular** Base/Pro con limitaciones CPU/RAM; no confundir simulación con consumo/coste/thermals reales de SKU Base.
- Capturar `scenario_id, revision, hardware/software baseline, workload profile, metrics, artifacts, unexpected failures, correlation_id` en pruebas.
- Gates W1.2 + G-WRK-01/02 son matriz mínima del harness. Pasar no depende sólo de medias: p95, falsos positivos, crash loops y retención de P1.
- Un PoC de mercado independiente deberá medir instalación, soporte, intervenciones físicas, willingness-to-pay y retención. Éxito del benchmark técnico **no prueba product-market fit**.

## G. Próxima acción en repositorio

Repositorio de trabajo: `krukmat/logistica`, rama `main`. **W1.5.A–J, W1.6.A–I, W1.7.A–I, W1.8.A–D DOCUMENTED/SPECIFIED (DESIGN ONLY); no benchmarks executed.** [W1.8](11-architecture-shootout.md) is design-ready; **W1.8.E–G are BLOCKED** pending a working PEF DUT, harness drivers, instrumented physical candidates. Next unblocker: **W1.9.L** integrate Connectivity policy and file journal into a minimal local runtime → extend Linux-lab into Core runtime implementation → controlled physical comparison; existing namespace model is validated for sandbox behavior only. No purchase, production or SKU freeze approved.

## H. Referencia de conectividad y simulación

[13 — Conectividad PEF](13-connectivity-topology.md) es el documento principal de topología y secuencias editables. La evolución W1.9 prioriza `loopback-lab` seguro para pruebas reales localhost, antes del driver `linux-lab` con redes virtuales y finalmente W1.8 con interfaces físicas. Los resultados de localhost **no** certifican el throughput/failover de NICs reales.

**W1.9.F–I evidence:** [loopback audit](audit/w1.9-loopback-smoke-2026-10-12.md) y [H/I audit](audit/w1.9-h-i-2026-10-12.md), CI #38259618954: **22/22 Node tests PASS, namespace policy LAB_PASS CLEANUP=CLEAN**, sandbox file journal crash/reopen PASS. **W1.9.J1 IMPLEMENTED / CI PASS:** controlReserveBytes, ACK durable bajo presión; [CI #38260694016](https://github.com/krukmat/logistica/actions/runs/38260694016) confirma 24/24 Node tests. **W1.9.K1–K4 completed:** [local visual dashboard](tasks/w1.9-k-statechart-dashboard.md), [CI #38263883556](https://github.com/krukmat/logistica/actions/runs/38263883556) 34/34 tests; J2 compaction safe file rename/reopen verificado en CI #38264150746; siguiente W1.9.L integración de Connectivity y Journal. W1.8.E–G siguen bloqueadas para claims físicos.

**J2/J3 audit:** [W1.9 J2/J3](audit/w1.9-j2-j3-2026-10-12.md) — 38/38 Node PASS; compaction staged file/fsync/rename/directory fsync; O0/O1 retained, O2/O3 tombstones, simulated interrupted stages; no physical power-loss validation. **W1.9.L NEXT:** a single local runtime contract combining connectivity transitions with file journal ACK/error boundaries.

**CI actualizado 2026-10-12:** [#38264234999](https://github.com/krukmat/logistica/actions/runs/38264234999) 38/38 tests, siete escenarios SIM_PASS, loopback y namespace LAB_PASS, cliente web JS check PASS. `W1.9.K` implementado; `W1.9.J2` compaction implementada en laboratorio, no certificada para hardware real.

**W1.9.L CI:** [run #38264957781](https://github.com/krukmat/logistica/actions/runs/38264957781), 42 Node tests PASS, seven SIM_PASS, localhost and namespace job PASS. **W1.9.M CI VERIFIED:** [run #38265355221](https://github.com/krukmat/logistica/actions/runs/38265355221), six fsync-ACKed network transitions and six matching records on journal reopen, 42/42 Node tests PASS. [Audit](audit/w1.9-l-m-2026-10-12.md). **Next W1.9.N** pressure/restart regressions; hardware W1.8 still blocked.

**W1.9.N CI VERIFIED:** [run #38266099521](https://github.com/krukmat/logistica/actions/runs/38266099521), 45/45 Node PASS, 7 SIM_PASS, both lab jobs success. Controlled storage pressure produced explicit `ack=false` without halting the local route; `CLOUD_ACK` + compaction + retry restored a durable OS journal ACK. Process restart used a distinct session epoch without losing earlier events. [Audit](audit/w1.9-n-2026-10-12.md). **Next W1.9.O:** stable device/revision envelope; no physical product evidence.

**W1.9.O completed (lab):** [audit O](audit/w1.9-o-2026-10-12.md) / [CI #38268776321](https://github.com/krukmat/logistica/actions/runs/38268776321). Versioned edge envelope + explicit site/device/session/config identifiers, mocked remote durable-ACK ambiguity, idempotent replay, negative cross-device/payload/revision cases. **51/51 tests PASS**, 7 SIM_PASS, loopback and Linux sandbox PASS. **Next W1.9.P** trust/transport lab hardening. W1.8.E–G physical still NOT_RUN / BLOCKED.

**W1.9.P0 — UI integration gate CLOSED (lab scope, 2026-10-12).** [Contract](15-emulator-integration.md), [registry](contracts/emulator-integration-v1.json), [GitHub Actions run 38272443257](https://github.com/krukmat/logistica/actions/runs/38272443257) (58/58 Node PASS, 7 SIM_PASS, loopback LAB_PASS, netns LAB_PASS CLEAN). Quedan conectados a la UI identidad/revisión, WAN probes simulados, journal P1 con fsync host, presión, compaction, Cloud mock ACK perdido/forjado, reboot de sesión y loopback real. **No** hay ruta física/PKI/cloud real. **Mandatory next-gate:** Core+UI/API+E2E+docs+CI before declaring any future feature implemented; Linux/device only as CI-only/BLOCKED until preflight and actual evidence.

**W1.9.P1–P3 — IMPLEMENTED / CI VERIFIED (laboratorio, 2026-10-12):** bootstrap de identidad no secreta 0600/fsync y epoch por sesión, deadline/reintento remoto acotados, frame ACK v1 con HMAC efímero entre mocks y respuestas negativas (timeout, prueba ausente, versión incompatible). Todo es visible y ejecutable desde el **Laboratorio integrado** del dashboard, con tests HTTP end-to-end. [CI #38274368734](https://github.com/krukmat/logistica/actions/runs/38274368734): **65/65 Node PASS, 7 SIM_PASS, loopback LAB_PASS, Linux namespace LAB_PASS CLEAN**. Mantener explícito que Cloud es mock en memoria sin mTLS/PKI, los enlaces del panel son sintéticos y W1.8.E–G físicos permanecen bloqueados. Gate permanente: ninguna funcionalidad futura sin UI/API + pruebas + documentación.

**W1.9.Q — Virtual Site E2E CI VERIFIED:** la recepción de paquetes por API localhost utiliza el journal O1 compartido, sin dependencia WAN/Cloud, con ACK tras fsync. Tras caída total de WAN, acepta la recepción y conserva estado al reabrir P1; al recuperar WAN el Cloud mock recibe el evento con deduplicación incluso ante ACK perdido. Los fallos de cuota retornan HTTP 507, sin eventos aceptados ficticios. El dashboard invoca la misma Local API; registry/DoD actualizado. [Guía](17-virtual-site-e2e.md); [CI #38281997428](https://github.com/krukmat/logistica/actions/runs/38281997428): **68/68 PASS**, 7 SIM_PASS y ambos laboratorios PASS. **Transición prioritaria completada en software:** W1.9.R Core portable/ports antes de ampliar funcionalidades; siguiente paso físico aún requiere drivers, trust y aislamiento real de workloads.

**W1.9.R — Hardware Portability Bridge CLOSED (software only, 2026-10-12):** [arquitectura y limitaciones](18-hardware-portability-bridge.md), [tasks R1–R6](tasks/w1.9-hardware-portability.md). Política WAN extraída como función de dominio compartida entre emulador y controlador Linux; runtime, recepción y replay desacoplados de la UI y con puertos inyectables; OS file journal y Linux namespace adapter fuera del paquete emulator; un dashboard con runtime inyectado no controla su vida útil. 128 vectores parity + E2E UI restart + ACK fsync fail-closed. [CI #38284356529](https://github.com/krukmat/logistica/actions/runs/38284356529): **76/76 Node PASS**, 7 SIM_PASS, loopback LAB_PASS, netns LAB_PASS CLEAN. **R1–R5 cerrados**. R6 driver/hardware real, Trust/PKI, boot/OTA, Workload isolation y powercut **BLOCKED / NOT_RUN**. No inferir que software compartido implica dispositivo certificable.

**W1.9.S — Workload Runtime software/lab (2026-10-12):** [arquitectura](19-workload-runtime.md), [tasks](tasks/w1.9-workload-runtime.md) y [audit](audit/w1.9-s-2026-10-12.md). S1 admission manifest/cuotas, S2 supervisor child Node IPC + health/crash/recovery automática/circuit breaker, S4 recepción offline/P1 desde proceso, S5 controles en emulador, S6 CI **IMPLEMENTED / CI VERIFIED**. **S3**: kernel sandbox **LAB_PASS** en GitHub-hosted con cgroup v2 CPU 150m/mem 64MiB/pids16, netns, chroot, UID 65534 y recepción/fsync; driver productivo Linux conectado al supervisor todavía **PARTIAL/PENDING**, así como storage quota/PKI/boot/hardware. El proceso local de macOS **no** está aislado. [CI #38293362918](https://github.com/krukmat/logistica/actions/runs/38293362918) **84/84 Node PASS**, 7 SIM_PASS, loopback/netns y S3 LAB_PASS CLEAN. Siguiente gate de seguridad: conectar exactamente el driver Linux aislado al supervisor sin duplicar Core antes de declarar S3 cerrado como backend de producto.

**W1.9.S3.4–S3.8 — Linux Supervisor Isolation Bridge (CI LAB VERIFIED, 2026-10-12):** el mismo Core `WorkloadSupervisor` ya ejecuta `start/health/stop/crash/restart` mediante un `LinuxIsolatedProcessDriver` con cgroup v2/netns/chroot/UID sin privilegios y cuotas derivadas del manifiesto. [CI #38299458656](https://github.com/krukmat/logistica/actions/runs/38299928948): 84/84 Node PASS, 7 SIM_PASS, WAN netns y S3 LAB_PASS/CLEAN, OOM-kill real observado y reinicio. [Arquitectura/DoD](20-supervised-linux-driver.md). El panel Mac muestra evidencia **CI-only** y el child local sin sandbox; producción/hardware/servicio persistente y storage quota siguen **BLOCKED/NOT_RUN**.

**W1.9.T — AUTONOMOUS EDGE / PRE-HARDWARE HANDOFF CLOSED (software/lab, 2026-10-12).** [Diagrama & guía](21-autonomous-edge-handoff.md), [tasks](tasks/w1.9-t-autonomous-edge.md), [audit](audit/w1.9-t-2026-10-12.md), [handoff contract](contracts/hardware-handoff-v1.json). Edge standalone CLI/HTTP sobre el Core compartido; config estricta, identidad lab persistente fsync/epoch, escritura única lab, WAN sampling sin dashboard y receiver supervisado. E2E incluye SIGKILL CLI → journal reabierto e IDs idempotentes; Linux CI valida host con netns real y LAN local operativa sin WAN, y el daemon con un worker aislado por cgroup v2/netns/chroot. Control Panel ejecuta smoke sobre el propio host. **CI final #38314630311: 94/94 Node PASS, 7 SIM_PASS, loopback + Linux veth + S3 LAB_PASS/CLEAN; tercer job Handoff PASS**, `SOFTWARE_LAB_READY` / `GO_FOR_DEVICE_INTEGRATION_ONLY`. Estado hardware:`BACKEND_NOT_IMPLEMENTED`, physical `NOT_RUN`, **NO compra/producción/certificación**. Siguiente bloque: device provisioning/driver, service installation/boot hardware, PKI/mTLS, physical storage/power-cut and W1.8.E–G.

**W1.10.A — Predevice port conformance CI VERIFIED (software/lab, 2026-10-15):** [tasks](tasks/w1.10-predevice-emulation.md), [contract](contracts/predevice-ports-v1.json), [operator guide](22-predevice-ports.md). Shared Core driven by scripted WAN port faults and a temporary fsync journal; 13 checks, dashboard HTTP evidence, CLI + CI artifact. `device` still BLOCKED; W1.10.B deadlines and partial route rollback, W1.8.E–G physical gates pending.

**W1.10.B1 — Verified route port boundary CI VERIFIED (software/lab, 2026-10-15):** [architecture](22-predevice-ports.md), [tasks](tasks/w1.10-predevice-emulation.md). Four additional conformance checks exercise after-write route failure, detected false success, rollback-failure quarantine and explicit reconciliation (17 total). Does not alter physical device status; OS command deadlines/power-cut/boot reconciliation still pending.

**W1.10.A/B1 CI closure:** [#38735602133](https://github.com/krukmat/logistica/actions/runs/38735602133), code commit `d5709fb`: **99/99 Node PASS, 17/17 synthetic-port checks LAB_PASS, loopback + Linux netns/cgroup PASS, prehardware gate SUCCESS**. Artifacts: `pef-predevice-ports`, `pef-netns-evidence`, `pef-prehardware-gate`. [Audit](audit/w1.10-a-b1-2026-10-15.md). Software-lab verified ONLY; W1.10.B2 and physical W1.8.E–G remain open.

**W1.10.B2 — bounded predevice port boundary CLOSED (software/lab, CI VERIFIED 2026-10-15):** `src/adapters/bounded-wan-ports.js`, six new scenario checks (23 total), Core untouched; route timeouts quarantine even if a raw OS-like operation may later mutate, and bootstrap requires trusted route readback. [Task](tasks/w1.10-predevice-emulation.md) · [driver contract](22-predevice-ports.md). Physical process fencing, trusted persisted expected route, live kernel tests and W1.8 device acceptance remain blocked.

**W1.10.B2 closure:** [CI #38736879970](https://github.com/krukmat/logistica/actions/runs/38736879970) **COMPLETED/SUCCESS** against code `304d723`. **101/101 Node tests, 23/23 port conformance checks LAB_PASS**; Linux CI netns and cgroup plus third software handoff gate PASS. [Audit](audit/w1.10-b2-2026-10-15.md). Synthetic in-process task settlement and readback only; physical OS process fencing, durable route authority, real boot recovery, NIC/power-cut and W1.8.E–G still NOT_RUN. Next W1.10.B3 storage matrix.

**W1.10.B3 — storage adapter hardening CLOSED (software/lab, CI VERIFIED 2026-10-15):** synthetic fsOps injection against temp host journal without changing shared receipt Core, 11 negative/positive checks (34 total), explicit metadata schema v1 and legacy compatibility through compaction. Risk boundary: no real power cycle, flash wear, verified power-loss ordering or live ENOSPC. [Task](tasks/w1.10-predevice-emulation.md) · [contract](22-predevice-ports.md).

**W1.10.B3 closure:** [CI #38766556115](https://github.com/krukmat/logistica/actions/runs/38766556115) **SUCCESS**, code `e1ede2f`; **103/103 Node PASS**, **34/34 predevice LAB_PASS**, Linux CI isolated test and prehardware handoff PASS. [Evidence audit](audit/w1.10-b3-2026-10-15.md). Default fsync journal implementation retained; injection only trusted synthetic lab fixture. Device powerloss/real medium durability still `NOT_RUN`. Next B4.

**W1.10.B4 — golden traces CLOSED (software/lab, CI VERIFIED 2026-10-15):** independent versioned behavioral baseline for four shared-Core scenarios; CLI & dashboard gate; strict mutation detection and portable Linux JSON artifact. macOS operator run and physical driver remain NOT_RUN, and wall time/RSS are not normative device metrics. [Docs](23-golden-traces.md).

**B4 closure:** [Actions #38768767489](https://github.com/krukmat/logistica/actions/runs/38768767489) COMPLETED/SUCCESS, **107/107 Node**, **34/34 predevice**, **4/4 pinned golden traces**, identical canonical baseline SHA-256; isolated Linux and third handoff PASS. [Evidence](audit/w1.10-b4-2026-10-15.md). Mac execution NOT_RUN, physical device NOT_RUN; observational performance metrics not a benchmark. W1.10.C follows.

**W1.10.C1 — integration seam CLOSED (software/lab, CI VERIFIED 2026-10-15):** versioned Linux hardware capability/evidence contract, 9-case host-safe preflight, journal-backed unsigned lab boot intent + bounded port reconciliation, Product Connectivity Core and receipt test. Deliberately no kernel NIC mutation, hardware provisioning, credentials, service install or device backend activation. [Task](tasks/w1.10-predevice-emulation.md) · [safety contract](24-device-integration.md). C1 lab completion is not device readiness.


**W1.10.C1 closure:** [Actions #38780758276](https://github.com/krukmat/logistica/actions/runs/38780758276), all jobs SUCCESS. **110 Node tests, 9 C1 integration checks, 34 prehardware, 4 golden traces**. [Audit](audit/w1.10-c1-2026-10-15.md). C1 proves simulated read-only preflight, safe route reconciliation after unsigned lab journal fsync and mandatory device blocking; no physical driver, trusted provisioning, kernel fencing, systemd install or hardware measurements. Next W1.10.C2 candidate hardware qualification before deciding production driver implementation.

**W1.10.C2 — hardware screen implemented / CI PENDING (2026-10-15):** R5S-LTS 4GB/64GB eMMC preliminary physical candidate (3 built-in Ethernet, NVMe option), Pi 4 4GB compatibility baseline (USB adapters required), GL-MT3000 router-side alternative (512MB below 2GiB screening threshold). Live prices with dated source links; mixed USD/EUR never converted, missing BOM components prevent a finished device quote. Real CPU/RAM/fsync measurements are of *the current host only*, not a target device. [Source/decision matrix](25-hardware-screening.md). W1.8 physical comparison BLOCKED.

**C2 cost-priority correction (2026-10-15, supersedes prior shortlist):** the prior R5S/RPi4/MT3000 expensive screening candidates are rejected for the minimum logistics MVP. Provisional ≤60 EUR *complete unit* target (not priced/approved): HP T620 refurb 24 EUR baseline, Dell Wyse 5070 refurb 54 EUR, Orange Pi R1 Plus LTS 59 EUR secondary listing. Phase one physical POC is local-first Edge node behind existing router, not an asserted three-port dual-WAN gateway. Core policy unchanged, dual-WAN field acceptance blocked. [Screen](25-hardware-screening.md).

**C2 Seeed-only NEW restriction (2026-10-15; supersedes all earlier HP, Dell and other-vendor shortlists):** low-cost H28K technically interesting USD39.90 but MOQ50, CM4+carrier USD107.50 components-only, H68K USD99 out of stock. No credible single-unit delivered EUR60 full PEF quote today. [Current list](25-hardware-screening.md). No relaxation of durability/PKI/routing physical gates and no hardware purchase authorized.

## W1.10.E — 1GiB cost-first R28S research (2026-10-18)

E1/E2 resource+offline feasibility, E3 incremental streamed journal reader, E4 choose provisional Core-behind-existing-router, E5 separate non-physical decision gate. **Status: software implementation complete, Linux ARM64 CI covered; operator Lima 1GiB E1/E2/E5 evidence pending.** Hardware procurement, 72h journal acceptance, powercut, 3-native-NIC gateway all BLOCKED. [Details](27-arm64-1gb-resource-validation.md).

## W1.10.F — Core-only viability prior to physical purchase (2026-10-18)

F1 bounded 10k/50k/100k journal index test, F2 realistic 72h retention capacity/model + hard 100MiB product-cap gap, F3 NEW R28S BOM and read-only external router observer. Software implementation on main; GitHub CI covers small smoke on larger-memory ARM64 only. Full 100k ARM64 **1GiB Lima operator test** and actual hardware checkout/physical test remain PENDING. Full gateway 2WAN+LAN not authorized. [Plan and commands](28-arm64-f1-f3-next-gates.md).
**W1.10.F operator Mac result — 2026-10-18:** 100k events F1 successful on constrained 1GiB VM (peak Node RSS 277.77MiB; reopen 475ms; no OOM, dedup PASS). F2 72h capacity model complete but not physical acceptance: 0.612/2.095GiB journal needed before margin; standalone Edge cap 100MiB. **Next G: bounded-memory journal index redesign, NOT a simple quota increase**. [Operator audit](audit/w1.10-f1-f2-mac-1g-2026-10-18.md).

## Product-first priority shift after F1/F2 (2026-10-18)

**W1.10.G journal-index redesign: DEFERRED**, not canceled and not physical qualification. Verified 100k events under 1GiB Lima, but standalone 100MiB journal caps offline endurance to an estimated 11.49h (1KiB) / 3.35h (4KiB) at 2 events/s; **72h remains BLOCKED**. Prioritize **M1 end-to-end local-only → sync/reconcile; M2 minimal real Cloud Lite; M3 headless trust/recovery; M4 Property/Host overlays; M5 repeatable deployment/pilot economics**. Full multi-WAN ownership remains external-router dependent for low-cost Core-only candidate. [Decision and tasks](29-mvp-priorities-after-f1.md).

## M1 — End-to-end proof + video on the same test run (2026-10-18)

M1.1/1.2 autonomous Edge + shared Core replay with explicit in-memory Cloud mock, M1.3 integrity-checked evidence bundle, M1.4 CI artifact publication and M1.5 read-only HTML/video pipeline implemented. M1.6 final gate depends on optional Playwright video capture validation. No physical device, genuine WAN or Cloud Lite. [Execution guide](tasks/m1-end-to-end-evidence.md) and [evidence design](30-m1-evidence-design.md).

**M1 acceptance 2026-10-18:** end-to-end operational scenario with true localhost daemon, host-fsynced receipts, SIGKILL/reopen, Cloud mock ambiguity, replay, SHA-256 evidence, dashboard import and optional Playwright WebM complete. [CI #39142671151](https://github.com/krukmat/logistica/actions/runs/39142671151) all jobs success, [audit](audit/m1-e2e-video-2026-10-18.md). **M1.1–M1.6 CLOSED (SOFTWARE LAB ONLY)**. Next M2 real Cloud Lite; no physical certification.

## Cost constraint — No paid Cloud Lite (2026-10-18)

**User decision:** zero new infrastructure/subscription spend at this stage. **M2 hosted/paid Cloud Lite: DEFERRED**; do not provision a VPS, managed database, external paid SaaS, trial requiring a credit card or other billable resource. The optional zero-cash-cost part of M2 may run **entirely on the operator's existing Mac/CI**, including the current Cloud mock or a local-only persistent backend later, with no internet deployment or promise of remotely accessible fleet control. Operating a local machine still consumes existing electricity/storage; “zero cost” means **no new billable external service**.

**Active next priorities:** **M3 standalone Edge deployment/boot/recovery hardening in software lab → M4 one representative product overlay → M5 installation/pilot readiness without paid procurement**. M1 remains lab-PASS; W1.10.G 72h optimization remains DEFERRED. REQ-CLO-01 is still a product requirement, **not satisfied by mock or a local-only replacement**. Revisit real M2 hosting only upon explicit budget approval or credible free no-payment deployment, with security/auth/durability independently tested. No provider account or purchase authorization implied.

## M3.1–M3.2 — Operación autónoma de Edge sin servicios de pago (2026-10-18)

Primer bloque M3: supervisor Node headless sobre **el mismo Edge autónomo** (`bin/pef-m3-supervisor.js`), watchdog de readiness con reintentos acotados y SIGTERM, recuperación tras SIGKILL con journal compartido; wrapper Linux `flock` con FD de directorio contra segundo supervisor y regresión en CI sin root. Dashboard M3 ejecuta smoke real, etiqueta Linux CI-only y no atribuye exclusión kernel al Mac. [Tasks, DoD y comandos](tasks/m3-autonomous-lifecycle.md). **M3.3–M3.6 no implementados**; no hay arranque físico ni configuración segura/secure-boot certificada.

**M3.1–M3.2 CI closure 2026-10-18:** [#39149664097](https://github.com/krukmat/logistica/actions/runs/39149664097) SUCCESS, 152/152 ARM64, 151 x64 pass + 1 ARM-only skip; headless manager readiness, SIGKILL/restart fsync, kernel `flock` Linux wrapper contention, finite restart budget, dashboard and JSON evidence. **M3.1/M3.2 CLOSED only in software lab**; no installed systemd/product boot or physical fencing. [Audit](audit/m3-boot-supervision-2026-10-18.md).

**M3.3/M3.4 — LAB CLOSED (2026-10-18):** política supervisora CAS+STAGE+ACTIVATE+HEALTH+fsync COMMIT o ROLLBACK, stage interrumpido recuperado al boot y SAFE_MODE con recuperación local autenticada. [CI #39154660415](https://github.com/krukmat/logistica/actions/runs/39154660415) SUCCESS: ARM64 157/157, x64 156 PASS + 1 skip, cero fallos. [Audit](audit/m3-config-safe-mode-2026-10-18.md). No PKI/OTA, configuración de red ni hardware certificado. Siguen M3.5 y M3.6.

## M4.1 — Property primer overlay implementado (2026-10-19)

Se añade `pef-property` como **MODULE + CONFIG** con el mismo Core/Workload Supervisor/journal; alertas operativas O1 y ACK pueden persistirse offline mediante Edge autónomo, sin incorporar sensores, PMS ni protocolos de automatización físicos. Registro en [task M4.1](tasks/m4-property-overlay.md); [CI #39209710426](https://github.com/krukmat/logistica/actions/runs/39209710426) PASS; M4.1.1–M4.1.3 CLOSED sólo en laboratorio. [Auditoría](audit/m4-property-2026-10-19.md). Próximos: M4.2 Host, M4.3 commonality/resources y M4.4 evidencia integral. La hipótesis conceptual de reutilización en [05](05-overlays-workload-contract.md) todavía NO está medida.

## M4.2 — Host segundo overlay software-lab CLOSED (2026-10-19)

`pef-host` comparte `src/core/site-operations.js` y `src/workloads/site-operations-worker.js` con Property. Selección por `workload.profile`, diferencias de esquema MODULE y presupuesto RESOURCE, misma infraestructura CORE. Endpoints/escenarios localhost token-protected y dashboard integrados sin paid infrastructure. [CI #39216398340](https://github.com/krukmat/logistica/actions/runs/39216398340) SUCCESS: ARM64 171/171, x64 170 pass + 1 platform skip; Linux y handoff prehardware PASS. El cambio de contrato requerido por el `chroot` CI se copió de forma explícita sin relajar el aislamiento, que sigue **no validado** para Property/Host. [Tasks](tasks/m4-host-overlay.md) y [auditoría](audit/m4-host-2026-10-19.md). Próximos **M4.3 commonality/resources/failure matrix** y **M4.4 evidence/closure**, aún pendientes.

## M4.3 — Commonality medida y resiliencia (2026-10-19)

M4.3.1–M4.3.3 **CLOSED SOFTWARE LAB ONLY** con evidencia CI [#39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525). Core, journal, supervisor y worker compartidos Property/Host; compatibilidad Property histórica y matriz de fallos, fail-closed y recuperación comprobadas. 9 archivos comunes (929 LOC) y fachada Property (7 LOC) en muestra explícita: **no extrapolar el 99,25 % de muestra al producto**. CPU/RSS y latencias observadas no equivalen a cuotas físicas; Host/Property kernel sandbox NOT_RUN. [Tareas](tasks/m4-commonality-resilience.md) y [audit](audit/m4-commonality-2026-10-19.md). Siguiente M4.4 con bundle mismo run y verificación.

## M4.4 — Integración de evidencia software (2026-10-19)

El bundle M4 combina Property/Host y la matriz M4.3 **sin duplicar Core**. Pruebas negativas de adulteración, resumen/HTML regenerable, hash SHA256 **no firmado**, dashboard HTTP `m4Integrated` y artifacts x64/ARM64. Aún pendiente aceptar CI final al publicar documentación. [Tasks](tasks/m4-integrated-closure.md) · [auditoría](audit/m4-integrated-closure.md). Tras el cierre LAB, priorizar M5 instalación y pruebas físicas; no convertir artifact reproducible en evidencia de powercut/hardware/producto.

**Cierre LAB M4 completo:** [CI #39226414601](https://github.com/krukmat/logistica/actions/runs/39226414601) SUCCESS; 178 ARM64 PASS, 177 x64 PASS y un skip; artifacts x64/ARM64 con verificador de hashes. M4.1–M4.4 quedan **CLOSED SOFTWARE LAB ONLY**. El gate prehardware no autoriza producto físico; M5 permanece pendiente.

## M5.1–M5.2 — Ciclo de release temporal en Linux prehardware (2026-10-19)

Se implementa instalador de laboratorio `src/runtime/m5-install.js` con política pura Core y manifest SHA-256 (no firma), activación atómica, idempotencia y rollback conservando journal. Smoke de proceso empaquetado y UI con CI nativo x64+ARM64. **No** se instala daemon de sistema ni arranque automático ante reboot OS: readiness de proceso no constituye bootstrap de hardware. La selección de SO y control real de servicios se difiere a M5.3 según constraints. [Tasks](tasks/m5-reproducible-install-linux-lab.md), [audit](audit/m5-reproducible-install-2026-10-19.md).

**M5.1/M5.2 CLOSED LAB (2026-10-19):** [CI #39232965785](https://github.com/krukmat/logistica/actions/runs/39232965785) SUCCESS. Atomic release activation and verification, loopback Edge process/failure tests, retained journal after upgrade/rollback, symlink-denial tests, CI Linux x64/ARM64, dashboard E2E. No device install, actual OS boot, provisioned service, kernel constraints for overlays or powercut. M5.3 BLOCKED hardware.
