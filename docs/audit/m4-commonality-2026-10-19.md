# M4.3 Property/Host — auditoría de paridad, fallos y commonality

**2026-10-19** · Repository krukmat/logistica, main · **CLOSED — SOFTWARE LAB ONLY** (CI de código [#39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525) SUCCESS).

## Aceptación ejecutada

| Prueba / evidencia | Property | Host | Fidelidad |
| --- | --- | --- | --- |
| Envelope histórico de Property, checksum y reapertura | PASS | separación PASS | OS-file real |
| Rechazo de comandos cruzados, identidad y HTTP token | PASS | PASS | Domain + HTTP real |
| Autónomo `LOCAL_ONLY`, open/alert y ACK con fsync | PASS | PASS | WAN sintética, journal OS real |
| Crash de Node, BACKOFF, readiness 503, operación rechazada y recovery | PASS | PASS | Worker real, no sandbox |
| Health falla, retry/backoff y presupuesto agotado `ISOLATED` | PASS | PASS | Supervisor, reloj y driver sintéticos |
| Storage cap y reserva, fallo fsync, no false ACK | PASS | PASS | FS real con fallo inyectado |
| Admisión por CPU insuficiente y trust falso | PASS | PASS | Política sin cuotas kernel |
| Remote ACK perdido, pending conservado, replay duplicado | PASS | PASS | Cloud mock (no WAN remota) |
| Dashboard HTTP -> ejecución real -> estado visible | PASS | PASS | `test/dashboard-integrated.test.js` |
| x64 y ARM64 | PASS | PASS | [CI #39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525) |

**CI resumen:** ARM64 **176/176 PASS**; x64 **175 PASS + 1 skip ARM-only**; `netns-lab` y prehardware gate SUCCESS. La prueba sintética nunca se etiqueta kernel certificado.

## Medición de código realizada en los archivos seleccionados

| Clasificación | Archivos | LOC físicas |
| --- | ---: | ---: |
| CORE/adapter/runtime/worker compartido, activo | 9 | 929 |
| Fachada específica Property para compatibilidad | 1 | 7 |
| Host específico como archivo individual de esa muestra | 0 | 0 |
| Worker Property legacy fuera del registro activo (excluido de ratio) | 1 | 12 |

**929 / (929 + 7) = 99,25 %** en la **muestra de 10 archivos activos elegidos**, no reutilización global del repositorio o del producto. Los perfiles siguen conteniendo ramas distintas dentro de archivos comunes. Los recuentos provienen de lectura de los archivos actuales y son reproducibles con `npm run m4:commonality` en `source.selectedPaths`; no utilizar como SLA ni benchmark de arquitectura comercial.

## Recursos observados y método

El artifact [M4.3 en CI #39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525) contiene `profiles.property.runtime.observedMetrics` y `profiles.host.runtime.observedMetrics`: RSS/CPU acumulada del proceso Node bajo IPC, tiempos HTTP de OPEN/ALERT y ACK, milisegundos observados hasta restart y ocupación de journal antes/después del replay. **Los valores exactos dependen del entorno de ejecución**; la auditoría conserva los campos y la procedencia del artifact sin inventar promedios o percentiles. Los recursos de los manifests son límites declarados del manager, no imposiciones del SO.

## Hallazgos y siguientes decisiones

- Ambos perfiles comparten `site-operations.js`, contrato, journal, supervisor, Edge HTTP y Cloud mock. Se observó la misma matriz de fallos para los dos.
- Existe `src/workloads/property-worker.js` (12 LOC) sin referencia activa en el allowlist; comprobar referencias y valorar borrado en M4.4, sin asumir por ello deuda de rendimiento.
- Las pruebas de fallos fsync sólo demuestran rechazo seguro; una escritura anterior al fsync puede haber alcanzado disco y no se afirma su recuperación como duradera.
- La observabilidad obtiene CPU/RSS directamente del proceso; no se certifican cgroups/netns/chroot para estos dos workers, CPU/RAM máxima real, duración offline de 72h, WAN física, powercut ni Cloud Lite remoto.
- M4.4 demostración conjunta y firma del bundle de evidencia **pendiente**. M4.3 cerrado únicamente en laboratorio; no implica habilitar producción ni compras.

[Contrato, tasks y límites](../tasks/m4-commonality-resilience.md).

## Muestras cuantitativas de CI (misma ejecución)

[CI #39219003980](https://github.com/krukmat/logistica/actions/runs/39219003980), job `emulator`, imprimió `M4_MEASURED` tras crear el artifact `m4-commonality-lab-39219003980`. Los números se transcriben de **esa ejecución** (Linux x64 GitHub-hosted), no de tu Mac ni de un device PEF.

| Métrica | Property | Host | Unidad/alcance |
| --- | ---: | ---: | --- |
| RSS inicial del worker | 46.141.440 | 46.264.320 | bytes, hijo Node |
| RSS después de recuperación | 46.268.416 | 46.231.552 | bytes, **nuevo proceso** |
| CPU user inicial | 13.641 | 15.385 | µs acumulados del worker inicial |
| CPU system inicial | 5.846 | 5.128 | µs acumulados del worker inicial |
| HTTP ALERT/OPEN | 7,051 | 2,200 | ms de esta única petición |
| HTTP ACK | 2,071 | 1,632 | ms de esta única petición |
| Restart observado (polling) | 1.091,33 | 1.159,08 | ms, proceso y ventana de supervisión |
| Journal antes de reapertura | 1.647 | 1.596 | bytes del journal local |
| Journal tras replay | 4.079 | 3.967 | bytes, incluye registros CLOUD_ACK |

El aumento de bytes tras replay es **esperado**: un cursor de Cloud ACK también se registra de forma duradera, aunque no queden eventos pendientes. Los contadores CPU de los workers antes y después **no son una serie temporal de un solo PID**; se reinició el proceso. Se trata de una muestra mínima de CI sin calentamiento, percentiles, repetición estadística, límite de memoria del dispositivo, energía ni cargas reales. Se preserva el JSON por ejecución y los métodos/campos en [task](../tasks/m4-commonality-resilience.md).


## Operator Mac smoke — reported 2026-10-19

**Provenance:** operator-provided terminal output from `npm run m4:commonality` on Mac. This is reported local evidence, **not** automatically captured/signed hardware telemetry. GitHub-hosted CI observations above remain separate. A single invocation, not a benchmark series.

- `kind=PEF_M4_COMMONALITY_RESILIENCE_V1`, `status=LAB_PASS`, `ok=true`.
- **65/65 boolean checks true**: 9 parity checks; for each profile 15 runtime checks + 8 supervisor-policy checks + 5 storage-fault checks. Both `profiles.property.passed=true` and `profiles.host.passed=true`.
- Parity: legacy Property envelope and `originalDigest=1b0c34dbea05f1401ed46bed96e197565940f7e9d35d5e118df2eb2ad99fdc9c` maintained, old events reopened, Host/Property namespaces and identities separated; 2 retained fixture events.
- Both profiles: real Node child crash and restart, fail-closed while down, health/retry exhaustion with synthetic process driver, injected fsync failure with no acknowledgement, offline operation, lost remote ACK and duplicate replay against Cloud mock; **0 pending after replay per profile**.

| Mac observation | Property | Host | Units / interpretation |
| --- | ---: | ---: | --- |
| Worker RSS before crash | 42,352,640 | 42,123,264 | bytes; separate child processes |
| Worker RSS after restart | 42,139,648 | 42,057,728 | bytes; new child processes |
| CPU user before crash | 14,468 | 19,089 | microseconds cumulative since individual worker start |
| CPU system before crash | 3,746 | 4,111 | microseconds cumulative |
| HTTP ALERT/OPEN | 7.265 | 6.302 | ms, single request |
| HTTP ACK | 6.247 | 6.318 | ms, single request |
| Backoff observation | 44.47 | 43.03 | ms, polling observation |
| Restart observation | 1,190.98 | 1,172.40 | ms, polling observation (not SLA) |
| Journal before reopen | 1,647 | 1,596 | bytes |
| Journal after Cloud mock replay | 4,079 | 3,967 | bytes; persisted CLOUD_ACK cursor records |
| Events pending after replay | 0 | 0 | local journal pending queue |

- The source selection contains **9 shared active files, 929 LOC**, **1 Property compatibility façade, 7 LOC**, **0 separate Host-specific files** and **1 unused legacy candidate, 12 LOC excluded**. Reported ratio **99.25% = 929/(929+7)** strictly for this *selected active-file sample*, including full lines in shared files; it is **not** whole-project, semantic or runtime reuse. Source SHA/size measurements follow the report's explicit methodology.
- Manifests express policy reservations only (Property: CPU 80/150 mCPU, RAM 24/64 MiB, storage 4/16 MiB; Host: 100/180 mCPU, 32/80 MiB, 8/24 MiB). `NODE_PROCESS_ONLY`, `kernelLimitsEnforced=false`, `actualLimitsEnforced=false`, `network=SYNTHETIC`, `cloud=LOCAL_MOCK`. No actual power cut, device certification, kernel isolation for Property/Host, remote Cloud or 72-hour endurance.
- The injected fsync failure returns **no ACK** but leaves write durability uncertain: do not claim the disk contains no bytes after failure.

**Decision:** M4.3 remains **CLOSED — SOFTWARE LAB ONLY**; operator Mac evidence now supplements GitHub CI [#39219003980](https://github.com/krukmat/logistica/actions/runs/39219003980). **M4.4 remains not started**: joint signed/hash-verified evidence package and integral product demonstration. No rerun on Mac is required solely to document this result.
