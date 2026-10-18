# M3.1–M3.2 — Autonomous Edge boot, supervisor and single-writer guard

**Fecha:** 2026-10-18. **Alcance:** software/CI y VM Linux; **sin hardware físico, compras, hosting, Cloud Lite ni privilegios sobre el Mac**. `main`.

## Resumen y dependencias

M1 demostró el recorrido offline/fsync/SIGKILL/replay de un Edge ejecutado manualmente. M3 incorpora un proceso supervisor **headless real**, que no depende del dashboard ni del mock Cloud para arrancar. Conserva `src/runtime/autonomous-edge.js`, `src/core/workload-supervisor.js`, `src/runtime/single-writer.js` y el journal existentes. No crea otra política de WAN o supervisor de dominio.

| Task | Subtasks (máximo dos niveles) | Inputs / dependencias | Entregable / DoD | Estado |
| --- | --- | --- | --- | --- |
| **M3.1 — Boot & Lifecycle** | **M3.1.1:** supervisor externo Node, readiness HTTP y parada señalizada; **M3.1.2:** reinicio automático tras proceso caído, backoff y budget finito | M1, `pef-edge.js`, supervisor de workload | `m3:supervise` reinicia Edge real con mismo storage; SIGTERM detiene; no dependencia dashboard/cloud | IMPLEMENTADO, pruebas CI |
| **M3.2 — Process Safety** | **M3.2.1:** `/ready` comprueba estado journal, runtime y receiver; **M3.2.2:** wrapper Linux `flock` conserva lock de directorio durante vida supervisor y rechaza competidor | M3.1, util-linux `flock` en Linux (sin root) | Linux CI verifica exclusión kernel dentro del wrapper; Mac retiene protección advisory PID; fail closed si otro escritor | IMPLEMENTADO, pruebas CI |

**Requisitos vinculados:** `REQ-REC-01` recuperación acotada, `REQ-SUP-01` estado/supervisión, `REQ-STA-01` durabilidad ACK, `REQ-WRK-01` ciclo de workloads y `REQ-API-01` readiness autenticada. Clasificación CORE, sin cambio en el contrato externo de P1 ni en la cuota de 100MiB.

## Ejecución

**Prueba autosuficiente, sin servicios externos ni credenciales:**

```bash
cd ~/logistica
git switch main && git pull --ff-only
npm run m3:evidence
npm test
npm run dashboard
```

En el dashboard, **Laboratorio integrado → M3.1–M3.2 → Ejecutar prueba M3 headless**. Inicia una instancia aislada con storage temporal, recibe un paquete en modo `LOCAL_ONLY`, mata el proceso Edge real, verifica el reinicio y la persistencia, detiene el supervisor. El JSON `PEF_M3_LIFECYCLE_SMOKE_V1` distingue bloqueo Linux como CI-only, no como prueba hecha en el Mac.

**Servicio real de laboratorio con un manifiesto v1 previamente preparado** (ver [21 — Autonomous Edge](../21-autonomous-edge-handoff.md) para formato):

```bash
export PEF_EDGE_TOKEN="$(openssl rand -hex 32)"
npm run m3:supervise -- --config /ruta/absoluta/al/edge-config.json
```

El supervisor controla el subproceso real `bin/pef-edge.js`, emite líneas `PEF_M3_LIFECYCLE_V1` (sin tokens) y conserva el mismo storage entre reinicios. `Ctrl+C` inicia parada ordenada. Las revisiones de configuración *no* se mutan ni actualizan aquí; M3.3 las tratará más adelante.

**Linux con exclusión kernel durante toda la vida del supervisor:**

```bash
bash scripts/m3/linux-locked-supervisor.sh /ruta/absoluta/al/edge-config.json
```

Requiere `PEF_EDGE_TOKEN` exportado, Node y `flock`. **La ruta deberá existir**; el script valida `edge-config`, abre un FD del directorio real validado y aplica `flock -n`; otro wrapper sobre ese directorio debe devolver **exit code 75**. El lock se libera al terminar el supervisor. Este contrato **solo asegura exclusividad entre instancias cooperativas que usan el wrapper**; no impide procesos privilegiados, invocaciones directas que omitan `flock`, corrupción del medio, ni reemplaza fencing del dispositivo.

Existe el ejemplo [systemd](../../ops/systemd/pef-m3-headless.service.example) **solo como referencia revisable; NO se instala ni habilita**. El sistema de arranque en hardware permanece por seleccionar.

## Evidencia / criterios de aceptación

- `test/m3-process-manager.test.js` verifica start/crash real, persistencia fsync/reopen, idempotencia y parada, presupuesto máximo de reintentos que termina en `HALTED`, token/política incorrectos y contención `flock` Linux.
- `test/dashboard-integrated.test.js` ejecuta HTTP real a dashboard → acción `m3Lifecycle` → mismo `runM3LifecycleSmoke` → JSON y UI.
- CI nativo Linux y ARM64 ejecutan tests; job `emulator` además publica artefacto **`m3-autonomous-lifecycle-<github.run_id>`** con salida del comando `m3:evidence`.
- Estado de aceptabilidad: **LAB_PASS** solo cuando CI verifica escenario y exclusión de Linux. No inferir boot en device, seguridad del enclavamiento hardware, cgroup de proceso en Mac, disponibilidad 72h, Cloud Lite ni arranque seguro.

## Riesgos abiertos / no incluidos

1. El cierre de `flock` sin wrapper o la ejecución de un `pef-edge.js` directo no queda excluida por kernel. `single-writer.js` sigue siendo advisory y el mecanismo de fencing/producto debe validarse en hardware.
2. El supervisor emite `HALTED` tras agotar el número de reinicios; **no reinicia eternamente** ni realiza operaciones remotas. La intervención del operador y las políticas de `SAFE_MODE` corresponden a M3.4.
3. El proceso supervisor requiere OS/runtime y no se ha instalado como servicio de boot real; el ejemplo systemd es orientativo. M3.3–M3.6 no se cierran con M3.1/M3.2.
4. El `flock` sobre FD de directorio se probó solamente en Linux CI; el Mac usa arranque Node sin exclusión de kernel. No hay credenciales, arranque Linux ni despliegue de production provisionados.

**Siguiente bloque:** M3.3 configuración transaccional y M3.4 rollback/safe-mode con nuevas pruebas, sin comprar hosting.
