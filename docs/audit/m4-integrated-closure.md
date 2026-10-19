# M4.4 — Auditoría de cierre software del MVP PEF

**Fecha:** 2026-10-19 · **Repositorio:** krukmat/logistica · **Rama:** main · **Estado:** CLOSED — SOFTWARE LAB ONLY. CI #39226414601 SUCCESS.

## Proceso y gates

- M4.1 Property: Edge standalone, fsync alerta+ACK, offline, reapertura, Cloud mock.
- M4.2 Host: segunda vertical, mismo motor Core, worker estático, fsync OPEN+ACK, offline, reapertura, Cloud mock.
- M4.3: contrato histórico, separación, process crash, backoff, storage lleno/fallo fsync, política admisión, pérdida ACK remoto y replay idempotente con métricas puntuales.
- M4.4: una sola ejecución reúne los tres reportes y **92 aserciones**; evidencia en `report.json`, `events.ndjson`, `summary.md`, `m4-integrated.html`, `manifest.json`, `SHA256SUMS`.
- `verifyBundle()` verifica SHA256, formato/controles/scope, consistencia runId/commit, archivos faltantes y contenido renderizado sin ejecutar de nuevo el Edge. Comprobar SHA256 **no prueba identidad/autoría**, ni añade firma.
- Dashboard action `m4Integrated` expone resultado de verificación y ruta local efímera; pruebas HTTP y de manipulación vinculadas al gate de UI.

## Resultado de CI

**CI #39226414601** ([enlace](https://github.com/krukmat/logistica/actions/runs/39226414601)): todos los jobs requeridos SUCCESS. Node ARM64 **178/178** PASS; Linux x64 **177 PASS / 1 skip**. El test `M4.4.1/2 one real Property+Host+M4.3 run builds SHA256 bundle and rejects tampering` y el HTTP dashboard E2E M4.4 PASS en ambos. El paso separado CLI creó un bundle nuevo con `m4:bundle`, verificó SHA256 con `m4:bundle:verify` y publicó artifacts **[x64](https://github.com/krukmat/logistica/actions/runs/39226414601/artifacts/12173203985)** y **[ARM64](https://github.com/krukmat/logistica/actions/runs/39226414601/artifacts/12173842813)**. `netns-lab` y `Pre-hardware software handoff` SUCCESS. M1/M3 video jobs omitidos intencionadamente. Los artifacts de distintas arquitecturas corresponden a **runs internos diferentes** (cada uno coherente consigo mismo), no a una única ejecución trans-arquitectura.

## Evaluación técnica

- Este paquete integra escenarios de software reales (procesos Node y journal host OS), no una simulación de éxito prefabricada.
- La traza NDJSON expone **aserciones** derivadas de los reports, no snapshots directos de eventos WAL/journal. No atribuirle una prueba física independiente adicional.
- La medición M4.3 es una muestra sintética; no SLA, benchmark estadístico, energía ni reutilización global del producto.
- No hay confianza criptográfica independiente de fuente: el SHA256 y el manifiesto pueden ser regenerados por el productor de los archivos.
- No hay certificación de cgroups Host/Property, 72 horas de persistencia, WAN/Cloud reales, PKI/OTA, powercut, hardware, cliente piloto ni SLA. M5 queda pendiente, sin compra ni gasto autorizado.

**Decision:** M4.4.1–M4.4.3 y bloque M4 **CLOSED — SOFTWARE LAB ONLY**. Se cumplieron los gates x64, ARM64, netns/prehardware, dashboard y verificador. No autoriza producción, contratación ni compra. M5 prepara el despliegue y ensayos físicos, de forma independiente.

## Resultado final trazable

- Commit funcional verificado: `91b5c52b9700d65a4672b8cebd2ccf3d907577a0`. Documentación posterior no cambia la lógica ejecutable.
- `M4_BUNDLE_VERIFIED_V1`: integridad `SHA256_NOT_SIGNATURE`; 4 archivos de contenido con digest; 92 controles de la misma ejecución para cada artifact.
- Operador Mac: `npm run m4:bundle` **LAB_PASS** reportado posteriormente; ver sección de evidencia local más abajo.
- Próximos riesgos de producto: kernel enforcement real para Property/Host, budget físico y energía, capacidad 72h, powercut, boot en dispositivo, WAN/Cloud remoto y seguridad de aprovisionamiento.

## Mac operator evidence — 2026-10-19

**Provenance:** operator-provided terminal output of `npm run m4:bundle`, distinct from CI. The CLI created a local M4.4 bundle and invoked its own verifier before returning success. The underlying bytes were **not uploaded or independently inspected** in this interaction. The command `m4:bundle:verify` has **not yet been separately reported** by the operator.

- CLI: `kind=PEF_M4_BUNDLE_CLI_V1`, `ok=true`.
- Local relative output: `artifacts/m4/run-AwrpYG` (Mac operator-reported; the original absolute home directory is intentionally omitted from this public record).
- Run ID: `aecea94d-b8c2-4461-b4a2-469e31ec2268`.
- Reported source commit: `fc113ccfa6f4c7dabfd9c0decbe969224474e6eb` (matches the M4.4 documentation closure baseline).
- Built-in verifier result: `kind=PEF_M4_BUNDLE_VERIFIED_V1`, `ok=true`, `status=LAB_PASS`, `assertions=92`, `files=4`, `physicalValidated=false`.
- `files=4` counts content files with hashes; the generated bundle also carries `manifest.json` and `SHA256SUMS` for **six files total**.
- `integrity=SHA256_NOT_SIGNATURE`: hash-relative integrity and cross-file checks are software lab checks, not proof of source authenticity or operator signing.
- All conclusions retain the existing constraints: virtual WAN, local Cloud mock, no Property/Host Linux kernel isolation, no physical powercut, device, PKI or 72-hour retention validation.

**Result:** operator Mac smoke `LAB_PASS` recorded; M4.1–M4.4 remain **CLOSED — SOFTWARE LAB ONLY**, with independent CI results linked above. M5 device/installation validation remains open.
