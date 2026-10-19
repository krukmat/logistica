# 29 — PEF MVP end-to-end priorities and deferred journal index

**Date:** 2026-10-18 · **Repository:** `krukmat/logistica`, `main` · **Decision:** stop optimizing the 72h journal now; prioritize end-to-end product usefulness. This does **not** silently revise baseline product requirements or certify physical hardware.

## Decision boundary

**W1.10.F1** operator evidence reports 100,000 durable events under a 1GiB ARM64 Lima guest, with 277.77MiB maximum sampled process RSS, >400MiB available guest RAM, normal reopen and dedup/conflict PASS; evidence [audit](audit/w1.10-f1-f2-mac-1g-2026-10-18.md). **W1.10.F2** shows the current standalone Edge `100MiB` journal cap is insufficient for the 72h/2-events-per-second target: modeled journal 0.612GiB (1KiB) or 2.095GiB (4KiB). 100MiB roughly covers **11.49h** or **3.35h** of those synthetic 2-events/s payloads, not a service SLA. The 100k benchmark uses a **separate 256MiB laboratory allowance**; do NOT claim 100k in the 100MiB product configuration.

**Defer W1.10.G1–G4** (bounded-memory index architecture, adapter replacement, 518,400-event test and comparison). This is technical debt **BACKLOG / DEFERRED**, not DONE or unnecessary. Keep per-event fsync, fail-closed errors, protected reserves and explicit rejection/backpressure; never silently discard business data. Do not raise the existing standalone journal quota or claim 72h. Any credible 72h/fleet/powercut guarantee must reopen this decision.

## Product-first next execution blocks (1–2 levels)

| ID | Deliverable | Core next subtasks | Acceptance in lab |
| --- | --- | --- | --- |
| **M1 — Vertical end-to-end** | One repeatable local operation surviving WAN/cloud loss and automatic recovery | M1.1 reuse current `pef-receiver` + shared Core journal + autonomous Edge; M1.2 demonstrable offline → receipt ACK → restart → replay → reconciliation flow | One script / observable evidence, no dashboard dependency; avoid parallel demo-only business logic |
| **M2 — Cloud Lite minimum** | Real but minimal remote plane, not only a mock | M2.1 device registry + authenticated event ingest/status; M2.2 durable dedup/replay cursor and reconciliation after reconnect | Cloud outage cannot stop local operation; remote ACK advances cursor only when validated |
| **M3 — Autonomous appliance lifecycle** | Reliable headless boot, configuration and safety | M3.1 single-writer/process supervision and status API integrated end-to-end; M3.2 trusted identity/config change/known-good recovery **design and lab gates**, no unverified physical claims | Restart and local-only are reproducible; secure remote commands blocked until trust is implemented |
| **M4 — Two business overlays, same Core** | PEF Property primary PoC and Host variant | M4.1 Property survival demonstration with a locally capable workload; M4.2 Host variant as configuration/workload change, quantify duplication | Same platform contracts; modules do not fork Core. Current logistics receiver is a **technical fixture**, not validation of Property/Host demand |
| **M5 — Pilot preparation** | Installation and pilot economics | M5.1 scripted VM/package deployment and operator runbook; M5.2 full delivered hardware BOM + customer validation plan for Property/Host | Reproducible setup and priced operational scenario; neither hardware purchase nor customer traction inferred |

Order: **M1 → M2 → M3 → M4 → M5**, with security and isolation considered in each applicable vertical slice, not delayed to the end. Prefer finishing an observable end-to-end workflow over extending component-level simulations.

## Deliberate product-scope decisions needing confirmation at acceptance

The current low-cost R28S candidate has **two** physical Ethernet ports. The least-cost proposed topology is **Core behind an existing router** (PEF does **not** itself switch physical WANs). This can support a useful local-first demonstration but is **narrower than the foundation's full multi-WAN gateway promise**. For the MVP showcase, disclose the external router dependency; original `REQ-CON-01/02/03` physical product acceptance remains open. Do not quietly mark it implemented by the virtual three-interface netns.

Likewise the foundation's 72h sizing scenario and `REQ-STA-02` bounded store-and-forward remain product-level ambitions. A shorter, bounded **lab demo** can proceed without meeting the 72h endurance objective, provided it is not sold as full product acceptance. Cloud Lite, secure provisioning, powercut, real NICs and paid pilots are not currently validated.

## Reopen W1.10.G if any condition is met

