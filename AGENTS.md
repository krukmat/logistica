# AGENTS.md — Contrato de trabajo para agentes PEF

## Lectura mínima y fuente de verdad

1. `README.md` → estado y navegación.
2. `docs/02-core-requirements.md` → especificación vigente y IDs `REQ-*`.
3. `docs/03-logical-architecture.md` y `docs/04-failure-offline-contract.md` → invariantes y fronteras.
4. Archivo específico de task (`05`, `06`, `07` o [`08` Resource Gate](docs/08-resource-gate.md)).
5. `source/deep-research-report-original.md` → antecedente largo, consultar por sección, no volcar entero al contexto salvo necesidad.

**Precedencia:** requisitos/decisiones explícitas de esta baseline > diseños provisionales de los otros documentos > material exploratorio del research. Una contradicción se registra, no se resuelve inventando una decisión.

## Regla de alcance

- Mantener **cinco bloques Edge**: Connectivity Core, Edge Supervisor, Local State + Journal, Workload Runtime, Trust + Recovery; más Cloud Lite.
- Property y Host comparten Core; añadir diferencias como `CONFIG`, `MODULE`, `RESOURCE` o `HARDWARE`, **con evidencia**.
- El cloud no puede convertirse en dependencia de arranque, seguridad de LAN ni continuidad de servicios locales.
- No incorporar NVR, PMS, AI, captive portal, HaLow, LoRa, controller Wi-Fi ni private 5G al Core de v0.1.
- No seleccionar OpenWrt/Debian, ARM/x86, SQLite, contenedores, WireGuard ni OTA framework antes de evaluar constraints (W1.5–W1.8).

## Semántica obligatoria de estado

- `PROPOSED`: idea o target preliminar.
- `DEFINED`: contrato expresado, sin prueba.
- `DOCUMENTED`: definición guardada en archivos versionables.
- `VALIDATED`: hay test/evidencia reproducible revisada.
- `IMPLEMENTED`: hay código/material entregado; no implica validación.
- `CLOSED`: requiere **entregable + DoD + evidencia correspondiente al tipo de task**; para un documento puede ser DOCUMENTED, pero nunca se interpreta como validación empírica.

## Disciplina de cambio

Para cualquier nuevo requerimiento o variación, informar:

```text
Task: W1.x.y
Requirement ID: REQ-...
Change: added|modified|deferred|removed
Rationale: ...
Classification: CORE|CONFIG|MODULE|RESOURCE|HARDWARE
Status: PROPOSED|DEFINED|DOCUMENTED|VALIDATED|IMPLEMENTED
Evidence: path / test / measurement, or "none"
Impacted docs: ...
Open decision: ...
```

- Reutilizar IDs; no renumerarlos silenciosamente.
- No convertir porcentajes de commonality, métricas objetivo o hipótesis de precios en hechos medidos.
- No atribuir funcionamiento durante blackout a módulos que no estén instalados y certificados `LOCAL_ONLY_CAPABLE`.
- Registrar prueba negativa, coste de soporte, presupuesto de recursos, rollback y datos conservados ante fallos.
- Documentación nueva en Markdown UTF-8 con tablas pequeñas, Mermaid para arquitectura, identificadores estables y enlaces relativos. Evitar duplicar tablas entre documentos; enlazar.
- No lanzar investigaciones profundas, comprar hardware, modificar infraestructura ni publicar repositorios sin indicación del responsable.

## Granularidad obligatoria por task

Cada task tiene uno o dos niveles internos, no más: `W1.5.C → W1.5.C1 → W1.5.C1.a`. El segundo nivel es opcional y sólo existe si genera evidencia separada. No descomponer en tareas triviales de lectura/edición que dupliquen entregables. Registrar ID, dependencias, input, output, DoD, estado y test pendiente; marcar claramente DOCUMENTED frente a VALIDATED. [W1.5](docs/tasks/w1.5-resource-execution.md) es el ejemplo vivo. Trabajar secuencialmente en la task activa y publicar cambios con commit verificable.

## Resumen obligatorio antes de ejecutar cada task

Tras descomponer la task con la granularidad acordada, **antes de iniciar su ejecución** comunicar al responsable un resumen breve (normalmente 4–8 líneas) que incluya:

