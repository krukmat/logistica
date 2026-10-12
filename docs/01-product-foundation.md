# 01 — Product foundation / Business context

**Version:** v0.1 · **Status:** DOCUMENTED (thesis, unvalidated) · **Source:** [`research original`](../source/deep-research-report-original.md), secciones «Resumen ejecutivo», «Producto y arquitectura B2C recomendada», «Modelo económico», «Beachheads».

## Producto que intentamos validar

**Private Edge Fabric (PEF)** convierte un emplazamiento pequeño en una unidad digital privada, resiliente y administrable. Se apoya en conectividad existente, permite servicios y persistencia locales, mantiene funciones críticas durante pérdida de WAN/cloud y sincroniza cuando vuelve la conexión.

**Problema comprado:** minimizar interrupciones operativas, desplazamientos al sitio, puntos únicos de fallo y complejidad de gestionar conectividad + servicios locales. El comprador **no compra** «SD-WAN doméstico», infraestructura telecom privada o el número de interfaces de red.

**Tesis de producto:** `Resilient Local Cloud + Multi-WAN + Private Site Network + Remote Operations`. *Cloud is management, not survival.*

**Límite honesto:** `LOCAL_ONLY` conserva la operación local pero **no garantiza acceso remoto** mientras no exista ruta alcanzable. Un workload externo (por ejemplo PMS cloud, pagos online o cámara 100% cloud) sólo continúa si sus dependencias también están disponibles; instalar PEF no vuelve local a terceros.

## Segmentos y estrategia de validación

| Segmento | Comprador/usuario | Problema que prueba | Prioridad W1 |
|---|---|---|---|
| **Property** | segunda residencia, finca, vivienda rural; propietario/instalador | continuidad offline, cámaras/automatización locales opcionales, menor visita física | **Overlay inicial / beachhead principal** |
| **Host** | camping, glamping, B&B; operador/integrador | conectividad multi-WAN, LAN segmentada, soporte remoto, servicios operativos | **Overlay inicial / margen potencial** |
| Nomad | camper/RV | conectividad móvil, coste/potencia, autonomía | diferido; investigación original lo conserva como tercer PoC potencial |

Property y Host **no definen dos arquitecturas**, sino dos cargas sobre un Core común. La capacidad y los workloads no deben cambiar el contrato Core.

## Propuesta de valor / límites de integración

| Sí ofrece PEF Core | No promete el Core por sí solo |
|---|---|
| Política y recuperación de WAN; LAN local funcional | Conectividad a Internet si **todas** las WAN están caídas |
| Estado/eventos durables; recuperación autónoma | Retención infinita con disco finito |
| Runtime para workloads locales aislados | Funciones específicas de cámaras, NVR, PMS, alarmas o energía sin módulos |
| Identidad del appliance y acceso remoto autenticado cuando conectable | Sustituir ISP, APs existentes o productos propietarios por defecto |
| Control cloud limitado / reconciliación | Portal completo de fleet/analytics, soporte o billing v0.1 |

## Business model: hipótesis heredadas del research (NO validadas)

- **Hardware vendido upfront + SaaS por gestión/operación remota + conectividad contratada por cliente** (BYO connectivity).
- No subvencionar hardware; no revender conectividad al inicio.
- Hipótesis de WTP, **no precios aprobados**: Property en el research ~€15–29/mes; Host ~€49–149/mes. Rangos de instalación de referencia: Property ~€350–1.200; Host / B2B2C ~€1.500–5.000+, con variaciones de servicio y equipamiento. Véanse tablas originales; no confundir con BOM probado.
- Los canales potenciales incluyen instaladores de seguridad, domótica, solar, IT hospitality y proveedores PMS/servicios rurales.

## Hipótesis comerciales que deben probarse antes de producto

| ID | Hipótesis falsable | Evidencia futura |
|---|---|---|
| BIZ-01 | Continuidad/local-first tiene valor mayor que «backup WAN» aislado | pilotos con incidentes reales y workflows preservados |
| BIZ-02 | Propietarios pagan por menos visitas físicas y soporte | disposición a pagar demostrada con preorden/piloto pagado |
| BIZ-03 | Host puede monetizar por sitio sin soporte prohibitivo | coste real soporte/sitio/mes; tickets, visitas evitadas |
| BIZ-04 | Mismo Core permite Property y Host con bajo coste incremental | misma suite de conformidad y contratos Workload API |
| BIZ-05 | Instalación escalable sin expertos en redes | tiempos observados; fallos de onboarding; soporte |
| BIZ-06 | Cloud Lite aporta recurrencia sin ser SPOF | retención y uso real de capacidades de gestión |

El informe inicial propone para PoC de Property **10–20 sitios / 60–90 días** y para Host **dos tipos de alojamiento** durante meses; son propuestas de validación, no compromisos o pilotos realizados.

## Decisiones de producto y riesgos

- Un Core; productos separados por módulos/perfil de recursos. Base/Pro son hipótesis SKU, no configuraciones de fábrica aprobadas.
- Usar hardware comercial y conectividad BYO para PoC. Sin PCB propia.
- HaLow y LoRa: extensiones sólo si hay retorno demostrado; private 5G fuera de v0.1.
- Riesgo principal: red redundante sola es mercado comoditizado; diferenciación depende de workloads **realmente** locales, operación sencilla y recuperación verificable.
- Riesgo estratégico: soporte mensual, instalación, privacidad/seguridad y cumplimiento UE deben medirse/validarse. Afirmaciones regulatorias del research y precios competitivos no han sido re-verificados para esta baseline.

## Decisión de paso

**GO para investigación técnica y PoC restringido**, no para lanzar producto, asumir market fit ni hacer promesas SLA.
