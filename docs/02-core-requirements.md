# 02 — Core requirements baseline v0.1 (W1.1 + W1.4 refinements)

**Status:** DOCUMENTED, **not** empirically validated. **Priority definition:** `MUST-POC` = capacidad necesaria para falsificar la tesis PEF v0.1; `LATER` = no obliga al PoC inicial; `OUT` = excluida del alcance. Una prioridad no equivale a una selección de librería o proceso.

## A. Requisitos funcionales y no funcionales

| ID | Prioridad | Contrato observable | Owner lógico | Gate principal |
|---|---|---|---|---|
| REQ-CON-01 | MUST-POC | Monitorizar ≥2 transports activos Base / ≥3 Pro; distinguir link-up de WAN saludable | Connectivity | G-CON-01/02 |
| REQ-CON-02 | MUST-POC | Seleccionar WAN, failover/failback con histéresis, sin flapping ilimitado; sin bonding obligatorio | Connectivity | G-CON-01/04 |
| REQ-CON-03 | MUST-POC | LAN básica local: routing/NAT, DHCP/DNS, aislamiento/redes lógicas y firewall, incluso sin Internet | Connectivity | G-CON-03 |
| REQ-CON-04 | MUST-POC | Exponer disponibilidad y salud normalizadas; no filtrar tecnología de underlay a otros bloques | Connectivity | G-CON-02 |
| REQ-SUP-01 | MUST-POC | Supervisar modos de operación, estado observado/efectivo y reconciliación de desired config | Supervisor | G-CLOUD-02/03 |
| REQ-SUP-02 | MUST-POC | Aplicar cambios como transacción: validate → stage → activate → health → commit/rollback | Supervisor + Recovery | G-PER-02 |
| REQ-STA-01 | MUST-POC | ACK de evento sólo después de persistirlo; committed state sobrevive power loss | State + Journal | G-PER-01 |
| REQ-STA-02 | MUST-POC | Backlog store-and-forward con cursores, cuotas, prioridad y backpressure; no cola infinita | State + Journal | G-CLOUD-02, G-OBS-03 |
| REQ-STA-03 | MUST-POC | Proteger P0/P1 frente a agotamiento por datos P2/P3 de workload/telemetría | State + Journal | G-PER-03 |
| REQ-WRK-01 | MUST-POC | Registrar, configurar, ejecutar/parar, medir health y reiniciar workloads independientes del Core | Workload Runtime | G-SW-01/02 |
| REQ-WRK-02 | MUST-POC | Resource admission, quotas/limits y aislamiento de CPU/RAM/storage para impedir agotamiento del Core | Workload Runtime | G-SW-01, G-PER-03 |
| REQ-WRK-03 | MUST-POC | Workload Network Intent declarativo; no escritura directa de routing/firewall/identity | Runtime → Supervisor/Connectivity | G-WRK-01* |
| REQ-SEC-01 | MUST-POC | Identidad persistente de appliance; nunca regenerarla silenciosamente tras fallo | Trust + Recovery | G-SEC-04 |
| REQ-SEC-02 | MUST-POC | Canal remoto autenticado y verificación de configuración/artefactos; nunca fallback inseguro | Trust + Recovery | G-SEC-01/02, G-OTA-03 |
| REQ-REC-01 | MUST-POC | Recovery autónomo acotado, health checks, watchdog hooks, safe mode, escalación trazable | Trust + Recovery | G-REC-01/02 |
| REQ-REC-02 | MUST-POC | Known-good y rollback de configuración/software, sin ruta de boot inválida por OTA interrumpida | Supervisor + State + Recovery | G-OTA-01/02 |
| REQ-OBS-01 | MUST-POC | Evidencia durable de fallos, acciones y recuperaciones offline; sincronizar luego | Todos → State | G-OBS-01/02 |
| REQ-API-01 | MUST-POC | API local mínima para status/health y recovery autenticado; sin UI completa obligatoria | Trust + Recovery / Supervisor | G-CLOUD-01 |
| REQ-LOC-01 | MUST-POC | Servicios esenciales del sitio sobreviven a cloud loss / all-WAN loss si son local-only-capable | Core + Runtime | G-PEF-CORE-01 |
| REQ-CLO-01 | MUST-POC | Cloud Lite: device registry, desired configuration, event/status ingestion; no dependencia para boot | Cloud Lite | G-CLOUD-01/02 |

