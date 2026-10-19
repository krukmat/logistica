# M4.3 — Commonality, recursos y resiliencia entre Property y Host

**Fecha:** 2026-10-19 · **Repositorio:** krukmat/logistica · **Rama:** main · **Estado:** VALIDATED software LAB (CI #39218335525); documentación de cierre pendiente del commit final.

## Propósito y restricciones

Se conserva el contrato Property histórico de M4.1 y Host de M4.2; ambos usan `src/core/site-operations.js`, el mismo journal OS-file con fsync, `createWorkloadSupervisor` y el worker estático `site-operations-worker.js`. Se evalúan fallos y costes de recursos sin instalar hardware, Cloud Lite ni modificar WAN del Mac. La ejecución completa está en `src/runtime/m4-commonality.js`, CLI `npm run m4:commonality` y Control Panel (Laboratorio integrado → M4.3).

| Task | Subtask | Evidencia y criterio DoD | Estado |
| --- | --- | --- | --- |
| M4.3.1 — Paridad | M4.3.1.a | Inventario rutas comunes, mismo Core/Supervisor/Journal/IPC | LAB PASS |
| | M4.3.1.b | Envelope Property previo reconstruido y reabierto sin migración, SHA y deduplicación válidas | LAB PASS |
| | M4.3.1.c | Separación por namespace, identidad, comando y ruta HTTP | LAB PASS |
| M4.3.2 — Resiliencia | M4.3.2.a | WAN virtual offline, ACK remoto ambiguo y duplicate replay real sobre HTTP | LAB PASS |
| | M4.3.2.b | Crash real de proceso Node y recovery, health/backoff/budget exhaustion con ProcessDriver sintético | LAB PASS |
| | M4.3.2.c | Almacenamiento lleno, fsync inyectado, cuotas, trust y ausencia de ACK falsos | LAB PASS |
| M4.3.3 — Medición | M4.3.3.a | Archivos y líneas clasificadas con denominador explícito | LAB PASS |
| | M4.3.3.b | RSS/CPU del child Node por IPC, tiempos HTTP/reinicio y bytes journal, con metodologías | LAB PASS |
| | M4.3.3.c | JSON único desde CLI/dashboard, tests/CI en ARM64/x64 y artifact | LAB PASS |

Dependencias: M4.1 → M4.2 → M4.3.1 → M4.3.2 → M4.3.3 → M4.4 (no iniciado).

## Matriz de evidencia y fidelidad

- **REAL_NODE_CHILD**: proceso allowlisted realmente termina y se recupera con supervisor; HTTP `/ready` y operaciones fallan cerradas durante BACKOFF, luego funcionan. *NODE_PROCESS_ONLY*, `actualLimitsEnforced=false`; no Linux sandbox de Property/Host.
- **SYNTHETIC_PROCESS_DRIVER**: inyección de health falso, reloj virtual, backoff exponencial y agotamiento de intentos con `ISOLATED`. Es una **prueba de política**, no un OOM/cgroup real.
- **REAL_TEMP_FILE_WITH_INJECTED_FSYNC_FAULT**: journal real en ruta temporal, falla inyectada por puerto `fsOps.fsyncSync`; el contenido escrito pero no confirmado queda **incierto**. No se devuelve ACK. Saturación con protección de reserva; no hay prueba de corte eléctrico físico.
- **SYNTHETIC WAN + LOCAL CLOUD MOCK**: se ejerce `LOCAL_ONLY`, perdida ambigua del ACK y replay duplicado autorizado; no se valida WAN, PKI ni Cloud remoto.

La comparación de recursos es **una observación puntual** por perfil: `workerBefore/After.rssBytes` son resident bytes reportados por el hijo; `cpuUserMicros/cpuSystemMicros` son CPU acumulada desde inicio, no porcentajes de ocupación ni límites kernel. `openHttpMs/ackHttpMs` incluyen latencia HTTP+IPC+fsync y polling de respuesta; `restartObserveMs` incluye el muestreo por sondeo y no es un SLA; `journalBytesBeforeReopen/AfterReplay` incluye eventos WAN y ACK remoto. Los límites de `propertyManifest/hostManifest` son reservas lógicas, **no enforcement**.

## LOC y commonality medida — muestra explícita, no el repositorio completo

La muestra `source.selectedPaths` contabiliza archivos de Core/Adapter/Runtime/worker utilizados por ambos perfiles, más fachada Property y worker antiguo sin uso activo (separado del denominador). Número de líneas físicas, incluidos blancos/comentarios, sin la última línea vacía:

- **9 archivos comunes activos**: **929 LOC**.
- **1 fachada específica Property**: **7 LOC**.
- **0 archivos específicos Host** en este conjunto (sus reglas están dentro del contrato compartido).
- **1 archivo legacy no utilizado por el registro activo** (`src/workloads/property-worker.js`): **12 LOC**, identificado pero no eliminado.
- Ratio reproducible **929/(929+7) = 99,25 %**, **sólo sobre estos 10 archivos activos seleccionados**; quedan fuera muchos módulos de PEF, tests, scripts, docs y líneas específicas dentro de archivos compartidos. No es estimación del porcentaje de reutilización de toda la arquitectura ni una meta de producto.

El reporte JSON contiene la lista completa y el cálculo `selectedRuntimeSharePercent`; M4.4 puede eliminar el worker legacy tras verificar referencias.

## Ejecución y aceptación

```bash
git switch main && git pull
npm test
npm run m4:commonality
npm run dashboard
# Laboratorio integrado -> botón "Ejecutar matriz M4.3 Property + Host"
```

Pruebas: `test/m4-commonality.test.js`, `test/dashboard-integrated.test.js` y gate `test/dashboard-integration-gate.test.js`. [CI #39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525): **ARM64 176/176**, **x64 175 pass + 1 skip**, `netns-lab` y prehardware gate PASS. [Artifact de laboratorio](https://github.com/krukmat/logistica/actions/runs/39218335525): `m4-commonality-lab-39218335525`, con todas las métricas de la misma ejecución. Las mediciones cambian entre entornos; leer los valores del artifact, no tratarlos como cifras globales.

## Trazabilidad y bloqueos

Task M4.3.1–M4.3.3. Requirement IDs: REQ-LOC-01, REQ-WRK-01/02/03, REQ-STA-01/02/03, REQ-OBS-01. Change: **added** (instrumentación y evidencia), Core compartido preservado. Classification: CORE/CONFIG/MODULE/RESOURCE. Estado: VALIDATED LAB ONLY por tests automatizados; device, real power cut, real Cloud, 72h y cuotas kernel Property/Host **BLOCKED/NOT_RUN**. [Auditoría](../audit/m4-commonality-2026-10-19.md). M4.4 no iniciado.
