# M4.4 — Auditoría de cierre software del MVP PEF

**Fecha:** 2026-10-19 · **Repositorio:** krukmat/logistica · **Rama:** main · **Estado:** IMPLEMENTED, CI final pendiente.

## Proceso y gates

- M4.1 Property: Edge standalone, fsync alerta+ACK, offline, reapertura, Cloud mock.
- M4.2 Host: segunda vertical, mismo motor Core, worker estático, fsync OPEN+ACK, offline, reapertura, Cloud mock.
- M4.3: contrato histórico, separación, process crash, backoff, storage lleno/fallo fsync, política admisión, pérdida ACK remoto y replay idempotente con métricas puntuales.
- M4.4: una sola ejecución reúne los tres reportes y **92 aserciones**; evidencia en `report.json`, `events.ndjson`, `summary.md`, `m4-integrated.html`, `manifest.json`, `SHA256SUMS`.
- `verifyBundle()` verifica SHA256, formato/controles/scope, consistencia runId/commit, archivos faltantes y contenido renderizado sin ejecutar de nuevo el Edge. Comprobar SHA256 **no prueba identidad/autoría**, ni añade firma.
- Dashboard action `m4Integrated` expone resultado de verificación y ruta local efímera; pruebas HTTP y de manipulación vinculadas al gate de UI.

## Resultado de CI

**Pendiente de verificar último commit de implementación y documentación.** No atribuir PASS antes de los jobs terminales. Fuente: `.github/workflows/pef-emulator.yml`. El workflow carga artifacts `m4-integrated-evidence-x64` y `m4-integrated-evidence-arm64` con datos de un run por arquitectura.

## Evaluación técnica

- Este paquete integra escenarios de software reales (procesos Node y journal host OS), no una simulación de éxito prefabricada.
- La traza NDJSON expone **aserciones** derivadas de los reports, no snapshots directos de eventos WAL/journal. No atribuirle una prueba física independiente adicional.
- La medición M4.3 es una muestra sintética; no SLA, benchmark estadístico, energía ni reutilización global del producto.
- No hay confianza criptográfica independiente de fuente: el SHA256 y el manifiesto pueden ser regenerados por el productor de los archivos.
- No hay certificación de cgroups Host/Property, 72 horas de persistencia, WAN/Cloud reales, PKI/OTA, powercut, hardware, cliente piloto ni SLA. M5 queda pendiente, sin compra ni gasto autorizado.

**Decision:** cierre de M4 únicamente en laboratorio si CI x64, ARM64, netns/prehardware y prueba HTTP/digest completan sin fallos; no autoriza producción.