`* G-WRK-01` es gate propuesto para W1.7 (ver `04-failure-offline-contract.md`), no parte de los gates originales W1.2.

### Nota de alcance de signed lifecycle

La **capacidad local** de validar firma e impedir activación insegura y **rollback software/config** siguen siendo `MUST-POC`. La **plataforma cloud de distribución OTA/fleet/UI** es `LATER`. No interpretar esto como «OTA íntegramente implementado».

## B. Decisiones diferidas

| Estado | Capacidades |
|---|---|
| `LATER` | Fleet management completo, avanzada identidad de usuarios/RBAC, UI web completa, reporting/analytics cloud, notificaciones, soporte remoto avanzado, OTA distribution a escala, policy engine avanzado, QoS y captive portal, integración de controladores Wi-Fi, billing, multi-tenant management |
| `MODULE` | Cámaras/NVR, automatización, energía/solar, acceso/alarma, PMS/guest operations, telemetría sectorial/AI |
| `EXTENSION` | HaLow, LoRaWAN, módem 4G/5G integrado, antenas y radios, almacenamiento especializado; todo opcional y sujeto a caso de uso |
| `OUT v0.1` | 5G privado, PCB propia para PoC, bonding mandatorio, SD-WAN compleja, Kubernetes/k3s, orquestación distribuida, reventa de conectividad, AI platform propia, router/AP all-in-one obligatorio |

## C. Requisitos arquitectónicos, no compromisos físicos

- **Un Core compartido** Property/Host. Misma `Workload API` objetivo, configuración y recursos escalables.
- La autoridad de **estado efectivo/local** pertenece al Edge durante partición; cloud prescribe intención y gestiona dispositivos.
- No se impone ARM, x86, RK3576, OpenWrt, Debian, SQLite, contenedores, protocolos RPC ni TPM antes de W1.5–W1.8.
- Persistencia con prioridad `P0 > P1 > P2 > P3` y evidencia `O0 > O1 > O2 > O3` (definiciones en contrato de fallos).
- **Operación offline no equivale a acceso remoto offline.** La disponibilidad local no es disponibilidad de un PMS cloud u otro servicio tercero.

## D. Criterios y cambios de requisitos

Los gates de fallos detallados están en [`04`](04-failure-offline-contract.md); los números propuestos en [`06`](06-resource-envelope.md). Para cerrar una capacidad: contrato → test reproducible → medición/evidencia → actualización de estado. Los valores `MUST` de W1.5.B son **objetivos propuestos de dimensionamiento**, no gates certificados.

## E. Trazabilidad de refinamientos

| Origen | Cambio consolidado | IDs |
|---|---|---|
| W1.1 | Agrupar capacidades en cinco componentes en lugar de 15+ servicios | todos |
| W1.2 | Local survivability, durability, trust, bounded recovery, evidence | REQ-STA, LOC, SEC, REC, OBS |
| W1.3 | Owners e interfaces lógicas; cloud management-only | SUP, CLO, API |
| W1.4.D | Resource admission, network intent y bounded journal | WRK-02/03, STA-02/03 |
| W1.5.A/B | Escenarios de carga y networking provisional | REQ-CON-01 + [`06`](06-resource-envelope.md) |
| W1.5.C | Presupuesto CPU/RAM provisional y carga bajo presión | REQ-WRK-02, REQ-REC-01 + [`06`](06-resource-envelope.md) |
| W1.5.D | Modelo 72 h/7 d, protección P0/P1, ACK/backpressure, endurance (sin mediciones) | REQ-STA-01/02/03, REQ-REC-02, REQ-WRK-02, REQ-OBS-01 + [`06`](06-resource-envelope.md) |
