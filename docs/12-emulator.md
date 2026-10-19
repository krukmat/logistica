# 12 — PEF Virtual Edge Emulator (W1.9)

**Estado:** IMPLEMENTED — emulador lógico y Product Core de referencia (WAN, journal/replay, recepción) con adaptadores inyectados, CI VERIFIED; **no dispositivo productivo ni validación de hardware**. Fuente: `src/emulator/core.js`, `src/emulator/scenario.js`, `bin/pef-emulator.js`, `scenarios/*.json`, `test/emulator.test.js`. [Plan granular](tasks/w1.9-emulator-execution.md). Contratos antecedentes: [W1.6 runtime](09-runtime-contract.md), [W1.7 harness](10-benchmark-harness.md), [W1.8 shootout](11-architecture-shootout.md).

## Por qué ahora

Un solo emulador de **estado y comportamiento** permite verificar decisiones de contrato (quién controla WAN, qué pasa con un ACK, cuándo rechazar un workload, cómo se recupera una revisión de configuración) sin pedir hardware previamente. El siguiente paso será instalar adapters Linux/physical sobre esos mismos escenarios y distinguir desviaciones del modelo. **No reemplaza** límites físicos de red, potencia, medios persistentes ni térmica.

## Uso

Requiere **Node.js ≥20**; sin dependencias NPM externas, Docker, root ni configuración WAN.

```bash
npm test                              # suite node:test
npm run emulate                       # todos los escenarios; JSON + trace
npm run smoke                         # tests + escenarios
node bin/pef-emulator.js scenarios/wan-offline.json
```

Salidas: `SIM_PASS` y `SIM_FAIL`. **No equivalen a `PASS` o `FAIL` físico W1.7**. Un escenario `SIM_PASS` confirma solamente que el modelo ejecuta las transiciones/oráculos declarados; no verifica que el dispositivo real los cumpla. Las trazas usan reloj lógico `t`, no latencia p95/p99.

## W1.9.A — Emulated Core / clocks

Modelo determinista `createSimulator(config)`, acciones `act(name,args)` y observables `status()`, `trace()`, `getCommitted()`, `getCloud()`. Separación de `health`, `connectivity`, `cloud`, `security`. WAN actual por link+upstream, prioridad y ventana de failback. `tick` avanza reloj lógico; `set_wan` altera la condición del transporte y la siguiente muestra `tick` reconciliará. `LOCAL_ONLY + HEALTHY` es válido.

## W1.9.B — Journal, workloads y recovery

`append` guarda registros en P1 **simulado**; `ack=true` sólo si se admitió en el array de committed y en la cuota lógica. `prepare_append` no obtiene ACK; `power_cut` borra prepared y conserva committed. Esto **no prueba fsync, barreras, flush o flash**, ni representa un reboot real de máquina.

`sync` sube IDs a Cloud virtual y deduplica replays después de `dropLocalAck:true`. El mecanismo simplificado libera registros locales al confirmar ACK; **retención local extendida O0/O1, hashes criptográficos, protección física de identity y cursores transaccionales quedan pendientes**.

`admit` modela budgets CPU/RAM y quota P2 con allowlist mínima de Network Intent. `write_workload` aplica cuota lógica, y un workload `ISOLATED` deja de escribir. La CPU **no se limita físicamente**, el esquema JSON externo no se valida íntegramente en esta implementación y no se ejecutan procesos de workloads. `crash_workload` cuenta intentos dentro de ventana; modelo de backoff/temporizador real pendiente. `apply_config` simula health-check y rollback (no cambia red real ni software/boot slot).

## W1.9.C — Escenarios automatizables

| ID | Comportamiento ilustrado | Evidencia |
|---|---|---|
| EMU-WAN-OFFLINE | upstream caído con carrier-up, failover, all-WAN `LOCAL_ONLY`, replay al volver | trace WAN, health, journal |
| EMU-JOURNAL-POWER | ACK y `power_cut` modelado, rechazo al llenarse P1 | committed/unacknowledged/pressure |
| EMU-WORKLOAD-ISOLATION | admission, network intent privilegiado denegado, storage P2, crash-loop | códigos de error + workload isolated |
| EMU-TRUST-ROLLBACK | config unhealthy rechazada, aislamiento remoto sin perder local | revision + security |
| EMU-FAILBACK | histéresis lógica antes de volver a la primaria | selected WAN + clock |
| EMU-CLOUD-REPLAY | Cloud ACK persistido pero cursor local incierto | dedup + pending events |
| EMU-EVENT-COLLISION | rechazo de mismo event_id con payload discordante antes/después de sync | no false ACK |

