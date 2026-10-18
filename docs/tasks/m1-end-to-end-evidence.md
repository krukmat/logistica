# M1 — End-to-end evidence execution & video

**2026-10-18 · main · software/lab only.** Core state/journal is shared, not duplicated in a media simulator. M1 operates a real Node daemon/receiver over loopback and an in-memory mock remote Cloud. Linux physical NICs, powercut and Cloud Lite remain unvalidated.

## Tasks (one or two levels)

- **M1.1 Edge integration:** virtual-only authenticated `/lab/sync`, `/lab/cloud/fault` call the existing `engine.sync()` + Cloud mock with proof. No production Cloud or device backend enabled. IMPLEMENTED.
- **M1.2 Canonical E2E:** `src/runtime/m1-scenario.js` starts real `bin/pef-edge.js` child worker and validates actual HTTP health/auth, offline fsync, duplicate/conflict, SIGKILL, restart/reopen, lost remote ACK and retry with dedup. IMPLEMENTED/CI LAB.
- **M1.3 Documentary evidence:** `npm run m1:evidence` produces `report.json`, `trace.ndjson`, `summary.md`, `m1-evidence.html`, `manifest.json`, `SHA256SUMS`; `npm run m1:evidence:verify -- <bundleDir>` recomputes report consistency and all SHA-256 hashes. IMPLEMENTED/CI LAB.
- **M1.4 CI:** normal CI runs headless M1 once via Node tests and again to create verified `m1-technical-evidence-<runId>` artifact. Browser only runs for a milestone. IMPLEMENTED.
- **M1.5 Video:** `npm run m1:evidence:video` generates same-run `m1-demo.webm` via Playwright, static evidence HTML and optional `video-manifest.json`; `npm run m1:evidence:verify-video -- <bundleDir>` checks exact runId, source commit and WebM digest. M1 timeline is also importable into the dashboard (`report.json` + `trace.ndjson`). Code IMPLEMENTED; physical video generation must be verified in milestone CI.
- **M1.6 Final acceptance:** require video job PASS and test bundle + browser provenance. Lab-only PASS is not hardware, Cloud or 72h acceptance.

## Commands on Mac

### Generate the technical proof (no browser)

```bash
cd ~/logistica
git switch main && git pull --ff-only
npm run m1:evidence
# The command prints the actual artifacts/m1/<runId> path. Copy it:
npm run m1:evidence:verify -- artifacts/m1/<runId>
open artifacts/m1/<runId>/m1-evidence.html
```

### Record a video of exactly that evidence

Once per machine for browser tooling (Playwright is pinned to `1.64.1` in optional devDependencies; no browser needed for Core runs):

```bash
npm install
npx playwright install chromium
npm run m1:evidence:video -- --dir artifacts/m1/<runId>
npm run m1:evidence:verify-video -- artifacts/m1/<runId>
open artifacts/m1/<runId>/m1-demo.webm
```

The file is a **recording of the read-only evidence timeline**, not an uncut recording of physical device operations. Events rendered correspond to `trace.ndjson` and `report.json` by `runId`. The video creation does **not rerun M1** if `--dir` is provided.

### Dashboard

```bash
npm run dashboard
# http://127.0.0.1:8787 -> Laboratorio integrado -> M1
# select report.json AND trace.ndjson from the same run.
```

The dashboard import is a visual convenience; run the CLI verifier for hashes.

### GitHub Actions

Normal push emits `m1-technical-evidence-<github.run_id>` with report, trace, HTML, summary and hashes. The Chromium WebM job is conditional: run the existing `PEF Emulator Smoke` workflow using **Run workflow → m1_video=true**, or make a one-time milestone commit with `[m1-video]` in the message. Browser not installed on normal CI.

## Exact claims / anti-claims

**Proven in CI when green:** process supervisor, localhost API, fsync ACK, duplicate and conflict behavior, retained receipt after SIGKILL and new epoch, Cloud mock ambiguous ACK does not advance local cursor, valid replay and local ACK fsync. **Not proven:** real multi-WAN, hardware/flash powercut, field robustness, PKI/mTLS, any actual Cloud service, 72h offline, exact-once delivery beyond the lab. No customer/business demand evidence from this logistics technical fixture.