- A pilot/purchase contract **requires** 72h at defined traffic volume or audited durability.
- Storage pressure occurs before the limited lab workflow completes or retention requirement exceeds the configured quota.
- RSS/guest memory or reopen time exceeds measured safe thresholds with a representative workload.
- Event loss, false ACK, replay corruption or priority-reserve failure appears in the smaller workload.

**Next action:** inventory the existing standalone Edge, cloud/mock and logistics receiver, then implement a single **M1 end-to-end evidence flow** without replacing the shared journal or inventing a new simulator.

## M1 proof strategy — documentary and video evidence

[M1 evidence-by-design plan](30-m1-evidence-design.md) specifies one canonical autonomous runner, generated JSON + NDJSON + Markdown, SHA256 manifest, read-only visual evidence viewer, optional Playwright WebM recording of the same run, CI verification and non-certification labels. **Planning only; M1 scenario/video not implemented yet.** Most important prerequisite: connect autonomous Core `sync()` to the existing Cloud mock *in the same test run* without pretending Cloud Lite is real.

## Decision — zero new cloud spend (2026-10-18)

At current budget, **do not execute the paid/hosted M2 Cloud Lite path**. Remote hosted Cloud Lite (registry, authenticated durable ingest, desired config and fleet access) stays **DEFERRED / PRODUCT REQUIREMENT OPEN**, not dropped from long-term architecture or claimed complete. Existing in-process Cloud mock and any optional locally hosted zero-new-cost test remain admissible for development, but are **not a remote backend**. Do not buy or trial a VPS, managed DB, paid SaaS or paid DNS for M2.

Reprioritize after M1: **M3 autonomous operations → M4 Property/Host overlay proof → M5 reproducible installation & pilot plan**. Implement only the software/lab portions that require no paid external resources; any physical procurement is separately gated. This budget rule supersedes the earlier near-term order of M2 ahead of M3. [Roadmap](07-roadmap-decisions.md).

## M3 software-lab acceptance — 2026-10-18

