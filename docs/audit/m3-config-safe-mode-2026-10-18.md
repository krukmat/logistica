# Auditoría M3.3/M3.4 — Configuración transaccional y SAFE_MODE

**2026-10-18.** [GitHub Actions #39154660415](https://github.com/krukmat/logistica/actions/runs/39154660415) **SUCCESS**, código probado de integración en commit `da197b6f4b36780dcca129bc478a2f76f0697ca8`.

**Cifras:** ARM64 157 tests, 157 PASS, 0 FAIL. Emulador Linux x64 157 tests, 156 PASS, 1 skip por plataforma, 0 FAIL; los jobs `netns-lab` y `Pre-hardware software handoff` SUCCESS.

**Artefactos:** `m3-transactional-recovery-39154660415` (JSON del flujo), `m3-autonomous-lifecycle-39154660415` (JSON del ciclo inicial). Son ejecuciones independientes; no mezclar IDs de evidencia.

## Gates cubiertos

| Gate | Resultado comprobado |
| --- | --- |
| Configura supervisor | política validada, stage duradero, health y commit de revisión 2 |
| Revision stale | cambio rechazado sin entrar innecesariamente en SAFE_MODE |
| Validación salud fallida | rollback deja revisión 2 activa, no emite un nuevo commit |
| Config interrumpida | al reabrir, abandona staged y retiene last-known-good |
| Corrupción/permisos | rechazo del fichero de política, sin restauración silenciosa |
| Falla Edge repetidamente | SAFE_MODE sin bucle infinito; razón RESTART_BUDGET_EXHAUSTED |
| Recuperación | token inválido denegado; operador in-process autenticado recupera Edge y recibo |
| Dashboard | acción HTTP al `m3Recovery` corre E2E real en un directorio temporal aislado |

## Decisión

**M3.3 y M3.4: CLOSED solo como software LAB.** No son una implementación de la administración de configuración firmada del producto, del seguro arranque físico, de rollback OS/OTA ni de recuperación remota. No servicios de pago. Próximas tareas M3.5/M3.6.
