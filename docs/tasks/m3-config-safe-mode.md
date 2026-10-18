# M3.3–M3.4 — Configuración y recuperación del supervisor

**2026-10-18 · LAB-ONLY · coste adicional 0 €.** La prueba local M3.1/M3.2 aportada por el operador había confirmado `LAB_PASS`, `fsyncCompleted:true`, reinicio tras SIGKILL y deduplicación; `kernelLinuxLockVerified:false` en Mac.

## Alcance: solo política operativa del supervisor

El cambio revisado NO modifica configuración de red, identidad, journal, OTA, ni desired-config de un Cloud real. Los campos permitidos son `maxRestarts`, `restartDelayMs`, `healthIntervalMs` y `healthFailures`. El componente `src/runtime/m3-policy-store.js` mantiene `pef-m3-supervisor-policy.json` en el directorio ya validado del Edge. Escribe mediante archivo temporal privado, `fsync`, rename y `fsync` de directorio; valida checksum, identidad y revisión. El checksum sirve para detectar corrupción accidental, no constituye una firma contra actores privilegiados.

| Task | Subtasks | Resultado / DoD | Estado |
| --- | --- | --- | --- |
| **M3.3** | **3.3.1:** VALIDATE + STAGE con CAS de revisión; **3.3.2:** ACTIVATE → health real → COMMIT o ROLLBACK | Revisión obsoleta rechazada; COMMIT persistido; health fallido revierte; stage interrumpido se descarta en boot | **CLOSED, laboratorio** |
| **M3.4** | **3.4.1:** SAFE_MODE tras agotar presupuesto o incertidumbre de persistencia; **3.4.2:** recuperación local con token, negativa sin autorización | Sin reinicios infinitos ni falso ACK; datos del journal conservados tras SIGKILL y recuperación | **CLOSED, laboratorio** |

## Evidencia real

- CI: [run #39154660415](https://github.com/krukmat/logistica/actions/runs/39154660415), **SUCCESS**. 157/157 tests ARM64, 156 tests PASS + 1 platform skip en x64. Linux namespace y prehardware PASS.
- Artefacto CI: `m3-transactional-recovery-39154660415` generado por `npm run m3:recovery` (JSON de la ejecución); `m3-autonomous-lifecycle-39154660415` conserva la prueba anterior.
- `test/m3-policy-store.test.js`: firma de alcance, revisiones secuenciales, stage interrumpido, commit persistido, corrupción/digest, permisos inseguros.
- `test/m3-recovery.test.js`: Edge autónomo con recibo realmente fsynced, commit, rechazo stale revision, rollback por health fallido, SAFE_MODE por segundo SIGKILL, token inválido rechazado, recuperación local y recibo conservado.
- Dashboard → **Laboratorio integrado → M3.3–M3.4**: botón y API `m3Recovery` reutilizan `runM3RecoverySmoke`, ejecutando un proceso Edge separado. Registro de capacidades actualizado.

## Reproducción

```bash
cd ~/logistica
git switch main && git pull --ff-only
npm run m3:recovery
npm run dashboard
```

Con evidencias JSON: `npm run m3:recovery -- --output /tmp/pef-m3-recovery.json`.

## Límites

- `SAFE_MODE` y `recoverLocal()` están disponibles en el gestor **en proceso**; no hay aún un canal de recuperación remoto ni firmado. `recoverLocal` no es un endpoint de red; requiere token del operador en el laboratorio.
- Las credenciales de laboratorio y el checksum local **no certifican** PKI/mTLS, identidad hardware, secure boot ni anti-tampering ante root.
- Reconfigurar identidad del Edge o WAN productiva mediante esta API permanece **prohibido**. La revisión del watchdog no es la revisión efectiva de configuración del producto.
- No se instalaron servicios de sistema, hardware ni Cloud Lite; ninguna prueba de corte eléctrico/microSD ni 72h realizada.
- El próximo bloque es **M3.5** API local/diagnósticos y **M3.6** evidencias integrales con vídeo, no volver a ampliar el Core por motivos de laboratorio sin demanda.

**Requisitos afectados:** `REQ-SUP-01/02` parcial en supervisión local; `REQ-API-01` sigue pendiente de política de autoridades productiva; `REQ-STA-01` conserva su ACK tras `fsync` del SO sin aval físico.