M3.1–M3.6 están **CLOSED sólo para laboratorio** (incluye configuración transaccional, SAFE_MODE, diagnósticos operativos, evidencias reproducibles y vídeo). [CI #39157645016](https://github.com/krukmat/logistica/actions/runs/39157645016) verifica ARM64 160/160 tests, x64 159 PASS + 1 skip, Linux namespace, prehardware gate, paquete M3 técnico y Playwright WebM de mismo runId. [Auditoría](audit/m3-operations-2026-10-18.md).

**La próxima prioridad es M4**: Property PoC con un workload realmente local-capable y Host por configuración/workload del mismo Core; comparar el grado de reutilización con evidencias y sin inversiones adicionales. M5 instalación reproducible vendrá después. M2 Cloud Lite hosted sigue DEFERRED; no renunciar a su aceptación de producto futura. Ni M3 ni M4 certifican hardware, powercut, PKI o mult-WAN físico.

## M4.1 — Property vertical slice (2026-10-19)

**CLOSED — SOFTWARE LAB ONLY (CI #39209710426 SUCCESS):** `pef-property` reutiliza el Core/Journal/Workload Supervisor y añade sólo comandos y eventos de un módulo vertical. El escenario `ALERT → O1 fsync → ACK → journal reopen → WAN recovery → Cloud mock replay` está en `src/emulator/lab/property-smoke.js` y en el dashboard. El nuevo perfil se activa mediante `workload.profile="property"`, preservando `pef-receiver` por defecto. [Tasks y DoD](tasks/m4-property-overlay.md). **M4.2 Host está en ejecución; M4.3 commonality y M4.4 cierre global siguen pendientes**; no se infiere certificación de hardware, Linux Property, demanda ni cliente piloto.

## M4.2 — Host variant, Site Operations shared Core (2026-10-19)

**CLOSED — SOFTWARE LAB ONLY, CI #39216398340 SUCCESS:** `workload.profile="host"` arranca `pef-host` allowlisted; `OPEN(unit/category) → ACK` reutiliza el motor `src/core/site-operations.js` y el proceso `site-operations-worker.js` (idénticos a Property). El dashboard y `npm run m4:host` ejecutan Edge HTTP, journal fsync y reinicio offline + Cloud mock replay. Se validan límites/política de admisión lógica, **no** enforcement físico ni cgroups Host. [Tasks y gates](tasks/m4-host-overlay.md). Próximo M4.3 medición de reutilización y matriz de fallos, M4.4 evidencia y cierre integral.

**Cierre M4.2 (2026-10-19):** [CI #39216398340](https://github.com/krukmat/logistica/actions/runs/39216398340) PASS: 171/171 ARM64, 170 PASS + 1 skip x64, `netns-lab` y prehardware gate PASS. Property regresa a verde, Host E2E/HTTP dashboard y casos negativos verificados. [Auditoría](audit/m4-host-2026-10-19.md). Pendiente **M4.3** medición cuantitativa de reutilización, matrices de resiliencia; **M4.4** demostración integral y cierre de M4.

## M4.3 — Paridad cuantificada, resiliencia y recursos (2026-10-19)

**CLOSED — SOFTWARE LAB ONLY:** validado por [CI #39218335525](https://github.com/krukmat/logistica/actions/runs/39218335525), ARM64 176/176, x64 175 PASS + 1 skip; dashboard real, Linux lab y prehardware PASS. Se mide commonality en subconjunto escogido (929 LOC compartidas, 7 de fachada Property; **99,25 % únicamente de esa muestra de 10 archivos activos**, NO producto), CPU/RSS y latencias experimentales en artifacts, y una misma matriz de fallos para Property y Host. [Task](tasks/m4-commonality-resilience.md), [auditoría](audit/m4-commonality-2026-10-19.md). M4.4 demostración y cierre integral sigue pendiente.

## M4.4 — Demostración y evidencia integral (2026-10-19)

**CLOSED — SOFTWARE LAB ONLY, CI #39226414601 SUCCESS:** orquestación de los M4.1–M4.3 ya validados, bundle reproducible con SHA256/HTML/NDJSON y pruebas de tampering, dashboard real y artifacts CI x64/ARM64. [Tasks](tasks/m4-integrated-closure.md), [auditoría](audit/m4-integrated-closure.md). El cierre de M4 será exclusivamente **software lab**; M5 debe encargarse del dispositivo, durabilidad real, kernel isolation de Property/Host y capacidad económica. M2 Cloud Lite externo permanece DEFERRED.

**Aceptación M4 completa:** [CI #39226414601](https://github.com/krukmat/logistica/actions/runs/39226414601) ARM64 178/178, x64 177 pass +1 skip; bundle SHA256 verificado en ambos y HTTP dashboard PASS. M4.1–M4.4 LAB CLOSED, no device/production GO. [Auditoría de cierre](audit/m4-integrated-closure.md).

## M5.1–M5.2 — Software instalado en lab (2026-10-19)

**CLOSED — SOFTWARE LAB ONLY, CI #39232965785 SUCCESS:** release staging temporal versionado con hash/verify/upgrade/rollback, test Edge autónomo empaquetado y reinicio de proceso, journal retenido, rechazo de fallos y acción UI; pruebas Linux x64/ARM64 añadidas. [Tasks](tasks/m5-reproducible-install-linux-lab.md). M5.3 hardware/real OS boot/systemd/kernel cuotas/corte energético **BLOCKED**. No elegir distribución, hardware definitivo ni crear servicios de sistema antes del gate.

**M5.1–M5.2 LAB closure:** [CI #39232965785](https://github.com/krukmat/logistica/actions/runs/39232965785), Linux x64 182 pass+1 skip, native ARM64 183/183, M5 package artifacts and dashboard E2E PASS. **No systemd/OS reboot, real device or kernel isolation for Property/Host certified.** M5.3 still BLOCKED hardware. [Audit](audit/m5-reproducible-install-2026-10-19.md).

## M5.4–M5.5 (2026-10-19)

**M5.4**: pruebas systemd reales en GitHub-hosted Linux SUCCESS, full VM Lima reboot **LAB_PASS 5/5 operator-reported**, cleanup PASS; **M5.4 CLOSED SOFTWARE LAB ONLY**. **M5.5** Property y Host kernel-isolated vía supervisor compartido CI **LAB_PASS 13/13 por perfil** ([CI #39239226280](https://github.com/krukmat/logistica/actions/runs/39239226280)), storage quota no enforced, Cloud mock y WAN sintética. Sigue pendiente la integración conjunta systemd+kernel en una VM persistente y la aceptación hardware M5.3. [Tasks](tasks/m5-4-5-systemd-linux-isolation.md).

**Lima VM reboot accepted (operator, 2026-10-19):** `pef-r28s-1g` actual stop/start, changed Linux `boot_id`, auto-started systemd service, new Edge session, durable journal retained offline. 5/5 PASS; cleanup PASS. This closes M5.4 lab acceptance, **not** the physical M5.3 gate or integrated systemd + M5.5 kernel-sandbox service. [Audit](audit/m5-4-5-systemd-isolation-2026-10-19.md).

## M5.6 — systemd + cgroup integration closed in CI lab (2026-10-19)

**CLOSED SOFTWARE LAB ONLY**, [CI #39246560682](https://github.com/krukmat/logistica/actions/runs/39246560682) SUCCESS: ARM64 195/195, x64 194 PASS+1 skip, Linux systemd + Property and Host kernel-sandboxed workers with journal durability/recovery in same CI execution. Dashboard inspection and independent 20-check evidence contract pass. No combined full VM reboot, production service or external Cloud. [Task](tasks/m5-6-integrated-linux-service.md). Next priority **M6 zero-cost Cloud Lite local**, rather than hardware procurement or paid cloud.

## M6 Cloud Lite local iniciado — M6.1 (2026-10-19)

M6.1: registro de dispositivos y autenticación por token en servidor HTTP real loopback, almacenamiento fsynced bajo directorio privado temporal y UI real; **CI acceptance pending**. M6.2 ingest/ACK, M6.3 Edge reconciliation y M6.4 cierre integral pendientes. Coste adicional de hosting **0 EUR**; Cloud mock sigue en otras demos. [Plan](tasks/m6-cloud-lite-local.md) · [auditoría](audit/m6-1-local-registry-2026-10-19.md).

## Cloud Lite M6 — avance laboratorio, 2026-10-19

M6.1/M6.2/M6.3 CLOSED SOFTWARE LAB (registry, ingesta durable y Edge real → HTTP Cloud Lite con HMAC/replay), M6.4 matriz real Property+Host PASS en CI #39271578783, integración dashboard/artefactos en verificación final. Cloud legacy mock sigue en demos antiguas; nuevo flujo no lo utiliza. Sin hosting ni hardware físico. Véase [plan](tasks/m6-cloud-lite-local.md).

**M6 closure:** M6.1–M6.4 CLOSED SOFTWARE LAB ONLY tras [CI #39272167885](https://github.com/krukmat/logistica/actions/runs/39272167885): ARM64 210 PASS, x64 209 PASS+1 skip, tablero y CLI x64/ARM64 con artifacts. El estado de verificación pendiente de líneas anteriores queda supersedido. Aún no hay cloud externo, costes nuevos de hosting, TLS remoto ni hardware físico. [Task](tasks/m6-cloud-lite-local.md).

## M7 — identidad Ed25519 y firma de releases, estado preliminar (2026-10-19)

M7.1/M7.2 IMPLEMENTED / CI_PENDING: keypair persistente local Ed25519 y signed upgrade/rollback con alta de autoridad software sin reemplazar instalador M5; dashboard CLI y CI añadidos. M7.3–M7.6 PROPOSED. Diferenciar `fsync` + software trust de TPM/secure boot y powercut. No se contrató Cloud ni hardware. [Tareas](tasks/m7-security-pilot.md) · [auditoría](audit/m7-identity-and-signed-release-2026-10-19.md).

**M7.1–M7.2 closed in CI software lab (2026-10-19):** [#39286831769](https://github.com/krukmat/logistica/actions/runs/39286831769) SUCCESS — x64 215 PASS+1 skip, ARM64 216 PASS, packaged signed Edge boot enforcement and dashboard HTTP E2E. No physical trusted boot, hardware rollback counter, hosted TLS or production security. [Task](tasks/m7-security-pilot.md).

## M7 full software branch, 2026-10-19

M7.1/M7.2 signed identity/release CLOSED LAB. M7.3 mTLS 1.3 local Cloud Lite CLOSED LAB x64/ARM64, M7.4 fsync operational recovery audit CLOSED LAB, M7.5 short real HTTP stress PASS (2–24h NOT_RUN), M7.6 evidence-backed software lab gate PASS **field pilot NO-GO**. No physical storage powercut, WAN NIC, energy/thermal benchmark or signed boot hardware, nor 72h backlog validation. Hosting additional 0 EUR. [CI #39295301813](https://github.com/krukmat/logistica/actions/runs/39295301813), [audit](audit/m7-3-6-security-pilot-lab-2026-10-19.md).
