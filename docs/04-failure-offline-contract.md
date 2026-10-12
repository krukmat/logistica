# 04 — Failure & Offline Contract (W1.2)

**Status:** DOCUMENTED. Contrato conductual de diseño; **gates pendientes de test**. Las ventanas temporales y cifras de rendimiento pertenecen a [`06-resource-envelope.md`](06-resource-envelope.md).

## A. Taxonomía de fallos

| Dominio | Casos representativos |
|---|---|
| Transport | WAN primaria caída, degradación con enlace L2 activo, todas WAN perdidas, flapping, gateway upstream aislado, DNS externo, CGNAT/IP cambio, módem colgado, Starlink, packet loss/latencia |
| Cloud/control | control plane caído, mTLS roto, cloud parcial, config remota incoherente, partición larga/reconciliación |
| Software | crash de Connectivity/Supervisor/Journal/Runtime/Trust, workload crash, loop de reinicios, dependencia ausente |
| Storage | disco lleno, fs read-only, writes fallidos, corrupción P0/P1 o workload P2, backlog alto, lentitud, estado inconsistente tras reboot |
| Power/hardware | brownout/corte, boot incompleto, watchdog, térmica/throttling, NIC/SSD/módem ausentes |
| Lifecycle/security | OTA incompleta/firma inválida/version unhealthy, config que corta acceso, clave/identity inaccesible, cert expirado, NTP/clock incorrecto, revocación offline |

Severidad: `S0 info`, `S1 degradado`, `S2 crítico recuperable`, `S3 amenaza supervivencia/integridad`.

## B. Invariantes congelados

| ID | Invariante |
|---|---|
| INV-01 | **Local Survivability:** fallo WAN/cloud no detiene funciones locales esenciales |
| INV-02 | **Committed State Is Durable:** ACK implica durable, sin pérdida silenciosa |
| INV-03 | **Transport Independence:** Core superior abstrae fibra/5G/sat/Wi-Fi WAN |
| INV-04 | **Autonomous Recovery:** fallos locales recuperables sin intervención cloud/humana |
| INV-05 | **Known-Good State:** conservar estado válido para software/config/boot |
| INV-06 | **Graceful Degradation:** sacrificar extras/telemetría antes que Core |
| INV-07 | **Failure Isolation:** workload en fallo ≠ fallo del Core |
| INV-08 | **Every Material Failure Leaves Evidence:** aun sin cloud |
| INV-09 | **Local Authority During Partition:** Edge autoritativo sobre operación/observación local; nunca sobrescritura ciega |
| INV-10 | **Recovery Must Converge:** retries acotados, backoff/histéresis/escalación/safe mode |

**Orden de protección general:** identidad e integridad > P0/P1 > LAN y control local > recovery > servicios locales esenciales > extras > remote mgmt > analítica. La prioridad de networking frente a persistencia depende del fallo; jamás perder P1 silenciosamente para preservar un workload opcional.

## C. Modos / estados

| Máquina | Estados relevantes | Regla |
|---|---|---|
| Transport | UNKNOWN → CHECKING → HEALTHY/DEGRADED/FAILED → RECOVERING | `carrier/link-up` NO equivale a WAN healthy; health activo con histéresis |
| Agregado conectividad | MULTI_WAN_HEALTHY / REDUNDANCY_DEGRADED / CONNECTED / LOCAL_ONLY | `LOCAL_ONLY` es estado de operación admisible, no fallo fatal |
| Relación cloud | ONLINE / CLOUD_DISCONNECTED / LOCAL_ONLY / RECONNECTING | funciones remotas degradan sin detener LAN/local |
| Recovery/salud | BOOTING / HEALTHY / DEGRADED / RECOVERING / SAFE_MODE / CRITICAL | pasar a HEALTHY sólo tras health check + estabilidad |
| Seguridad remota | SECURE / SECURITY_DEGRADED / REMOTE_ISOLATED / SECURITY_RECOVERY | inseguridad remota no desactiva automáticamente LAN local |