1. **Task y objetivo:** ID, propósito y valor arquitectónico/funcional.
2. **Subtasks relevantes:** sólo las 2–4 más importantes, manteniendo IDs de primer o segundo nivel según necesidad.
3. **Entregable y DoD:** qué documento, código o evidencia se generará y cómo sabremos que terminó.
4. **Dependencias o riesgo decisivo:** sólo si afecta al orden o al alcance.

El resumen es un **preámbulo de ejecución**, no una solicitud de autorización automática ni una nueva task. No repetir todo el plan granular ni comenzar trabajos sin explicar primero qué se va a ejecutar. Si la task requiere aprobación explícita por su impacto, pedirla; en los demás casos continuar según el mandato existente. Al cerrar, informar resultado y commit, separando `DOCUMENTED` de `VALIDATED`.

## Entrega de cada task

Resumen de decisión → cambios en `.md` → requisitos afectados → tests/acceptance → riesgos y preguntas abiertas → estado real. Si no hay código ni benchmark, decirlo literalmente.

## Puerta obligatoria de integración del emulador (W1.9.P1)

**Mandato permanente del responsable (2026-10-12):** una funcionalidad de PEF no puede marcarse como `IMPLEMENTED` o `CLOSED` sin estar **alcanzable, visible y verificable desde el emulador/control panel**, además de tener pruebas automatizadas del camino implementado. Esto aplica a las nuevas tasks, incluidos cambios de seguridad, journal, conectividad, cloud mock y protocolos.

1. Cada task de código debe indicar su **punto de entrada en el dashboard** (botón, selector o flujo), adapter reutilizado y estado/trace observable. No basta con documentar un escenario o escribir tests en un módulo que la UI no invoque.
2. Añadir/actualizar test de integración `dashboard HTTP → action → módulo real → estado/evidencia → UI` (o prueba de cliente cuando sea factible) y conservar el gate `npm test` / GitHub Actions en verde.
3. Si la función requiere Linux CAP_NET_ADMIN, interfaces físicas, root, PKI o hardware no presente, exponer en la UI su **estado de no disponibilidad, motivo y evidencia del laboratorio aislado**, sin ejecutarla en el Mac o elevar resultados simulados a hardware `VALIDATED`.
4. Distinguir en todas las visualizaciones `SIM_PASS`, `LAB_PASS`, `BLOCKED`, `NOT_RUN` y datos reales vs mock. No mostrar `fsync` de un fichero de laboratorio como power-loss probado.
5. Orden de ejecución obligatorio: **Core/adapter → API/UI del emulador → pruebas de extremo a extremo → documentación/CI**. El DoD requiere las cuatro partes; sin ellas la task queda `PARTIAL`.
6. Cuando se alteren contratos, identidad, estados o eventos, revisar dashboard, scenarios, tests, `docs/12-emulator.md`, `README.md` y tasks. Evitar bifurcar la semántica entre dashboard y Core.

El dashboard de laboratorio opera sin privilegios sobre ficheros temporales creados por el servidor y probes sintéticos; el escenario `linux-lab` sigue ejecutándose únicamente en un runner efímero autorizado.

El registro de capacidades [`docs/contracts/emulator-integration-v1.json`](docs/contracts/emulator-integration-v1.json) y `test/dashboard-integration-gate.test.js` implementan parte de esta puerta en CI. Es responsabilidad del agente **añadir las nuevas tasks a ese registro y probar la acción/UI/API real** antes de dar la task por cerrada; el registro por sí solo no sustituye el E2E.

## Gate de portabilidad hardware (W1.9.R — obligatorio antes de avanzar features)

**Regla permanente:** una función destinada al producto debe implementar su **dominio en `src/core/`** y exponer dependencias de IO como puertos. No se admite que `src/core/` importe `src/emulator/`, `node:fs`, `node:child_process` ni que ejecute comandos del host. Los ports concretos viven en `src/adapters/`, compuestos por `src/runtime/` y compartidos por emulador/CI/hardware.

