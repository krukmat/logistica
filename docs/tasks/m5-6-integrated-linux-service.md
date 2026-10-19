# M5.6 — Integrated Linux systemd + kernel-isolated Property and Host

**2026-10-19 · `main` · Status: CLOSED — CI SOFTWARE LAB ONLY**

## Goal and scope

Combine previously independent M5.1/M5.4/M5.5 capabilities in one execution:
`M5 staged release → real systemd PID1 → standalone Edge → shared Supervisor → LinuxIsolatedProcessDriver → Property/Host Site Operations worker`. No new application Core. No physical hardware or external Cloud Lite.

## Tasks and acceptance

| Task | Dependencies | DoD | Evidence / state |
| --- | --- | --- | --- |
| M5.6.1 | M5.1 + M5.4 + M5.5 | Installed release includes CI-only Edge entrypoint; fail-closed Linux root/GitHub-hosted preflight, no Node fallback | `src/runtime/m56-kernel-service.js`, `bin/pef-m56-edge.js`, `test/m56-kernel-service.test.js` — CLOSED LAB |
| M5.6.2 | M5.6.1 | Service starts both profile overlays with real kernel-enforced resources, responds to business HTTP, fsyncs ALERT/ACK, survives SIGKILL via systemd restart, reopens journal | `scripts/lab/m56-systemd-kernel-smoke.sh`; 10 checks/profile; CI #39246560682 — CLOSED LAB |
| M5.6.3 | M5.6.2 | Dashboard action returns truthful read-only contract, HTTP integration and CI artifacts pass, independent schema verifier rejects missing evidence, documents limitations | `m56Integration`, `test/dashboard-integrated.test.js`, `bin/pef-m56-verify.js`, `test/m56-evidence.test.js`; CI #39246560682 — CLOSED LAB |

## Explicit limitations

- The systemd service and cgroup/netns/chroot sandbox coexist in the *same disposable GitHub-hosted Linux CI run*, tested sequentially for Property and Host. The root-only driver is strictly CI-scoped and is **not** a production installer or a permanently enabled device service.
- The combination does **not** include a full **OS reboot of that integrated systemd + isolated-worker stack**. M5.4 separately validated actual Lima guest reboot with a Node-only Property worker. Do not merge those findings into a combined reboot claim.
- Actual cgroup CPU/RAM/PID limits are applied to the worker; not to the complete Edge host process. No disk quota, physical power-cut guarantee, physical NIC or remote Cloud. The WAN remains synthetic and Cloud is `LOCAL_MOCK`.
- `m56Integration` on the dashboard only checks the real source package and resource plan; it executes **zero privileged actions** on macOS. The real integration runs in CI.
- `M56_EVIDENCE_VERIFIED_V1` is a fail-closed *schema/claim verification*, not an authenticated signature or independent remote attestation.

## How to inspect

```bash
git switch main && git pull
npm test
npm run m5:integrated:contract
npm run dashboard
# Control panel -> Laboratorio integrado -> M5.6 -> Inspect integrated Linux service
```

For real privileged integration, consult the CI run rather than running the CI-only script locally. The exact CI gate is `netns-lab`, output file `pef-m56-evidence.json`; the immediately subsequent independent verifier writes `pef-m56-verified.json`.

[CI #39246560682](https://github.com/krukmat/logistica/actions/runs/39246560682) overall SUCCESS: Linux ARM64 195/195 PASS; Linux x64 194 PASS + 1 platform skip; systemd CI, netns-lab, dashboard HTTP E2E, prehardware gate all SUCCESS.

[Audit](../audit/m5-6-integrated-linux-service-2026-10-19.md).

**Requirements:** REQ-WRK-01/02/03, REQ-LOC-01, REQ-STA-01/02, REQ-OBS-01. Change added, classified `MODULE/RESOURCE/CONFIG`; no alteration of shared Core domain semantics.

**Next:** M6 Cloud Lite **local zero-new-spend** with persistent authenticated ingest and reconciliation replacing Cloud mock on the end-to-end test. M5.3 physical hardware remains BLOCKED; full integrated stack guest OS reboot optional lab regression not yet performed.