**OPEN-STATE-01:** W1.3 había mezclado `LOCAL_ONLY` en «estado global» mientras W1.2 lo trataba como modo de conectividad. Para implementar se propone distinguir **estado de salud** de **modo de conectividad/cloud** (ej.: `HEALTHY + LOCAL_ONLY`). Mantener como refinamiento pendiente de W1.6, sin ocultar la ambigüedad original.

## D. Contrato offline / recuperación cloud

Al desaparecer Cloud pero seguir Internet: LAN/routing/DNS local, identidad cacheada, Core, journal, API, runtime y workloads compatibles siguen; configuración remota, fleet/OTA/remote mgmt pueden quedar indisponibles.

Al perder TODAS las WAN: las mismas funciones locales continúan cuando no dependen de servidores remotos. La recolección de eventos se guarda dentro de las cuotas del journal; cloud-bound actions no se pueden completar mientras offline.

**Rejoin:** (1) WAN healthy → (2) auth segura → (3) clock/identity sanity → (4) exchange revisions/cursors → (5) validar/reconciliar estado → (6) replay journal pendiente → (7) ACK, entonces ONLINE. Ante conflicto o rechazo, preservar last-known-good y mostrar deuda/alerta.

**Autoridades:** Site operational state = Edge; device registry/accounts = Cloud; entitlements = Cloud con cache local bounded; desired config = Cloud con última revisión válida cacheada; durable events = Edge hasta ingestion ACK. Políticas exactas de stale entitlements, clock y merge quedan abiertas para W1.6.

Los workloads deben declarar `LOCAL_ONLY_CAPABLE`, `INTERNET_OPTIONAL` o `INTERNET_REQUIRED`. No garantizar continuidad de SaaS terceros no localizables.

## E. Persistencia y política de presión

| Clase | Contenido | Pérdida bajo presión |
|---|---|---|
| `P0` crítico | identity ref, config válida, active/known-good version, recovery metadata | **prohibida silenciosamente** |
| `P1` operacional durable | committed events/actions, backlog con ACK | **prohibida silenciosamente**; backpressure/rechazar nuevas escrituras si no cabe |
| `P2` workload | vídeos/NVR, caches PMS/automation | degradable con aviso/política |
| `P3` descartable | debug, caches de métricas | descartar primero |

Storage pressure: eliminar/agrupar P3 → limitar P2 → proteger reserva P0/P1 → backpressure explícita o modo degradado si no puede garantizar persistencia. **No ACK si no se ha persistido**. Definir en W1.5.D tamaño/partición/fsync/wear/endurance y comportamiento ante hostil disk-full.

Config transaction: `RECEIVE → VALIDATE → STAGE → ACTIVATE → HEALTH_CHECK → COMMIT`, fallo => `ROLLBACK KNOWN_GOOD`.

Software update: validar firma/integridad → stage candidate → boot candidate → health pass COMMIT o fail ROLLBACK. Corte de energía no puede dejar el dispositivo sin ruta de arranque válida. Distribución remota a escala no es requisito v0.1.

Al reboot tras corte: validar almacenamiento P0, config known-good y journal committed antes de workload opcional; recuperación granular priorizada sobre reboot global.

## F. Trust, recovery y evidencia

- Error cloud authentication / overlay ⇒ remote management bloqueado, operación local sigue; **nunca fallback plaintext o bypass auth**.
- Identity inaccesible ⇒ **no regenerarla**, aislar remote functions y recovery local; LAN puede seguir en modo seguro según política.
- NTP ausente/reloj erróneo ⇒ preservar operación local con monotonic/last-known-trusted time; operaciones remotas sensibles pueden quedar bloqueadas.
- Expiry/revocación offline ⇒ política de stale trust por definir; no asumir verificación de revocación sin red.
- API local offline **siempre autenticada**; sin cloud no significa acceso anónimo.
- Recovery bounded: operación retry → restart proceso → reset subsystem → aislar workload → restaurar config good → software rollback → SAFE_MODE → reboot controlado. Health + stability window como condición de convergencia.

