# M4.2 — Host overlay sobre Site Operations

**Fecha:** 2026-10-19 · **Branch:** main · **Estado:** M4.2.1 DOCUMENTED; M4.2.2/M4.2.3 IMPLEMENTED — validación CI de commit final pendiente.

## Hipótesis de uso y alcance

Alojamiento pequeño/camping: el personal registra una incidencia local de una unidad o instalación sin PMS ni Internet. Flujo **OPEN → durable O1 → ACK → recuperación → replay de Cloud mock**. El usuario es un operador autorizado local de laboratorio; **no** hay huéspedes autenticados, reservas ni hardware. La unidad `unitId` representa una instalación/habitación y no incorpora PII ni identificadores de clientes.

### M4.2.1: contrato funcional y fronteras

- `OPEN`: `{"operation":"OPEN","incidentId":"HOST-001","unitId":"CABIN-07","category":"MAINTENANCE","severity":"WARNING"}`.
- `ACK`: `{"operation":"ACK","incidentId":"HOST-001"}`.
- Exactamente las propiedades anteriores, IDs de 1–48 caracteres ASCII alfanuméricos/guion/guion bajo; severidad `WARNING|CRITICAL`, categoría `MAINTENANCE|SAFETY`. Se rechazan otras claves, acciones, valores y ACK de una incidencia inexistente.
- `OPEN` → `HOST_INCIDENT_OPENED` (`host.<deviceId>.<incidentId>.open`) y `ACK` → `HOST_INCIDENT_ACKED` (`host.<deviceId>.<incidentId>.ack`), ambos `O1`, `schemaVersion=1`, con `correlationId=host.<deviceId>.<incidentId>`. IDs deterministas; duplicados exactos devuelven idempotencia; conflicto de payload devuelve 409.
- El ACK es un **segundo evento duradero**; nunca modifica ni reescribe el OPEN. `201` requiere fsync del journal compartido; repetición `200`, conflicto `409`, comando inválido o ACK huérfano `400`, worker indisponible `409`, almacenamiento sin garantía de fsync `507`.
- La lectura ordenada reconstruye `OPEN`/`ACKNOWLEDGED` tras reinicio desde `journal.retained()`. El mismo Core mantiene operación local en `LOCAL_ONLY`; Cloud mock solo permite probar el replay después de simular recuperación WAN.
- `workload.profile="host"` ejecuta `pef-host` con `LOCAL_ONLY_CAPABLE`, manifiesto versionado, admission, health y bounded recovery del Supervisor original; solamente scripts estáticos allowlisted. Rechazo de over-budget **antes** del proceso.

### M4.2.2–M4.2.3: tareas de implementación y aceptación

| ID | Deliverable | DoD | Dependencia | Estado |
| --- | --- | --- | --- | --- |
| M4.2.1.a | Caso representativo Host offline | Contrato OPEN/ACK con estados | M4.1 | DOCUMENTED |
| M4.2.1.b | IDs y esquema durables | Identidad, evento inmutable, rechazo y fsync definidos | M4.2.1.a | DOCUMENTED |
| M4.2.1.c | Commonality preliminar | Clasificación CONFIG/MODULE/RESOURCE sin porcentajes inventados | M4.2.1.b | DOCUMENTED |
| M4.2.2.a | Site Operations compartido | Property permanece compatible bit a bit en tipos/IDs/campos; Host usa el mismo motor | M4.2.1 | IMPLEMENTED — CI pending |
| M4.2.2.b | Perfil Host allowlisted | Config Host / proceso y API local controlada | M4.2.2.a | IMPLEMENTED — CI pending |
| M4.2.2.c | Admission/health/recursos | Rechazos before-start y no false kernel isolation | M4.2.2.b | IMPLEMENTED — CI pending |
| M4.2.3.a | E2E real Host | HTTP → Supervisor/IPC → journal fsync → reopen → replay | M4.2.2 | IMPLEMENTED — CI pending |
| M4.2.3.b | Negativos | Token, invalidez, conflictos, out-of-budget, ausencia del proceso, sin WAN | M4.2.3.a | IMPLEMENTED — CI pending |
| M4.2.3.c | Dashboard, CLI y CI | `m4Host`, HTTP/UI test, ARM64/x64, auditoría | M4.2.3.b | IMPLEMENTED — CI pending |

