# W1.9.Q — Sitio virtual de logística: E2E local-first

**Estado:** implementado y probado exclusivamente en laboratorio. Cloud, WAN del panel y dispositivo son mocks; el journal temporal realiza `fsync` en el SO anfitrión. Las rutas Linux reales se prueban por separado en CI.

## Arquitectura del flujo

```mermaid
flowchart LR
  O["Operador / Dashboard"] --> API["Local HTTP API<br/>POST /api/local/receipts"]
  API --> SERVICE["Recepción de paquetes<br/>idempotencia por receiptId"]
  SERVICE --> P1["Journal O1 compartido<br/>append + fsync"]
  P1 --> LOCAL["Estado local recuperable"]
  P1 --> SYNC["Replay cuando vuelva WAN"]
  SYNC --> CLOUD["Cloud mock<br/>dedup + ACK"]
  CLOUD --> ACK["CLOUD_ACK + fsync local"]
  ACK --> LOCAL
```

## Secuencia offline → recuperación

```mermaid
sequenceDiagram
  participant UI as Operador
  participant API as Local API
  participant J as P1 / OS fsync
  participant C as Cloud mock
  UI->>API: Registrar receiptId y packageId
  API->>J: EVENT O1 con ID estable
  J-->>API: ACK después de fsync
  API-->>UI: 201 RECEIVED
  Note over UI,C: WAN principal y respaldo caídos
  UI->>API: Repetir la misma recepción
  API-->>UI: 200 Duplicate (sin doble evento)
  Note over UI,C: WAN recuperada
  J->>C: Replay del evento pendiente
  C-->>J: ACK válido y deduplicable
  J->>J: CLOUD_ACK + fsync
```

## Prueba reproducible en macOS

```bash
cd ~/logistica
git switch main && git pull
npm test
npm run dashboard
```

Abrir `http://127.0.0.1:8787` → **Laboratorio integrado**. Cortar WAN primaria y respaldo; registrar `R001` / `PKG001` desde el formulario **Recepción logística local**. Debe aparecer `RECEIVED` con fsync confirmado y Cloud pendiente. Repetir igual: duplicado sin nueva recepción; repetir ID con otro paquete: conflicto. Reiniciar sesión: el registro sigue disponible. Recuperar WAN primaria y sincronizar: aparece `cloudAcked=true`; compactar y reiniciar: O1 permanece.

La API exige token de sesión del panel, escucha sólo en `127.0.0.1` y no está publicada a la LAN real. `POST` devuelve 201 (nuevo), 200 (duplicado), 409 (conflicto), 400 (entrada inválida) o 507 (journal lleno); `GET` expone la vista retenida. Fuera del modo laboratorio devuelve 409.

**Límites:** un registro se considera aceptado únicamente si el journal devolvió ACK tras `fsync`; no hay durabilidad certificada ante corte de energía física, Cloud real ni entrega exactamente-una-vez fuera del mock. La aceptación local puede rechazarse explícitamente por cuota; nunca confirmar silenciosamente un evento no persistido.