**Evidencia mínima** por incidente: event_id, correlation_id, site/device id, wall + monotonic timestamps, domain/component/failure/severity, old/new state, detection source, action/attempt/result, sw+config revisions, active transport, storage health, duration. El mismo `correlation_id` sigue el incidente hasta recovery.

| Clase observabilidad | Contenido | Prioridad |
|---|---|---|
| O0 | identidad/lifecycle/security critical | máxima |
| O1 | failures/recovery/state transitions | durable |
| O2 | operational metrics | resumir/agregar si presión |
| O3 | verbose/debug | descartar primero |

Rejoin: subir O0/O1 antes que O2/O3; health snapshot del Core, WANs, storage, identity, cloud, workloads.

## G. Acceptance gates / harness contract

Cada gate requiere escenario reproducible, resultado observado, logs/journal correlation_id y verificación del estado posterior. **Ninguno está ejecutado en este paquete**.

| Gate | Estímulo | Comportamiento requerido |
|---|---|---|
| G-CON-01 | desconectar WAN primaria | alternativa automática, sin control cloud |
| G-CON-02 | WAN degrada con carrier up | detección por health real |
| G-CON-03 | todas WAN fallan | LAN + Core + workloads local-only operan en `LOCAL_ONLY` |
| G-CON-04 | WAN flapping | no oscilación indefinida / failback condicionado |
| G-CLOUD-01 | cloud inaccesible | local continúa / admin local autenticado |
| G-CLOUD-02 | cloud regresa | reconcile/replay/ACK sin pérdida de P1 |
| G-CLOUD-03 | config cloud nueva durante partición | sin overwrite ciego del estado local |
| G-PER-01 | corte abrupto después de ACK | committed event presente tras reboot |
| G-PER-02 | corte durante config | boot con config válida (known-good) |
| G-PER-03 | llenar storage P2 | reserva Core/journal protegida |
| G-PER-04 | corromper datos workload P2 | Core no falla |
| G-SW-01 | matar workload | aislamiento; Core sigue funcionando |
| G-SW-02 | crash-loop persistente | retries bounded/aislamiento/escalación |
| G-OTA-01 | interrumpir OTA | queda ruta válida de boot |
| G-OTA-02 | candidate software unhealthy | rollback automático |
| G-OTA-03 | artefacto con firma inválida | rechazo, known-good permanece |
| G-SEC-01 | auth mTLS/cloud falla | remote blocked, local funciona |
| G-SEC-02 | overlay falla | LAN/Core siguen; no downgrade inseguro |
| G-SEC-03 | remover NTP | Core local sigue; seguridad sensible degradada si necesario |
| G-SEC-04 | identity inaccesible | no regeneración; recovery/remote isolation |
| G-REC-01 | fallo local recuperable | converge HEALTHY tras health/stability checks |
| G-REC-02 | fallo persistente | DEGRADED/SAFE_MODE, no loop infinito |
| G-OBS-01 | incidente offline | evidencia durable recuperable |
| G-OBS-02 | vuelve cloud | sincroniza historial correlacionado |
| G-OBS-03 | presión de disco | O0/O1 no se pierden silenciosamente |
| G-PEF-CORE-01 | fallar WAN o Cloud o vertical | identidad verificable, estado observable, committed durable, recuperación determinada y evidencia |
| **G-WRK-01** *(nuevo)* | workload solicita networking privilegiado | rechazo o aplicación **validada** vía Network Intent; sin bypass de firewall/identity |
| **G-WRK-02** *(nuevo)* | workload supera presupuesto declarado | admission denial o aislamiento, Core dentro de reserva |

`G-WRK-*` proceden del stress test W1.4.D y requieren especificación de fixture W1.7. Los porcentajes/latencias todavía no se han medido.
