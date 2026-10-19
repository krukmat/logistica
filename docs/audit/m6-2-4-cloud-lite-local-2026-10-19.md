# M6.2–M6.4 — Cloud Lite auténtico, local y resiliente (2026-10-19)

## Evidencias verificadas

- **M6.2:** `test/m62-ingest.test.js` y `npm run m6:ingest`, HTTP real, sobre Core, ingest append-only con fsync y directorio durable, dedup y fail-closed en corrupción; [CI #39263462132](https://github.com/krukmat/logistica/actions/runs/39263462132) SUCCESS.
- **M6.3:** `src/runtime/m63-edge-cloud-lite-smoke.js` + `test/m63-sync.test.js` y acción dashboard `m63Sync`. Property y Host reales sobre `127.0.0.1`, WAN sintética desconectada, fallos en ACK poscommit, retry dedup y journal reopening. [CI #39271176439](https://github.com/krukmat/logistica/actions/runs/39271176439) SUCCESS.
- **M6.4 primera matriz:** `src/runtime/m64-cloud-lite-matrix.js` + `test/m64-matrix.test.js`, doce checks de los dos perfiles + tres gates previos. Cubren pérdida de conexión real HTTP al detener Cloud, reabrir con registry persistido, credencial errónea sin commit, prueba HMAC adulterada después de commit con cursor Edge conservado, deduplicación y reopen del Edge. [CI #39271578783](https://github.com/krukmat/logistica/actions/runs/39271578783) SUCCESS.
- **M6.4 integración final:** nueva acción dashboard `m64Matrix`, `npm run m6:matrix`, CI artifacts `m6-cloud-lite-complete-x64` y `m6-cloud-lite-complete-arm64`; **confirmado** en [CI #39272167885](https://github.com/krukmat/logistica/actions/runs/39272167885) SUCCESS.

## Alcance y exactitud

La autenticación de dispositivo se realiza con bearer tokens aleatorios sobre HTTP loopback y la prueba ACK se construye con HMAC usando ese token; **no es autenticación remota ni TLS**. El servidor devuelve ACK durable después de fsync del archivo y persiste un índice de eventos reconstruible; `duplicate=true` confirma fsync anterior. La verificación del ACK protege el cursor del Edge ante pruebas adulteradas. El ensayo Cloud-STOP/Cloud-START es un **reinicio de proceso**, no de VM, y WAN es sintética.

M6.3/M6.4 no borran `createLabCloudReplica`: los mocks siguen disponibles en escenas legacy. La nueva matriz usa por separado un backend HTTP y un Edge real. No se proclama soporte de hosting público, flota operativa, PKI/rotación de credenciales, durabilidad ante powercut físico, 72 horas ni manejo remoto de hardware.

**Change:** added · REQ-CLO-01, REQ-STA-01/02, REQ-SEC-01/02, REQ-LOC-01 · classification CORE protocol, MODULE service/transport, CONFIG local lab, RESOURCE bounded ledger · risks physical storage, TLS unaudited, failure-injection simulated WAN.

## M6.4 DoD — aceptación final

[GitHub Actions #39272167885](https://github.com/krukmat/logistica/actions/runs/39272167885) **SUCCESS**: ARM64 210 PASS/0 fail; x64 209 PASS, 1 skip/0 fail; ambos tests de dashboard M6.3 y M6.4 PASS; comandos CLI `npm run m6:sync` y `npm run m6:matrix` ejecutados y PASS en ambas arquitecturas. Artefactos preservados: [M6 x64](https://github.com/krukmat/logistica/actions/runs/39272167885/artifacts/12196022306) y [M6 ARM64](https://github.com/krukmat/logistica/actions/runs/39272167885/artifacts/12194929270); netns Linux y systemd previos SUCCESS, prehardware SUCCESS.

**Decisión:** M6.1, M6.2, M6.3 y M6.4 **CLOSED SOFTWARE LAB ONLY**. El coste adicional de hosting es cero; puede haber cuota/consumo de CI del plan. No certificar TLS remoto, Cloud público, test power-cut ni dispositivo físico. Los tests usan Edge real y Cloud Lite real en localhost; las demos antiguas mantienen el mock.

## Operator macOS ARM64 execution — 2026-10-19

**Provenance:** terminal JSON posted by the operator after `npm run m6:matrix` on Mac (`darwin` / `arm64`). This is **operator-reported local evidence**, separate from the independently completed Linux CI runs; no machine telemetry or screenshot was inspected.

- `kind=PEF_M64_CLOUD_LITE_FAULT_MATRIX_V1`, `status=LAB_PASS`, `ok=true`, `assertions=15`: registry, durable ingest, Edge Property+Host E2E (3/3) and each profile's offline fsync, Cloud outage journal retention, denial of wrong device token, rejection of forged HMAC proof, authenticated deduplicated replay and ACK survival after reopening (6/6 each).
- `remoteCloud=REAL_LOCALHOST_HTTP`, `signedAck=LAB_HMAC_TOKEN_BOUND`, `independentServiceRestart=true`, `edgeJournalRetained=true`; `duplicateOnReconcile=1` for **both** profiles.
- Observed Cloud event totals `property.remoteEvents=4` and `host.remoteEvents=8` are **cumulative within this shared Cloud test**, not separate per-tenant message throughput claims. `afterForgedEvents=1` then `5` reflects a remote fsync followed by invalid local HMAC proof; the local cursor must not advance until valid reconciliation.
- Explicit limitations: `legacyCloudMockRemoved=false`, `realTlsValidated=false`, `hardwareValidated=false`, `physicalPowerCutValidated=false`, `hostingRequired=false`, `additionalHostingEuro=0`. WAN remains synthetic and the HTTP backend is actual localhost, not Internet hosting. Only process restart is exercised.
- The operator also launched `npm run dashboard`; the provided console fragment shows the command starting but **does not by itself verify browser loading or dashboard UI actions**. Dashboard HTTP integration was proven separately by CI.

**Decision:** M6.1–M6.4 remain **CLOSED — SOFTWARE LAB ONLY**. This additional macOS ARM64 smoke validates the local host environment; it does not change physical/security/production scope.