El motor y los escenarios iniciales se contrastaron en JS aislado. **GitHub Actions Node 22 verificó 8/8 tests y 7/7 escenarios `SIM_PASS`**, sin fallos, en la [ejecución 38232898592](https://github.com/krukmat/logistica/actions/runs/38232898592). Son comprobaciones lógicas del código, **no benchmarks físicos ni validación del PEF Core real**. El [CI posterior con selección de backends](https://github.com/krukmat/logistica/actions/runs/38233315161) pasó **9/9 tests y 7/7 escenarios**, sin fallos. [Evidencia y alcance](audit/w1.9-emulator-smoke-2026-10-12.md). Los cambios posteriores deben mantener estos gates en verde.

## W1.9.D — Hardware adaptation seams

Ya existe el **punto de extensión `openBackend(kind, config)`** que sólo implementa `sim`; las variantes `linux-lab` y `device` están declaradas pero son `SIM_BLOCKED` hasta contar con drivers y preflight seguros. El próximo corte deberá implementar los puertos físicos/lab sin introducir bifurcaciones en los contratos de escenario. El aislamiento Linux requerirá Linux VM/container en macOS; **las network namespaces de Linux no existen nativamente en macOS**. El target Mac puede orquestar una VM Linux/runner, pero no asumimos aún software de virtualización.

| Port futuro | Driver sim v0.1 | Linux lab posterior | Hardware posterior |
|---|---|---|---|
| `Clock` | contador `tick` | monotonic real/virtual clock | timers reales/UTC |
| `WanProbe` | link+upstream flags | namespace/veth/route fault injection | NIC/PHY/modem probe |
| `NetworkPolicy` | selección de WAN solamente | routing/NAT/firewall en lab | NIC/offload/fw validation |
| `Journal` | array P1/bytes virtuales | durable store filesystem sandbox | flush, powercut, media endurance |
| `WorkloadLimiter` | admission / quota simulada | cgroups/quota con fixtures | CPU/RAM/thermal/IO reales |
| `RecoveryBoot` | `power_cut` lógico | restart/VM snapshot | boot slot + power relay |
| `CloudTransport` | set available / sync ID dedup | endpoint mock en red separada | authenticated transport |

**Prohibición:** ni el simulador ni futuros fault drivers pueden alterar por accidente la configuración host, WAN doméstica o sistemas productivos. El runner Linux/physical exige lab preflight, target allowlist, snapshot/restore, permisos explícitos y pruebas sin blast radius externo.

## Reglas para ajustar implementación física

1. Cuando exista driver `linux-lab`, ejecutar **los mismos IDs/oráculos de escenario** y comparar con la ejecución simulada.
2. Clasificar diferencias `MODEL_BUG`, `IMPLEMENTATION_BUG`, `PLATFORM_LIMIT`, `TEST_HARNESS_ERROR` o `UNVERIFIED`; ajustar requisitos sólo mediante ADR.
3. Nunca ascender `SIM_PASS` a `VALIDATED` de W1.8; registrar separado: `sim`, `linux-lab`, `device`, y evidencia `t0/t1`, versión, driver y hashes.
4. Mantener W1.8.E–G `BLOCKED` hasta runtime PEF real, harness con aislamiento y hardware medido. **W1.9 desbloquea la parte de diseño/programación, no la certificación de hardware.**

## Riesgos actuales / refinamientos

- Modelo de WAN no transporta paquetes: no valida 1 Gbps, conntrack, p95 real ni DNS/firewall.
- Durability, powercut, cuotas y Cloud ACK son simulaciones: no acreditan P0/P1 ni zero-loss real.
- El modelo rechaza colisiones de `event_id` con payload discordante antes/después de sync (comparación serializada, **no hash criptográfico**). La validación total del JSON Schema y enforcement real siguen pendientes; W1.9.E debe incorporar un validator completo.
- Retención post-sync O0/O1, boot/OTA firmado, backoff temporal real y controles de estrés de I/O quedan por implementar.
- El emulador debe **evolucionar con la implementación** y producir fixtures comparables, no convertirse en una segunda arquitectura independiente.

## Diagramas de conectividad y siguiente laboratorio

[13 — Conectividad PEF](13-connectivity-topology.md) incluye el wiring abstracto del gateway, estados WAN, failover/failback, separación de planos y recorrido `sim → loopback-lab → linux-lab → device`. El siguiente bloque desarrolla un laboratorio TCP/HTTP localhost de alcance explícito, sin root ni interfaces reales.

## W1.9.F — Loopback connectivity lab (Node.js localhost)

`npm run lab:loopback` inicia dos servicios HTTP en `127.0.0.1` con **puertos efímeros**, los sondea por TCP/HTTP y alimenta la máquina de estados del emulador. Inyecta 503, timeout sin respuesta y reset TCP, verifica selección primaria/respaldo, `LOCAL_ONLY`, evidencia y replay. No requiere Linux, Docker, root, NAT, rutas del host ni conexión Internet.

**Fuente:** `src/emulator/lab/loopback.js`; tests `test/loopback-lab.test.js`. [CI de loopback](https://github.com/krukmat/logistica/actions/runs/38253176876): 12/12 tests, 7/7 escenarios SIM_PASS y loopback LAB_PASS. [Audit](audit/w1.9-loopback-smoke-2026-10-12.md). Estado `LAB_PASS/LAB_FAIL`, deliberadamente distinto de `SIM_PASS` y del `PASS` físico de W1.7. El laboratorio confirma que hay tráfico real hacia *servidores loopback*, pero el failover de las rutas y la WAN seleccionada **continúan siendo decisiones del modelo PEF**. No medir p95 WAN, DHCP, NAT, offload ni storage endurance con estos resultados.

**Siguiente:** comparador de resultados del modelo versus loopback, y después `linux-lab` aislado (VM/container/namespaces) para pruebas de forwarding real, con preflight y rollback de red virtual.

## W1.9.G — Linux namespace routed connectivity lab

Ejecutar **sólo en un runner efímero de GitHub Actions**, con aprobación explícita mediante `PEF_NETNS_ACK=GITHUB_HOSTED_EPHEMERAL_ONLY`. El smoke `scripts/lab/netns-smoke.sh` comprueba plataforma Linux/root/CI, crea cuatro namespaces (`Edge`, `LAN`, `WAN-A`, `WAN-B`) y enlaces `veth` **exclusivamente dentro de estos namespaces**. Activa forwarding en Edge, enruta tráfico HTTP real LAN→Edge→WAN y comprueba las diferencias entre upstream blackhole con carrier UP y link-down. Limpia los namespaces y los dos servicios de prueba al salir. `netns-client.py` nunca consulta endpoints externos: usa la IP TEST-NET-3 `203.0.113.42` dentro del laboratorio.

**Alcance estricto:** la conmutación de ruta se aplica mediante el script de laboratorio después de observar el fallo; no hay aún `Connectivity Core` del producto aplicando rutas automáticamente. `LAB_PASS` valida forwarding de un sandbox Linux, **no** failover de NIC real ni latencias p95, fiabilidad ISP o hardware.

**Nunca ejecutar con permisos de root en el Mac ni en hosts de producción.** En un host sin el preflight de GitHub Actions el script termina `LAB_BLOCKED` (exit 78). La implementación física futura reutilizará estos oráculos, pero requerirá diseño de seguridad independiente.

## W1.9.H — Linux sandbox with real probes and applied routing

`src/emulator/lab/netns-policy.js` now separates **probe measurement** from **routing decision** and **kernel route application**; tests exercise this abstraction with mock ports. Only the hosted Linux namespace driver has permission to apply `ip route` within an isolated Edge namespace. The peer probe uses real TCP/HTTP from Edge to both WAN gateways, and the LAN client exercises forwarding to the shared TEST-NET-3 service address. `W1.9.H` passed in [CI #38259618954](https://github.com/krukmat/logistica/actions/runs/38259618954).

**Important bug discovered:** restoring WAN interface addressing may not restore its prior return routes. An early test reported a selected, healthy primary but **failed LAN HTTP** after failback; the adapter now restores the WAN peer's static return path. This is a design requirement for future hardware adapters: dataplane must be confirmed *bidirectionally*, not inferred from health probing or route-table desired state alone.

## W1.9.I — File-backed crash/recovery laboratory

The separate `src/emulator/lab/file-journal.js` stores events in an append-only NDJSON file under an explicitly provided lab directory. It validates SHA-256 records on reopen, enforces a bounded byte budget, rejects event-ID collisions, appends cloud ACK markers, and only sends its **OS-level durability ACK after `fsync` completes**. Tests use temporary directories and kill a dedicated child process after ACK to verify reopen. They never terminate the runner or touch a real device's journal.

This **does not certify power-loss persistence**: a process crash does not exercise hardware cache, controller barriers or filesystem after sudden power loss. Also pending: single-writer locking, directory creation durability, P1 emergency reserve, compaction and durable retention policy; W1.9.J will cover lifecycle constraints before hardware adapters.

**Current independent evidence:** [W1.9.H–I CI audit](audit/w1.9-h-i-2026-10-12.md), **22/22 Node tests**, simulation scenarios, loopback lab and namespace networking job PASS; PEF Core hardware acceptance remains NOT_RUN.

## W1.9.J1 — Protected control reserve

El emulador de journal en archivo admite ahora `controlReserveBytes`, un espacio finito que las escrituras normales `EVENT` no pueden consumir y que queda disponible para persistir un `CLOUD_ACK` mediante `fsync` del sistema operativo. En `status()` se exponen el total, el límite regular y la reserva. Las pruebas provocan saturación del backlog antes de confirmar en el cloud y comprueban reapertura del marcador de ACK.

**Evidencia:** [CI #38260694016](https://github.com/krukmat/logistica/actions/runs/38260694016): 24/24 pruebas Node, 7 escenarios lógicos y laboratorio de rutas Linux aislado en verde. La reserva no garantiza capacidad ilimitada de cursores, ni reserva O0/O1 independiente. La **compactación segura (W1.9.J2)** aún no está implementada. No se probó corte eléctrico físico, endurance del SSD ni garantías del controlador de escritura.

## W1.9.J2 — Compaction of lab journal with retained evidence

`file-journal.compact()` now stages a new NDJSON image on the **same filesystem**, fsyncs the staging file, atomically renames it and fsyncs the parent directory before declaring completion; the active file descriptor is reopened. **O0/O1 records and their cloud-ACK markers remain intact**, as do all pending events. For already-cloud-ACKed O2/O3 events, payloads can be replaced by compact `ACKED_REF` tombstones containing the original event SHA-256 and category; this preserves local dedup/event-ID conflict detection. Retention is bounded by journal capacity; there is no guarantee of infinite dedup history. Compaction refuses to exceed the regular write allocation, leaving control reserve untouched.

Interrupted staging leaves the prior file as the source of truth; interruption after rename requires reopening and digest-based validation. In either case the live instance rejects further writes after uncertainty. **This is laboratory filesystem crash consistency, not evidence of physical controller durability, multi-writer locking or SSD endurance.** The tests inject failures at before/after rename and verify reopening and critical evidence preservation.

## W1.9.K — Statechart y Control Panel local para Mac

**K1 · Parallel states:** `src/emulator/statechart.js` proyecta las dimensiones independientes `Core / Connectivity / Cloud / Journal / Runtime / Security` del motor existente; identifica transiciones y el WAN seleccionado. **No duplica la lógica de enrutamiento ni añade un sexto componente PEF**. El journal de esta proyección es el journal **lógico**, no el fichero fsync del laboratorio.

**K2 · Sesión determinista:** `src/emulator/session.js` implementa `load/next/run/rewind/reset/enqueue` y recalcula el estado retrocediendo mediante replay desde el inicio, sin rehidratar snapshots opacos. Registra `before/after`, respuesta, oráculo `expect/assert`, divergencias y eventos. Un fallo de assertion detiene el runner hasta retroceder/reiniciar, y al insertar un evento manual se ramifica la secuencia desde el cursor.

**K3 · Dashboard web:** `src/emulator/dashboard-server.js` y `public/dashboard.html|css|js` proporcionan el panel visual responsivo en `127.0.0.1` (sin acceso desde LAN). Las mutaciones HTTP requieren token de sesión y comprobación de Origin; todas las operaciones permitidas están limitadas a comandos del modelo, sin ejecutar comandos shell ni tocar red física. Un solo proceso/una sola sesión compartida entre pestañas: **herramienta de desarrollo local, no servidor multiusuario**.

**K4 · Escenarios existentes:** sólo se pueden cargar los fixtures JSON `scenarios/*.json` incluidos en el repositorio. La UI ofrece carga, paso siguiente, ejecución completa, retroceso, reinicio, fallos manuales WAN/cloud, journal/sync y powercut **simulado**. Timeline y trace muestran resultados sin convertir `SIM_PASS` en aceptación física.

**Prueba local en tu Mac (Node >=20):**

```bash
git switch main
git pull
npm run dashboard
# abre http://127.0.0.1:8787
```

Para salir pulsa `Ctrl+C` en la terminal. También se mantienen `npm test`, `npm run emulate` y `npm run smoke`.

**Evidencia automatizada:** [GitHub Actions #38263883556](https://github.com/krukmat/logistica/actions/runs/38263883556): 34/34 tests Node, 7/7 escenarios de simulación, loopback LAB_PASS y namespace Linux LAB_PASS (ambos jobs success). Cubre transiciones paralelas, replay determinista, rechazo de acciones, endpoints HTTP, token y origen. No incluye test real de un navegador Safari/Chrome ni prueba visual manual en macOS; ese chequeo es una actividad local adicional, no un bloqueo para consumir el panel. **Sin pruebas físicas de hardware.**

**W1.9.J2 verified:** [CI #38264150746](https://github.com/krukmat/logistica/actions/runs/38264150746) passed all 38 Node tests and both lab jobs; [evidence and backend matrix](audit/w1.9-j2-j3-2026-10-12.md). Original J2 commit needed corrections to mutable file descriptor and newline framing before tests passed. J3 formally separates `sim`, `loopback-lab`, `linux-lab`, `file-journal` and untested `device`. Next W1.9.L integrates connectivity with persisted evidence; physical acceptance remains NOT_RUN.

**CI integral actualizado (K + J2):** [#38264234999](https://github.com/krukmat/logistica/actions/runs/38264234999): 38/38 tests Node PASS, 7 SIM_PASS, loopback LAB_PASS, Linux namespace LAB_PASS y chequeo sintáctico JS del panel PASS. La compaction J2 de laboratorio conserva O0/O1 y comprueba fallos antes/después del rename; **no demuestra durabilidad ante power cut físico**.

## W1.9.L — Local integrated edge runtime slice

`src/emulator/lab/edge-runtime.js` combines the probe-driven Connectivity policy with the filesystem journal, maintaining a **single owner for state transitions** and saving WAN selection/offline events with OS `fsync` before returning a durable acknowledgment. `probe` and `applyRoute` are injected, so this module neither changes routing itself nor requires privileged code. High-impact `LOCAL_ONLY`/backup incidents are classified O1; ordinary initial/restore transitions O2, with `correlationId` and logical clock evidence.

When the journal is full or unsafe, routing still proceeds. The result explicitly returns `ack=false`, `DEGRADED`, an ephemeral bounded retry queue and a dropped-evidence counter: **memory is not durable**. There is no claim of product-grade failover, hardware write barriers or network driver implementation. Node regression tests verify reopen, acknowledged transition IDs, backpressure and route error handling.

## W1.9.M — Integrated Linux network lab + OS-file journal

The existing GitHub-hosted `netns-policy-scenario.js` now runs through the [integrated local lab runtime](../src/emulator/lab/edge-runtime.js) rather than the standalone policy model. For each **applied** route transition, the controller writes a local O1/O2 event and the acceptance oracle requires an OS `fsync` ACK. The test later **closes and reopens** the file journal and confirms its event count/pending records. All route writes remain inside the Edge Linux namespace, and the temporary journal directory is removed at test completion.

**Boundary:** real sandbox kernel routing + host OS fsync and process reopening are tested, not physical NIC or power-loss durability. A clean Linux-lab test does not authorize production use. **M CI VERIFIED:** [run 38265355221](https://github.com/krukmat/logistica/actions/runs/38265355221) green, 42 Node tests and both lab jobs; six fsync-ACKed route transitions survived process-level journal reopen. [M audit](audit/w1.9-l-m-2026-10-12.md). Still no physical NIC/SSD/power-loss claim.

## W1.9.N — Pressure recovery and restart regression

[Run 38266099521](https://github.com/krukmat/logistica/actions/runs/38266099521) passed **45/45 Node tests**, seven emulator fixtures and both networking lab jobs. A bounded P1 lab journal was filled deliberately: the integrated runtime continued routing but returned `ack=false` and `DEGRADED`. A subsequent cloud ACK and compaction freed space; on the next sample, the deferred event was persisted with OS `fsync` and verified by reopening the journal. Independent tests confirmed new per-process session IDs prevent collisions with earlier ACKed event IDs. This does **not** mean the volatile queue is crash safe, nor establish stable device identity; see [audit N](audit/w1.9-n-2026-10-12.md). Next W1.9.O addresses persistent device/session revision contracts.

## W1.9.O — Stable lab identity, revision and bounded replay

Transition events now require explicit `siteId`, `deviceId`, `configRevision`, a unique boot/session epoch and a correlation ID. Event IDs follow `wan.{deviceId}.{sessionId}.{sequence}`. The local OS `fsync` event ACK is distinct from the remote durable-ingest ACK: `syncJournal` persists local `CLOUD_ACK` only after a bounded mock transport operation returns matching `eventId`, digest, site and device. If the remote commit happens but its response disappears, local events stay pending, and replay is idempotent. Negative scenarios cover wrong revisions, forged ACKs, discordant payload and scope misuse. [Schema](contracts/edge-event-envelope-v0.1.schema.json).

**Limitations:** fixtures use explicit non-secret lab IDs, not provisioned roots of trust. The mock Cloud has no mTLS/PKI and its map is not durable cloud storage. SHA-256 uses Node JSON serialization, not a cross-language canonical encoding. This is a lab reference to refine eventual software/device contracts, not validated production synchronization.

**W1.9.O CI verified:** [run #38268776321](https://github.com/krukmat/logistica/actions/runs/38268776321) completed successfully: **51 Node tests PASS, seven SIM_PASS, both labs PASS**. Full field semantics, mock Cloud sequence and device transition matrix are in [14 Identity and Replay Contract](14-identity-replay-contract.md), with [audit](audit/w1.9-o-2026-10-12.md). Hardware and production remote security remain NOT_RUN.

## W1.9.P0 — Emulador visual integrado (requisito permanente)

La UI ahora tiene **dos modos explícitos**: simulación lógica y **laboratorio integrado**. El laboratorio llama al *mismo* `createEdgeRuntime`, al `file-journal` con `fsync` del host y al `cloud-replay` con ACK ambiguo/revisión/identidad que utilizan los tests backend. Se pueden provocar WAN offline, saturación de P1, reinicio/reapertura, compactación, ACK perdido, ACK forjado y TCP/HTTP loopback desde botones visibles. El journal ocupa **sólo una carpeta temporal** aislada del servidor y se elimina al cerrar. No modifica interfaces/rutas del Mac, ni hay una nube real. Linux veth continúa como **CI-only con enlace a evidencia**. La UI no confunde `fsync` con corte eléctrico físico.

**Contrato y tutorial:** [15 — Emulator Integration Contract](15-emulator-integration.md). **Gate automatizado y registro de funcionalidades:** [integration registry](contracts/emulator-integration-v1.json) + `test/dashboard-integration-gate.test.js`. [CI #38272443257](https://github.com/krukmat/logistica/actions/runs/38272443257): 58/58 Node tests, siete escenarios lógicos y ambos laboratorios PASS. A partir de ahora toda función nueva debe ser alcanzable desde la UI o exponerse como `CI-only/BLOCKED` cuando ejecutar localmente fuera inseguro.

## W1.9.P — Trust y transporte integrado (CI VERIFIED)

**P1:** `lab-bootstrap.js` guarda identidad no secreta de sitio/dispositivo/revisión en el directorio temporal privado del emulador (modo 0600, `fsync` de archivo y directorio), y genera un nuevo `sessionId` en cada reinicio. Se rechazan metadatos corruptos o identidad discordante.

**P2:** `transport-frame.js` y `cloud-replay.js` utilizan ACK v1 con tupla ordenada y HMAC efímero **dentro del mismo proceso mock**, además de deadlines (250 ms por defecto) y reintentos limitados. ACK ambiguos o sin prueba, versión incompatible y timeouts no producen marcadores locales falsos. Estos comportamientos están disponibles en el **Laboratorio integrado** mediante botones de timeout, ausencia de prueba, versión errónea y sincronización con dos intentos.

**P3:** [GitHub Actions #38274368734](https://github.com/krukmat/logistica/actions/runs/38274368734): **65/65 Node PASS**, 7 escenarios `SIM_PASS`, loopback y Linux namespaces `LAB_PASS` con limpieza. Los tests de dashboard pasan por la API HTTP y verifican el journal real con `fsync` del sistema operativo.

**Límites:** el HMAC y las identidades son mocks de laboratorio y no prueban autenticación remota, PKI o Cloud productiva. El frame canónico sólo cubre la tupla de ACK v1; el resto del journal sigue usando serialización Node. No hay NIC física, power-cut, ni pruebas de seguridad de dispositivo certificadas.

## W1.9.Q — Sitio virtual de logística (CI VERIFIED)

Un workload real de ejemplo, **recepción de paquetes**, funciona a través de `POST/GET /api/local/receipts` en el mismo servidor localhost del Control Panel. El formulario **Recepción logística local** envía la petición a la API HTTP; no modifica por su cuenta el estado del modelo.

`local-receipts.js` reutiliza el mismo `createEdgeRuntime` y el journal O1 con `fsync` del sistema operativo. El ID del evento `receipt.{deviceId}.{receiptId}` es estable entre reinicios: mismo ID/mismo paquete retorna duplicado, mismo ID/otro paquete retorna conflicto. Un evento no fsynced nunca aparece como recepción aceptada. El listado se reconstruye desde eventos O1 retenidos (no desde una copia en memoria), incluso tras ACK Cloud, compactación y reapertura.

Con ambas WAN sintéticas desactivadas, registrar `R001/PKG001` sigue devolviendo recepción local 201. Una vez vuelve WAN, el mock Cloud utiliza el pipeline real de replay/ACK del laboratorio, sin duplicar el evento ante ACK remoto perdido. Cuota P1 insuficiente se rechaza explícitamente con HTTP 507. La API está restringida a localhost, token del panel y modo laboratorio; no proporciona aún un endpoint de red LAN productiva.

**Evidencia:** [CI #38281997428](https://github.com/krukmat/logistica/actions/runs/38281997428): 68/68 tests Node PASS, siete escenarios `SIM_PASS`, loopback `LAB_PASS`, Linux namespaces `LAB_PASS CLEAN`. [Guía con Mermaid](17-virtual-site-e2e.md) y [tasks Q](tasks/w1.9-emulator-execution.md). No valida cortes de energía físicos, servicios de transportistas, Cloud persistente ni NICs reales.

## W1.9.R — Puente de portabilidad de Core a Linux (CI VERIFIED)

**Shared Core:** `src/core/{wan-policy,connectivity-controller,edge-runtime,cloud-sync,event-envelope,local-receipts}.js` contiene ahora lógica reutilizable **sin importar el emulador, el dashboard ni comandos de sistema**. `src/emulator/core.js` utiliza el mismo `wan-policy`; el controlador de red Linux consume dicha política sin pasar por el simulador. Sus ports se inyectan desde `src/runtime/edge-service.js`: `probe`, `applyRoute`, `journal`; en `src/adapters/` residen el journal OS/fdatasync y los puertos de rutas Linux namespaces.

**Ejecución:** `virtual-lab` usa WAN sintéticas y P1 temporal; `linux-lab` utiliza rutas Linux reales **solo en el namespace de un runner GitHub-hosted efímero**; `device` todavía retorna `BACKEND_NOT_IMPLEMENTED`. El selector de escenarios síncrono `src/emulator/backends.js` sigue en modo `sim`; el backend Linux asíncrono real está en `src/runtime/backend-registry.js`. No son equivalentes.

**UI desacoplada:** `createDashboardServer({runtimeLab})` acepta runtime controlado externamente: cerrar o reiniciar solo el servidor HTTP no destruye la instancia persistente. El dashboard por defecto sigue creando un runtime de laboratorio y muestra `virtual-lab / shared PEF Core`, sin rutas físicas.

**Durabilidad:** la capa Core ahora rechaza explícitamente un port de almacenamiento que devuelva `ack=true` sin `fsyncCompleted=true` (salvo confirmación duplicada ya durable). Se comprueba en tres fronteras: recepción local, evento WAN y cursor de Cloud. No certifica power-cut físico.

[Diagrama, port matrix y alcance físico](18-hardware-portability-bridge.md) · [R tasks](tasks/w1.9-hardware-portability.md) · [CI #38284356529](https://github.com/krukmat/logistica/actions/runs/38284356529): **76 Node PASS**, siete escenarios SIM_PASS, loopback LAB_PASS y namespaces/veth LAB_PASS CLEAN. Los 128 vectores de políticas WAN demuestran equivalencia funcional en laboratorio, **no rendimiento físico**.

## W1.9.S — Workloads reales del emulador e aislamiento kernel CI-only

El dashboard (modo Laboratorio integrado) integra un `Workload Manager` de dominio y `Process Supervisor` independientes de la UI. Botones de **Admitir/Iniciar**, **Detener**, **Simular crash**, **Comprobar health/recovery** y **Registrar recepción por IPC** usan un proceso Node allowlisted `pef-receiver`. Se visualizan reservas lógicas, estados RUNNING/BACKOFF/ISOLATED y `actualLimitsEnforced=false` para el Mac. Un timer del host reintenta tras backoff; polling del panel sólo refresca la vista.

Linux CI prueba por separado un child workload con **límites reales kernel** derivados del mismo manifest (cgroup v2 150 mCPU / 64 MiB / 16 PIDs), network namespace sin WAN, chroot temporal, UID sin privilegios y P1 fsync, con limpieza. La UI contiene un enlace CI-only para esa evidencia, sin privilegios ni modificaciones de host en el Mac.

[W1.9.S guía](19-workload-runtime.md), [tasks S1–S6](tasks/w1.9-workload-runtime.md), [CI #38293362918](https://github.com/krukmat/logistica/actions/runs/38293362918): **84 Node PASS**, 7 SIM_PASS, loopback, veth, S3 PASS/CLEAN. S3 product driver aún pendiente; W1.8 hardware físico NOT_RUN.

## W1.9.S3.4–S3.8 — Linux driver supervisado, visible pero no ejecutable en macOS

El laboratorio Linux ahora inicia el **mismo Workload Supervisor del Core** con el adaptador de procesos realmente aislados y comparte las reglas de manifests/health/backoff con el driver local macOS. La UI distingue el `NodeProcessDriver` local (`actualLimitsEnforced=false`, sin red/FS/cgroup aisladas) del `LinuxIsolatedProcessDriver` **CI-only** (cgroup/netns/chroot/UID, CPU throttling, OOM kill, limpieza). El panel enlaza la [CI verificada](https://github.com/krukmat/logistica/actions/runs/38299928948); nunca ejecuta Linux root en el Mac. [Contrato S3.4–S3.8](20-supervised-linux-driver.md).

## W1.9.T — Estado pre-hardware del emulador: READY sólo para integración física

El producto compartido `src/core/` ya se ejecuta desde `src/runtime/autonomous-edge.js` sin el Control Panel. La CLI `bin/pef-edge.js` exige manifiesto v1 y token operador; arranca la política WAN y un receiver opcional, reabre journal tras SIGKILL y devuelve `/health`, `/ready`, `/state`, `/receipts`. El dashboard en modo Laboratorio integrado incluye la prueba **T — Edge Service autónomo**, que inicia el host real vía HTTP y valida fsync/reboot sin backend ficticio separado. Linux solo: namespace routing real y proceso supervisado con cgroups medidos en CI, NO privilegios en Mac.

La puerta antes de hardware es el tercer job `prehardware-gate` que exige éxito de pruebas Node/emulador y Linux, más artefactos JSON reales; emitió `SOFTWARE_LAB_READY` con **94 tests Node PASS** en [run #38314630311](https://github.com/krukmat/logistica/actions/runs/38314630311). Limitación: software listo para empezar la integración a un device, no dispositivo productivo listo. [Guía y Mermaid](21-autonomous-edge-handoff.md).

## M3.1–M3.2 — Supervisor externo y exclusión Linux de laboratorio

La acción M3 en el **Laboratorio integrado** ejecuta `runM3LifecycleSmoke` y reproduce arranque del Edge independiente del dashboard, registro de recibo con fsync local durante WAN virtual offline, `SIGKILL` del proceso hijo, reintento del supervisor, reapertura y cierre ordenado. El estado es `SOFTWARE_LAB_ONLY`, y la comprobación de `flock` kernel está confinada a Linux CI, no al Mac. No se instala ningún servicio ni se cambia WAN host. [Guía M3](tasks/m3-autonomous-lifecycle.md).

## M3.3–M3.4 — Transacción de supervisor y SAFE_MODE

El panel **Laboratorio integrado → M3.3–M3.4** activa `m3Recovery` y lanza un Edge autónomo real aislado. Prueba COMMIT con verificación de salud, rechazo stale revision, ROLLBACK, segundo SIGKILL → SAFE_MODE y recuperación local autenticada. No actúa sobre el daemon existente del usuario ni su WAN; ver [guía](tasks/m3-config-safe-mode.md) y [auditoría CI](audit/m3-config-safe-mode-2026-10-18.md).

## M4.1 — Property: workflow offline end-to-end

`Laboratorio integrado → M4.1` activa `propertySmoke`, que levanta **otro Edge autónomo HTTP real** y el proceso `pef-property` con el mismo Supervisor, resource admission y OS-file journal. Comprueba API autenticada, alerta/ACK fsynced, WAN offline, reapertura e idempotencia, y eventual replay a Cloud mock. `lab.property.lastEvidence` contiene los checks observados y el estado `LAB_PASS|LAB_FAIL`; este escenario no altera la sesión principal del panel. Es visible vía `m4-property-smoke` y está registrado en el [integration gate](contracts/emulator-integration-v1.json).

El backend Property es `NODE_PROCESS_ONLY`; no se ha aplicado cgroup/netns/chroot al nuevo workload ni se ha medido consumo físico. `docs/tasks/m4-property-overlay.md` define contrato y límites.

## M4.2 — Host: segundo perfil sobre el mismo motor

El Control Panel en **Laboratorio integrado → M4.2 Host** ejecuta `hostSmoke`, que arranca el **mismo Edge autónomo real** con `workload.profile="host"` y el nuevo proceso autorizado `pef-host`. Valida incidencias `OPEN → ACK` fsynced, múltiples rechazos fail-closed, WAN virtual offline, journal reopen e idempotencia y replay a Cloud mock. Resultado trazable: `lab.host.lastEvidence` (NO hardware). `npm run m4:host` es la CLI autónoma para la misma prueba.

El motor común y los contratos están en `src/core/site-operations.js` y `src/core/site-operation-contract.js`. Se conserva M4.1 Property, incluido formato histórico de sus eventos. El nuevo perfil NO tiene Linux cgroup/netns/chroot certificado; sólo `NODE_PROCESS_ONLY` en Mac/CI Node. [Tasks](tasks/m4-host-overlay.md).

## M4.3 — Matriz Property/Host, pruebas y observaciones

La acción `m4Commonality` en el panel integrado ejecuta `src/runtime/m4-commonality.js`: historial Property, regresión de identidad, fallo de hijo real (Node), backoff y recuperación, política de supervisor con reloj simulado, fallo fsync inyectado sobre archivo temporal, capacidad/admisión, enlace WAN virtual y Cloud mock. `lab.m4Commonality.lastEvidence` muestra resultado por perfil, contadores reales de RSS/CPU worker, latencia HTTP y una métrica LOC **acotada a rutas explícitas**. No equivale a pruebas físicas de corte o sandbox Host/Property. [Guía](tasks/m4-commonality-resilience.md).

## M4.4 — Demo integral con bundle SHA256

`Laboratorio integrado → M4.4` ejecuta `m4Integrated`: crea un paquete temporal verificable a partir de los **Edge HTTP reales** de Property y Host y la matriz M4.3. `lab.m4Integrated.lastEvidence` muestra `LAB_PASS`, runId, conteo de aserciones, los tres estados y ruta efímera local. El Control Panel no incorpora privilegios ni certificación física. El paquete se borra al reset/cierre del lab; para conservarlo usar `npm run m4:bundle` y verificar con `npm run m4:bundle:verify -- <directorio>`. [Contrato](contracts/m4-evidence-v1.json) y [tasks](tasks/m4-integrated-closure.md). HTML estático, sin red; NDJSON registra comprobaciones de runners, no eventos OS brutos; SHA256 no autentica el emisor.

## M5.1/M5.2 — Instalar/actualizar/rollback en laboratorio

En **Laboratorio integrado → M5**, `m5InstallLab` arranca un instalador bajo un directorio temporal aislado y prueba el paquete Edge real por HTTP, eventos O1/fsync, conservación del journal tras actualización y rollback. Reporta en `lab.m5Install.lastEvidence`: checks, plataforma, release hash, estado de servicio del sistema **no instalado**. No modifica servicios del Mac. Código: `src/runtime/m5-install.js`, `src/runtime/m5-install-smoke.js`; contrato [M5 v1](contracts/m5-install-v1.json); [plan](tasks/m5-reproducible-install-linux-lab.md). La autenticación de operador se inyecta sólo por entorno efímero durante el test; no provisiona secretos del producto.

## M5.4/M5.5 — Contratos de servicio y kernel Linux

Control Panel → Laboratorio integrado → **M5.4** valida el renderer real de la unidad de systemd y expone que no se activó en el Mac; **M5.5** presenta los presupuestos manifiesto Property/Host e indica que `kernelObservedHere=false`. Ambas acciones HTTP apuntan al código real de contratos, no a sistemas privilegiados del Mac. En CI `m54-systemd-lab` prueba arranque/restart systemd con Edge real, y `netns-lab` prueba los overlays aislados en kernel. [Plan](tasks/m5-4-5-systemd-linux-isolation.md) y [auditoría](audit/m5-4-5-systemd-isolation-2026-10-19.md). La VM Lima reboot permanece NOT_RUN hasta recibir evidencia de ejecución real.

## M5.6 — Integrated service inspection (CI-only runtime)

Dashboard → Laboratorio integrado → **M5.6** (`m56Integration`): inspect allowlisted CI Edge entrypoint, systemd service contract, Property and Host CPU/memory/PIDs plans. The local action returns `LAB_PASS_CONTRACT_ONLY` with `localKernelExecution=NOT_RUN_BLOCKED` and **does not activate privileged Mac system services**. Real systemd/kernel composition + restart and data recovery executes inside GitHub-hosted ephemeral Linux CI and is independently verified. [CI #39246560682](https://github.com/krukmat/logistica/actions/runs/39246560682) / [audit](audit/m5-6-integrated-linux-service-2026-10-19.md). The earlier M5.4 'Lima reboot NOT_RUN' note is superseded by the operator's 5/5 LAB_PASS evidence for its separate, Node-only service; M5.6 combined stack has not itself undergone OS reboot.

## M6.1 — Registry Cloud Lite real (local)

En Lab integrado → **M6.1**, la acción `m61Registry` crea un servicio HTTP real de loopback aislado del mock, valida enrolamiento de dos identidades, credenciales aleatorias protegidas por hash SHA-256, reinicio y reautenticación. El dashboard recibe únicamente checks y metadatos sin credenciales. El servicio se cierra y elimina el estado de prueba al finalizar el smoke. El `cloud` del resto del dashboard sigue siendo el **Cloud mock** hasta M6.3; no se supone sustitución. Contrato [Cloud Lite M6](contracts/m6-cloud-lite-local-v1.json), [plan](tasks/m6-cloud-lite-local.md).

## M6.3–M6.4 — Cloud Lite real y resiliencia

Dashboard → Laboratorio integrado → **M6.3** (`m63Sync`) inicia Edge real y Cloud Lite HTTP loopback para Property/Host y valida offline, token, ACK autenticado, dedup/reinicio. **M6.4** (`m64Matrix`) ejecuta matriz adicional sobre servidor de Cloud que se detiene/reinicia, intento con token inválido, ACK falsificado y local journal que no avanza. Los dos servicios reales se cierran y eliminan sus directorios temporales al finalizar. El `cloud` de las otras escenas antiguas sigue siendo el mock. [Auditoría](audit/m6-2-4-cloud-lite-local-2026-10-19.md).

## M7.1–M7.2 — Identidad y signed M5 (software-only)

Dentro de Laboratorio integrado, **M7.1** (`m71Identity`) crea una identidad software Ed25519 temporal, firma desafíos ligados al device y valida reapertura/corrupción. **M7.2** (`m72Release`) ejecuta un release temporal firmando permisos en una autoridad efímera de laboratorio, verifica package M5, arranca un Edge real, simula fallo de health-check y realiza rollback autorizado. El dashboard no instala software, no importa claves permanentes ni cambia el systemd del Mac. Ambas tareas: IMPLEMENTED / CI_PENDING. [Contrato](contracts/m7-security-lab-v1.json) y [auditoría](audit/m7-identity-and-signed-release-2026-10-19.md).

## M7.3–M7.6 — Canal seguro, diagnóstico, estrés y readiness

Laboratorio integrado → `m73Mtls`: Cloud Lite/Edge **HTTPS TLS1.3 mTLS real** con CA local, rechazo de identidad ajena y fallo de trust sin downgradear HTTP. `m74Operations`: M3 SAFE_MODE/recovery autenticado con journal hash-chain fsynced. `m75Stress`: dos ciclos cortos de escenarios Cloud Lite con métricas CPU/RSS, **NO 2h certificadas**. `m76Pilot`: decision estricta `GO_SOFTWARE_LAB_ONLY`, `fieldPilotAuthorized=false`, bloqueo físico explícito. No se escriben certificados en llaveros del Mac ni se instalan servicios. [Auditoría](audit/m7-3-6-security-pilot-lab-2026-10-19.md).
