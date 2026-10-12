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

La ejecución de comprobación aislada del mismo motor y runner publicados confirmó **6/6 escenarios `SIM_PASS`**. Este resultado se ejecutó en un entorno JavaScript aislado, **no equivale a haber corrido `npm test`/CLI en Node dentro del repositorio**. Para validar el paquete end-to-end se debe ejecutar `npm run smoke` en un entorno Node y registrar salida/exit code. No existen mediciones físicas ni benchmarks.

## W1.9.D — Hardware adaptation seams

El siguiente corte técnico deberá introducir adaptadores explícitos (comenzando por `sim`, después `linux-lab`, finalmente `device`). El aislamiento Linux requerirá Linux VM/container en macOS; **las network namespaces de Linux no existen nativamente en macOS**. El target Mac puede orquestar una VM Linux/runner, pero no asumimos aún software de virtualización.

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
- No se evalúa compatibilidad SDK/API ni enforcement completo del schema JSON; W1.9.E debe introducir contract validator y rechazo de colisiones `event_id` con payload discordante.
- Retención post-sync O0/O1, boot/OTA firmado, backoff temporal real y controles de estrés de I/O quedan por implementar.
- El emulador debe **evolucionar con la implementación** y producir fixtures comparables, no convertirse en una segunda arquitectura independiente.
