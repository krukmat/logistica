# Auditoría M3.5/M3.6 — Operación, evidencias y demostración visual

**Fecha:** 2026-10-18 · **Repositorio:** krukmat/logistica, main · **Ejecución verificada:**
[GitHub Actions #39157645016](https://github.com/krukmat/logistica/actions/runs/39157645016).
**Commit bajo prueba:** `89d8511face80188c09520d7d4b69ee722731ede` (sobre implementación `98c918f46748857b2a205793c492bd236073f182`).

## Resultados

| Gate | Evidencia observada |
| --- | --- |
| Node ARM64 | 160/160 PASS, 0 FAIL, 0 skip |
| Node x64 | 159 PASS, 0 FAIL, 1 skip (específico de plataforma) |
| Linux netns / kernel lab | Job `netns-lab` SUCCESS |
| Prehardware handoff | Job `Pre-hardware software handoff` SUCCESS |
| M3.5 dashboard | Test HTTP para `m3Operations` PASS: cuatro snapshots desde Edge real, incluyendo SAFE_MODE |
| M3.6 technical | CLI `m3:bundle` y verificación independiente PASS; ZIP `m3-operations-evidence-39157645016` |
| M3.6 audiovisual | Job `m3-video-milestone` SUCCESS y `m3:bundle:verify-video` PASS; ZIP `m3-operations-video-39157645016` |

El vídeo de hito está ligado a la misma ejecución técnica *dentro del job de vídeo*, no al runner del artefacto técnico normal.

- Video runId: `d36cb47e-db36-4ee8-a0b9-7bfff1135310`.
- Archivo WebM verificado: 3.314.918 bytes.
- SHA-256 WebM: `1890cf6529b79d1f27fef50325fd24282335c983dac7ff201c6477fd8f5772dd`.
- Datos de base: `report.json`, `trace.ndjson`, resumen Markdown, HTML sólo lectura, manifiesto de contenido y SHA256SUMS de ese mismo runId.
- Integridad: la prueba unitaria rechaza manipulación de la traza; el hash no certifica procedencia por terceros.

## Decisión

**M3.5 y M3.6 CLOSED para software LAB**, completando M3.1–M3.6 en ese alcance. La evidencia positiva prueba recuperación funcional con un proceso Edge real, journal con fsync del host, revisión de política, health rollback, SAFE_MODE y recuperación local autenticada. El diagnóstico sólo refleja eventos allowlisted en memoria; no expone token o acceso remoto.

**No demostrado y aún BLOCKED/NOT_RUN para producto:** dispositivo físico, watchdog del sistema, exclusión kernel en Mac sin wrapper, configuración/identidad firmada, PKI, secure boot, OTA, corte eléctrico/microSD, WAN físicas, aislamiento persistente y Cloud Lite real. El archivo WebM es reproducción de evidencias instrumentadas, **no filmación de hardware**. Requisitos afectados sólo parcialmente: REQ-SUP-01/02, REQ-REC-01, REQ-API-01, REQ-STA-01.

**Siguiente bloque:** M4 Property/Host sobre el Core común y coste incremental de infraestructura 0 €. M2 hosted sigue DEFERRED por presupuesto. No requiere repetir la prueba M3 del Mac.
