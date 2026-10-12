# 12 — PEF Virtual Edge Emulator (W1.9)

**Estado:** IMPLEMENTED — emulator lógico Node.js con escenarios reproducibles; **no Core real, ni validación de hardware**. Fuente: `src/emulator/core.js`, `src/emulator/scenario.js`, `bin/pef-emulator.js`, `scenarios/*.json`, `test/emulator.test.js`. [Plan granular](tasks/w1.9-emulator-execution.md). Contratos antecedentes: [W1.6 runtime](09-runtime-contract.md), [W1.7 harness](10-benchmark-harness.md), [W1.8 shootout](11-architecture-shootout.md).

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
