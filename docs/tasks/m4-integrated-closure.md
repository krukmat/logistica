# M4.4 — Demonstración integral y cierre de M4 software

**Fecha:** 2026-10-19 · **Rama:** main · **Estado:** M4.4.1–M4.4.3 CLOSED — SOFTWARE LAB ONLY. CI #39226414601 SUCCESS.

## Alcance

No añadir nuevos componentes de Core. Orquestar M4.1 Property y M4.2 Host mediante Edge HTTP standalone, procesos allowlisted y journal fsynced, más matriz de M4.3 paridad/resiliencia. Emplear WAN sintética, Cloud mock y archivos temporales independientes. No se considera ensayo de hardware.

| ID | Dependencia | Entregable/criterio DoD | Estado |
| --- | --- | --- | --- |
| M4.4.1.a | M4.1/M4.2 | Ejecución única secuencial con identidades Edge distintas por vertical | CLOSED LAB |
| M4.4.1.b | M4.3 | Paridad, crash real Node, recuperación, ACK, fsync, fallos y replay mock | CLOSED LAB |
| M4.4.1.c | .1.a/.1.b | Report LAB_PASS solo si todos los checks obligatorios pasan | CLOSED LAB |
| M4.4.2.a | M4.4.1 | report.json, events.ndjson (aserciones), metadata de misma ejecución | CLOSED LAB |
| M4.4.2.b | .2.a | manifest SHA256, SHA256SUMS y verifier sin confianza en navegador | CLOSED LAB |
| M4.4.2.c | .2.b | summary.md y HTML estático regenerables, sin scripts ni red | CLOSED LAB |
| M4.4.3.a | M4.4.2 | Dashboard botón m4Integrated → API real → paquete temporal verificable y estado | CLOSED LAB |
| M4.4.3.b | .3.a | CI x64/ARM64, prueba de alteración/archivo ausente y artifact por plataforma | CLOSED LAB |
| M4.4.3.c | .3.b | README, roadmap, auditoría; no elevar un PASS virtual a device/production | CLOSED LAB |

## Implementación

- `src/runtime/m4-integrated.js` invoca los **runners reales existentes**, nunca simula de nuevo Property/Host. `runM4Integrated()` genera un `runId`, una sola fecha de ejecución y commit, valida ambos `LAB_PASS` y M4.3, rechaza estados inconsistentes.
- `src/runtime/m4-evidence-bundle.js` escribe un directorio de salida nuevo `run-*` y comprueba integridad y coherencia cruzada. `events.ndjson` contiene **92 aserciones de los runners**, rotuladas `SCENARIO_CHECK_NOT_RAW_JOURNAL_EVENT`: NO son un dump del journal ni la prueba física de fsync.
- `manifest.json` fija nombre, bytes y SHA256 de los 4 archivos de contenido. `SHA256SUMS` acompaña el paquete y se comprueba. Verificador además reconstruye aserciones, summary y HTML para detectar modificaciones incoherentes incluso con manifiesto recomputado. Un atacante capaz de regenerar todo el paquete todavía puede falsificarlo: **no hay firma ni autenticación de origen**.
- `m4-integrated.html` es una vista local de solo lectura, sin JavaScript ni solicitudes externas. El panel `Laboratorio integrado → M4.4` ejecuta `createBundle()` vía acción `m4Integrated` y presenta resultado, SHA-256 comprobado y `bundleDir`. Ese directorio es **efímero** y se borra al reset/cierre del laboratorio. Ejecutar CLI para conservar copia persistente.
- Contrato `docs/contracts/m4-evidence-v1.json`; gate del emulador `docs/contracts/emulator-integration-v1.json`; negativos/runner `test/m4-integrated.test.js` y dashboard HTTP `test/dashboard-integrated.test.js`.

## Comandos

```bash
git switch main && git pull
npm test
npm run m4:bundle
# Copiar "dir" absoluto desde la salida CLI
npm run m4:bundle:verify -- /ruta/absoluta/artifacts/m4/run-...
npm run dashboard
# Laboratorio integrado → M4.4 → Ejecutar M4.4 y verificar bundle
```

También `npm run m4:bundle -- --output-root /ruta/absoluta`. El runner falla cerrado y borra paquetes incompletos cuando no se cumplen controles.

## Aceptación y límites

Se exigen checks de Property **13/13**, Host **14/14**, M4.3 **65/65**; total **92 aserciones**, aunque contadores específicos del Core/otros gates pueden cambiar separadamente. Cada overlay queda en `NODE_PROCESS_ONLY`, `actualLimitsEnforced=false`; no Cloud remoto, WAN física, PKI, aislamiento kernel Property/Host, powercut, retención 72h, sensores, PMS o certificación de producto. El porcentaje de LOC reutilizado se refiere solo a muestra elegida M4.3, no al producto.

**Requisitos:** REQ-LOC-01, REQ-WRK-01/02/03, REQ-STA-01/02/03, REQ-OBS-01. **Change:** added evidence integration. **Classification:** MODULE + CONFIG; ningún Core nuevo. **Evidence:** [auditoría](../audit/m4-integrated-closure.md), workflow `.github/workflows/pef-emulator.yml`. M5 instalación e integración de dispositivo requiere gate independiente.

### Registro de aceptación CI (2026-10-19)

Se verificó que `npm run m4:bundle -- --output-root artifacts/m4-ci` generó el paquete y `npm run m4:bundle:verify -- "$bundle"` lo revalidó en el runner. ARM64 ejecutó el mismo flujo independientemente. [CI #39226414601](https://github.com/krukmat/logistica/actions/runs/39226414601): `emulator`, `arm64-isa`, `netns-lab`, `Pre-hardware software handoff` **SUCCESS**. Ambos tests nuevos (bundle tamper y dashboard HTTP) PASS en las dos arquitecturas. Artifacts: [x64](https://github.com/krukmat/logistica/actions/runs/39226414601/artifacts/12173203985) y [ARM64](https://github.com/krukmat/logistica/actions/runs/39226414601/artifacts/12173842813). **No hay smoke M4.4 reportado todavía desde el Mac del operador.**
