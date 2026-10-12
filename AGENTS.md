# AGENTS.md — Contrato de trabajo para agentes PEF

## Lectura mínima y fuente de verdad

1. `README.md` → estado y navegación.
2. `docs/02-core-requirements.md` → especificación vigente y IDs `REQ-*`.
3. `docs/03-logical-architecture.md` y `docs/04-failure-offline-contract.md` → invariantes y fronteras.
4. Archivo específico de task (`05`, `06` o `07`).
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

## Entrega de cada task

Resumen de decisión → cambios en `.md` → requisitos afectados → tests/acceptance → riesgos y preguntas abiertas → estado real. Si no hay código ni benchmark, decirlo literalmente.
