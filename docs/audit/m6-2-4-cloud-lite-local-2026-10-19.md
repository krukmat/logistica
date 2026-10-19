# M6.2–M6.4 — Cloud Lite auténtico, local y resiliente (2026-10-19)

## Evidencias verificadas

- **M6.2:** `test/m62-ingest.test.js` y `npm run m6:ingest`, HTTP real, sobre Core, ingest append-only con fsync y directorio durable, dedup y fail-closed en corrupción; [CI #39263462132](https://github.com/krukmat/logistica/actions/runs/39263462132) SUCCESS.
- **M6.3:** `src/runtime/m63-edge-cloud-lite-smoke.js` + `test/m63-sync.test.js` y acción dashboard `m63Sync`. Property y Host reales sobre `127.0.0.1`, WAN sintética desconectada, fallos en ACK poscommit, retry dedup y journal reopening. [CI #39271176439](https://github.com/krukmat/logistica/actions/runs/39271176439) SUCCESS.
- **M6.4 primera matriz:** `src/runtime/m64-cloud-lite-matrix.js` + `test/m64-matrix.test.js`, doce checks de los dos perfiles + tres gates previos. Cubren pérdida de conexión real HTTP al detener Cloud, reabrir con registry persistido, credencial errónea sin commit, prueba HMAC adulterada después de commit con cursor Edge conservado, deduplicación y reopen del Edge. [CI #39271578783](https://github.com/krukmat/logistica/actions/runs/39271578783) SUCCESS.
- **M6.4 integración final:** nueva acción dashboard `m64Matrix`, `npm run m6:matrix`, CI artifacts `m6-cloud-lite-complete-x64` y `m6-cloud-lite-complete-arm64`; *la última ejecución CI debe confirmarse antes de declarar M6.4 CLOSED*.

## Alcance y exactitud

La autenticación de dispositivo se realiza con bearer tokens aleatorios sobre HTTP loopback y la prueba ACK se construye con HMAC usando ese token; **no es autenticación remota ni TLS**. El servidor devuelve ACK durable después de fsync del archivo y persiste un índice de eventos reconstruible; `duplicate=true` confirma fsync anterior. La verificación del ACK protege el cursor del Edge ante pruebas adulteradas. El ensayo Cloud-STOP/Cloud-START es un **reinicio de proceso**, no de VM, y WAN es sintética.

M6.3/M6.4 no borran `createLabCloudReplica`: los mocks siguen disponibles en escenas legacy. La nueva matriz usa por separado un backend HTTP y un Edge real. No se proclama soporte de hosting público, flota operativa, PKI/rotación de credenciales, durabilidad ante powercut físico, 72 horas ni manejo remoto de hardware.

**Change:** added · REQ-CLO-01, REQ-STA-01/02, REQ-SEC-01/02, REQ-LOC-01 · classification CORE protocol, MODULE service/transport, CONFIG local lab, RESOURCE bounded ledger · risks physical storage, TLS unaudited, failure-injection simulated WAN.
