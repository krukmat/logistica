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
