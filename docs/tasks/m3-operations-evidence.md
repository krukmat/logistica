# M3.5–M3.6 — Diagnósticos de operación y evidencia integral

**2026-10-18 · main · software/lab · coste de infraestructura adicional previsto: 0 €.**

Dependencia: M3.3/M3.4 CLOSED en laboratorio (véase ../audit/m3-config-safe-mode-2026-10-18.md).
El diseño no autoriza administración remota, control del sistema operativo ni seguridad del dispositivo.

## Tasks, subtasks y DoD

| Task | Subtasks (máx. dos niveles) | Entregable y condición de cierre | Estado |
| --- | --- | --- | --- |
| M3.5 Diagnóstico | M3.5.1 proyección pura de estado/causa/presupuesto; M3.5.2 snapshots de fases y dashboard HTTP | Core sin IO ni secretos; Edge real muestra RUNNING → commit → SAFE_MODE → recuperación, con tests y CI PASS | CLOSED LAB — CI #39157645016 PASS |
| M3.6 Evidencia y vídeo | M3.6.1 artefacto técnico canónico con hashes; M3.6.2 HTML + WebM Playwright opt-in, runId y SHA256 verificables | Bundle de una sola sesión, gate negativo ante corrupción y vídeo de esa misma sesión validado en CI | CLOSED LAB — video verificado CI #39157645016 |

### Contratos

- M3.5 usa src/core/m3-diagnostics.js, sin llamadas a host ni credenciales. Exposición limitada a fases, revisión de política, presupuesto de reinicio, causa allowlisted y últimos 40 eventos recortados. El manager mantiene como máximo 64 eventos.
- Se conserva la política de M3.3 (solo maxRestarts/restartDelayMs/healthIntervalMs/healthFailures) y recoverLocal in-process de M3.4. No se implementa un endpoint remoto de recuperación.
- M3.6 ejecuta una vez el escenario real runM3RecoverySmoke, con daemon separado, SIGKILL, journal fsync, rollback y recuperación. No fabrica escenarios a partir de muestras estáticas.
- Los SHA256 verifican consistencia de ficheros y manifiesto; no constituyen firma, atestación externa ni prueba física. Un vídeo es reproducción visual del informe, no footage de hardware.
- La decisión de alcance afecta parcialmente REQ-SUP-01/02, REQ-REC-01, REQ-API-01 y REQ-STA-01. Clasificación: CORE para diagnósticos; CONFIG para la política ya limitada. No hay cambio de contrato de identidades ni de WAN.

### Entrada desde el Control Panel

Laboratorio integrado → M3.5–M3.6 → Ejecutar diagnóstico y demo integral. Flujo HTTP real: dashboard → m3Operations → createManagedEdge / Core → cuatro snapshots de diagnóstico → respuesta y panel. No se escriben bundles desde el servidor web.

### Comandos

```bash
git switch main && git pull --ff-only
npm test
npm run m3:bundle
# La CLI imprime la ruta real del bundle
npm run m3:bundle:verify -- artifacts/m3/<run-dir>
open artifacts/m3/<run-dir>/m3-operations.html
npm run dashboard
```

Vídeo opcional en el Mac (sin backend de pago):

```bash
npm install
npx playwright install chromium
npm run m3:bundle:video -- artifacts/m3/<run-dir>
npm run m3:bundle:verify-video -- artifacts/m3/<run-dir>
```

CI normal guarda m3-operations-evidence-<github.run_id> y verifica archivos/report/traza.
En GitHub Actions, workflow_dispatch → m3_video=true produce m3-operations-video-<github.run_id>. El vídeo debe verificarse contra el runId del informe generado en su propio job; no comparar IDs de runs distintos.

## Criterios de cierre M3 LAB

1. Pruebas Node completas ARM64 y x64 PASS, camino HTTP/UI PASS y diagnóstico sin secretos.
2. Bundle técnico generado y verificado por CI en HEAD de aceptación; rechazo ante una traza modificada.
3. Vídeo Playwright WebM generado/validado en el job opt-in con runId/hash del mismo report.
4. Auditoría registra hashes, run ID, límites y fallos restantes sin declarar dispositivo apto para producción.

**No demostrado:** arranque físico, firma PKI/OTA, Cloud Lite real, recuperación remota, apagón/flash powercut, NIC físicas, garantía 72 h o garantía de lock kernel del Mac. M4 puede diseñarse sin convertir M3 en producto certificado.

## Cierre — 2026-10-18

**M3.5 + M3.6 CLOSED exclusivamente en software/laboratorio.** [CI #39157645016](https://github.com/krukmat/logistica/actions/runs/39157645016): ARM64 160/160 PASS; Linux x64 159 PASS, 1 platform skip, 0 FAIL; network namespace, prehardware handoff, bundle técnico y captura Playwright WebM SUCCESS. El vídeo del job verificado corresponde al runId `d36cb47e-db36-4ee8-a0b9-7bfff1135310` (3.314.918 bytes, SHA256 `1890cf6529b79d1f27fef50325fd24282335c983dac7ff201c6477fd8f5772dd`). [Auditoría y límites](../audit/m3-operations-2026-10-18.md). No es prueba de dispositivo ni configuración firmada.