Una feature nueva no está `IMPLEMENTED/CLOSED` si no cumple simultáneamente: (1) Core común/adapter explícito; (2) integración en emulador/dashboard con evidencia visible; (3) tests de contrato/paridad `sim ↔ runtime/Linux` cuando aplique; (4) regresión E2E de API/durabilidad; (5) documentación y CI verde. Mantener `docs/contracts/emulator-integration-v1.json` sincronizado. Rechazar ACK de journal sin `fsyncCompleted` o duplicado realmente confirmado; jamás inventar durabilidad.

**Alcance obligatorio:** backend `device` es `BLOCKED/NOT_RUN` hasta instalar drivers, PKI, boot/init/OTA y correr pruebas físicas. Usar `openRuntimeBackend("linux-lab")` únicamente con guardas GitHub-hosted/root/ns; no ejecutar scripts privilegiados en Mac/hosts de producción. El servidor del dashboard es cliente inyectable, nunca dueño obligatorio del proceso Edge. [Arquitectura R](docs/18-hardware-portability-bridge.md) y [tasks R](docs/tasks/w1.9-hardware-portability.md).

## Gate W1.9.S — Workload isolation (2026-10-12)

La admisión/health/restart de workloads debe residir en `src/core/`, recibir un Process Driver como port y aceptar sólo manifiestos versionados/autorizados. El dashboard de Mac usa `node-process-driver` allowlisted; siempre etiquetarlo `NODE_PROCESS_ONLY` con `actualLimitsEnforced=false` y sin afirmar aislamiento de red, CPU, RAM ni FS. En Linux CI las cuotas deben derivar del **mismo manifest** mediante `src/adapters/linux-workload-isolation.js` y probarse sólo tras preflight GitHub-hosted/root/opt-in en cgroup y namespaces efímeros. No habilitar shell arbitrario, privilegios de host ni networking unrestricted como alternativa. Cualquier nuevo workload debe incluir prueba offline, supervisor real, rechazos, trace en emulador, S3 CI y cleanup. **Pendiente:** enlazar el driver Linux seguro al supervisor del producto; no marcarlo producción/certificado ni cerrar R6/W1.8.

## Gate S3.4–S3.8 (Linux supervisor kernel driver, CI-only)

`src/adapters/linux-isolated-process-driver.js` **ya es un driver real del `ProcessDriver` del Core Supervisor**, pero su constructor *debe* seguir bloqueado fuera de GitHub-hosted Linux/root/opt-in y de un cgroup/netns efímero prevalidado. Mantener restricciones cgroup CPU/RAM/PIDs/swap 0 derivadas del mismo manifiesto, comprobarlas tras escritura y no ejecutar procesos arbitrarios. El supervisor debe terminar procesos no sanos antes de reintentar; registrar crash, CPU throttle, memory OOM y cleanup. El emulador Mac **siempre** informa `actualLimitsEnforced=false` para sus hijos, mostrando solamente evidencia CI-only del Linux adapter. No declarar productor/hardware VALIDATED sin device driver/PKI/secure runtime y pruebas físicas. [20 — Supervised Linux Driver](docs/20-supervised-linux-driver.md).

## W1.9.T — software ready / hardware handoff rule

Autonomous product runtime is `src/runtime/autonomous-edge.js`, booted independently by `bin/pef-edge.js`; keep shared domain logic under `src/core/`. Maintain config validation `edge-config.js` and localhost-only operator API with token from environment, no embedded/committed credentials. The `virtual-lab` Mac workload uses an unsandboxed allowlisted process and **MUST NOT** claim Linux cgroup enforcement; guarded Linux labs can inject `LinuxIsolatedProcessDriver`. Never allow `linux-lab` to fall back silently to the unsandboxed child. Do not move PID advisory lab lock to production without a kernel-grade ownership strategy. Every change to runtime must be visible via emulator smoke and CI.

Hardware transition requires the third GitHub job `prehardware-gate` PASS with actual emulator and Linux artifacts, including daemon-plus-isolated-worker assertions. Gate semantics: `GO_FOR_DEVICE_INTEGRATION_ONLY`, never production GO. `docs/contracts/hardware-handoff-v1.json` lists six physical BLOCKED groups. Real NIC, security/provisioning, service installation/reboot, durability powercut, quotas and W1.8 tests belong to a future device phase; systemd unit example is not installed, tested, or authorized. [W1.9.T](docs/21-autonomous-edge-handoff.md).