### M4.2.1.c — Distinciones frente a Property

| Aspecto | Property | Host | Clasificación |
| --- | --- | --- | --- |
| Journal/ACK/fsync, supervisor, health, recovery, API auth | Común | Común | CORE igual |
| Selección del perfil `workload.profile` | property | host | CONFIG |
| Comando inicial + campos | ALERT/assetId | OPEN/unitId/category | MODULE (política de schema) |
| Manifiesto y reservas de CPU/RAM | presupuestos Property | presupuestos Host | RESOURCE |
| Cloud Mock, event scope, rejoin | Mismo transporte/validación | Mismo transporte/validación | CORE igual |
| PMS, guest Wi-Fi, redes físicas | Fuera | Fuera | OUT v0.1 |

**No se atribuye un porcentaje de reutilización a M4.2:** medición y evaluación de duplicación pertenecen a M4.3.

## Riesgos y trazabilidad

REQ-LOC-01, REQ-WRK-01/02, REQ-STA-01/02, REQ-OBS-01. Change: **added**. Classification: **CONFIG + MODULE + RESOURCE**. La categoría `O1` significa evidencia operativa, no control P1. No se valida aislamiento de red/FS/cgroup de Property/Host, 72h, hardware, powercut, PMS ni cloud remoto. Sin contratación de servicios ni compra de hardware.

## Implementación y pruebas (M4.2.2–M4.2.3)

- `src/core/site-operation-contract.js`: perfiles estrictos Property y Host, validación de comandos y envelopes; la semántica Property existente queda intacta.
- `src/core/site-operations.js`: **un único motor** parametrizado de incidencias; lista de eventos del mismo journal, construcción de comandos y sólo ACK persistido tras fsync. `src/core/property-incidents.js` sigue siendo fachada compatible para los consumidores antiguos.
- `src/workloads/site-operations-worker.js`: proceso estático compartido entre `pef-property` y `pef-host` (ID/perfil fijado exclusivamente por el adapter allowlisted). Nunca ejecuta shell ni persiste directamente; los procesos locales no están sandboxed.
- `src/runtime/demo-workload.js`: Host `LOCAL_ONLY_CAPABLE`; requests/limits CPU **100/180 mCPU**, RAM **32/80 MiB**, storage P2 **8/24 MiB**, manifiesto v1. Son reservas lógicas del Workload Manager; no cuotas kernel reales para Host.
- `src/runtime/autonomous-edge.js`: `workload.profile="host"`, `GET/POST /host/incidents` en loopback, token operador; `state.hostIncidents` y `activeOverlay=host`. `receiver` sigue siendo el perfil por defecto.
- `src/emulator/lab/host-smoke.js`: Edge HTTP autónomo → IPC worker → Core journal → offline/ACK/reopen → Cloud mock. Panel **Laboratorio integrado → M4.2 Host** con acción `hostSmoke`. Comando `npm run m4:host`, tests `test/host-overlay.test.js`, `test/dashboard-integrated.test.js`.
- La suite mantiene los casos M4.1 Property y prueba escenarios negativos adicionales: rechazo de comandos, clasificación inválida, evento en conflicto, over-budget, intent de red no autorizado y disco lleno sin false ACK.
- El script de laboratorio CI `scripts/lab/workload-isolation-smoke.sh` copia el nuevo contrato puro al `chroot` estático del worker legacy, sin relajar cgroup, namespace, UID ni permisos; **esto no certifica aislamiento kernel Host**.

**Estado de aceptación:** código/CLI/dashboard/documentación implementados; CI bajo verificación. No afirmar `CLOSED` hasta observar los gates del último commit, con referencia en [auditoría](../audit/m4-host-2026-10-19.md).
