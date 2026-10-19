# M4.2 — Host overlay sobre Site Operations

**Fecha:** 2026-10-19 · **Branch:** main · **Estado:** DOCUMENTED (contrato); implementación y aceptación pendientes de pruebas.

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
| M4.2.2.a | Site Operations compartido | Property permanece compatible bit a bit en tipos/IDs/campos; Host usa el mismo motor | M4.2.1 | PROPOSED |
| M4.2.2.b | Perfil Host allowlisted | Config Host / proceso y API local controlada | M4.2.2.a | PROPOSED |
| M4.2.2.c | Admission/health/recursos | Rechazos before-start y no false kernel isolation | M4.2.2.b | PROPOSED |
| M4.2.3.a | E2E real Host | HTTP → Supervisor/IPC → journal fsync → reopen → replay | M4.2.2 | PROPOSED |
| M4.2.3.b | Negativos | Token, invalidez, conflictos, out-of-budget, ausencia del proceso, sin WAN | M4.2.3.a | PROPOSED |
| M4.2.3.c | Dashboard, CLI y CI | `m4Host`, HTTP/UI test, ARM64/x64, auditoría | M4.2.3.b | PROPOSED |

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
