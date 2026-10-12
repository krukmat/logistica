# 05 — Property/Host overlays, stress test y SKU (W1.4)

**Status:** DOCUMENTED; **arquitectura evaluada conceptualmente**, no benchmark ni compatibilidad de hardware certificada.

## Regla principal

`PEF Core (único) → Workload Contract (común) → Property | Host`. Diferencias se clasifican antes de abrir una task:

- `CONFIG`: policy/parametrización dentro de Core actual.
- `MODULE`: funcionalidad vertical aislada en Workload Runtime.
- `RESOURCE`: más CPU/RAM/storage/throughput, mismo software.
- `HARDWARE`: nueva capacidad física que no se resuelve con configuración/recursos básicos (radios, interfaces, UPS).

## A/B. Mapeo de necesidades

| Need | Property | Host | Clasificación / frontera |
|---|---|---|---|
| Fibra/5G/Starlink, failover | 2 WAN típico | 2–3 WAN típico | CONFIG, radios/módem externos HARDWARE opcional |
| Redes aisladas | trusted/IoT/security | guest/staff/IoT/security | CONFIG mediante primitivas genéricas; sin semantics verticales |
| APs, switches | convivir con equipos del usuario | convivir con WLAN profesional | integración externa, no Wi-Fi controller Core |
| Automatización/solar/accesos | módulos relevantes | uso puntual | MODULE |
| PMS/guest services/captive portal | no baseline | módulos relevantes | MODULE, no Core |
| Cámaras/NVR | opcional | opcional | MODULE + RESOURCE; no prometer offline sin módulo local |
| Storage/compute alto | Property Pro | Host | RESOURCE; SSD/NIC mayor sólo si W1.5 lo demuestra |
| HaLow/LoRa | extensiones finca | extensiones largas distancias | HARDWARE EXTENSION; no obligatorio |
| Operación offline, durable journal, recovery | sí | sí | CORE idéntico |

## C. Commonality (estimación, NO medida)

- `Core IP/invariantes`: **100% objetivo conceptual**.
- `Core software`: **90–95%** *hipótesis de ingeniería*; objetivo medir con test suite común.
- `Workload API`: **100% objetivo**; cambios verticales a API Core son señal de contaminación.
- `Arquitectura de hardware`: 70–85%, `exact BOM`: 50–70%, *estimaciones sin prototipo*.
- Vertical workloads: 20–40% común, **hipótesis**, no evidencia de code reuse.

**No utilizar los porcentajes para pricing, estrategia comercial o claims hasta tener implementación y medición.**

## D. Stress test de requisitos (ejercicio de diseño)

| Escenario límite | Resultado conceptual | Cambio aceptado |
|---|---|---|
| Todas WAN caídas días | `LOCAL_ONLY`, Core + local-capable workloads | ninguno; bounded journal necesario |
| NVR llena disco/carga CPU | Core no debe compartir cuota ilimitada | resource admission + separación P0/P1/P2 |
| Host con redes guest/staff | declarative Network Intent vía Supervisor | no introducir «Host network controller» |
| PMS externo no disponible | sólo Host module degradado | failure isolation |
| 150–250 dispositivos/muchos flows | RESOURCE; no sexto bloque | medir Networking Envelope |
| Cloud/fleet multi-site | Cloud Lite PoC basta | advanced fleet LATER |
| Config/OTA interrumpida | known-good/rollback | ya en W1.2 |

**Hallazgos incorporados sin sexto componente:**

1. `Resource admission & isolation` dentro de Workload Runtime.
2. `Network Intent` declarativo desde Runtime → Supervisor → Connectivity.
3. `Bounded Journal`: quotas, retention, prioridad y backpressure dentro de State + Journal.

## E. Contrato mínimo del workload (W1.3.I → W1.4.D)

Ejemplo **ilustrativo**, sin esquema final ni elección de tecnología:

```yaml
workload_id: example.property.automation
compatibility: pef-core-v0.1
connectivity_mode: LOCAL_ONLY_CAPABLE # INTERNET_OPTIONAL|INTERNET_REQUIRED
resources:
  cpu_request_millicores: TBD
  cpu_limit_millicores: TBD
  memory_request_mib: TBD
  memory_limit_mib: TBD
  storage_request_mib: TBD
  storage_limit_mib: TBD
network_intents:
  - kind: local_service_discovery
    scope: site
  - kind: egress
    destination_class: explicitly_approved
health:
  readiness: TBD
  liveness: TBD
  restart_policy: bounded
```

Runtime deberá soportar `register → validate/admit → start → health → stop/restart`, notificación de eventos y cuota de storage. `REJECT` si falta recurso/capacidad; degradación explícita cuando supera límites. Semánticas de requests/limits y medición se fijarán en W1.5.E / W1.6.

**Prohibido al workload**: modificar rutas, firewall, claves, P0/P1, otro workload o asumir privilegios host. Las necesidades de red son *intents* aprobados, no comandos nft/iptables.

## E/F. SKU hypothesis + architecture gate

**Producto hipotético:**

- `PEF Base` — Property estándar: minimizar coste, energía y footprint; sin NVR pesado como baseline.
- `PEF Pro` — Host / Property Pro: más capacidad red, almacenamiento, compute, módulos; **mismo Core**.
- **PoC recomendado:** un hardware de prueba razonablemente flexible que simule ambos perfiles mediante límites; esto no valida BOM ni power/thermal del futuro Base.

**Gate W1.4 conceptual:** Property y Host **encajan en el contrato lógico** con los tres refinamientos anteriores, sin requerir sexto Core. **Pendiente de evidencias**: test de red Host real, aislamiento bajo presión, fiabilidad de storage, commonality de software y viabilidad económica.

## Preguntas abiertas

- ¿Se necesita NIC física distinta para Host o basta VLAN trunk con switches existentes?
- ¿Qué workloads verdaderamente requieren funcionamiento offline, y cuáles son integraciones remotas solamente?
- ¿Qué coste de soporte y mayor consumo justifica el salto Base → Pro?
- ¿Network Intent básico es suficiente para casos guest reales sin incorporar un controller de hospitality?
