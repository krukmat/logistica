# W1.10.B4 — Golden trace parity before physical devices

**Scope:** SOFTWARE / LAB. [Plan](tasks/w1.10-predevice-emulation.md) · [pinned baseline](contracts/golden-traces-v1.json).

The fixed baseline in `docs/contracts/golden-traces-v1.json` is reviewed, version-controlled and **not regenerated automatically by the runner**. `src/runtime/golden-traces.js` replays actual shared Core + host journal operations. Comparison checks the exact scenario list, step order and normalized values (WAN/route, journal cursor, ACK, idempotency, quarantine, reconciliation). Unexpected, extra, removed or changed values fail closed with a bounded field-level diff.

Four cases: (1) WAN → backup → local-only → restore; (2) offline receipt → duplicate/conflict → reopen → Cloud mock replay; (3) partially committed route and failed rollback → quarantine → explicit repair; (4) fsync ambiguity → no ACK → reopen → duplicate/conflict.

## Use on Mac (Node >= 20)

```bash
git switch main && git pull
npm test
npm run traces:check
npm run traces:check -- --output /tmp/pef-golden-mac.json
# Download + extract the pef-golden-traces-linux artifact from GitHub Actions
npm run traces:check -- --compare /absolute/pef-golden-traces-linux.json
npm run dashboard
# Laboratorio integrado -> Comparar trazas canónicas
```

The `--compare` command *reruns* the local golden scenarios, verifies the supplied external JSON independently against the pinned baseline, then compares normalized behaviors. Evidence output includes pinned and actual SHA-256, environment metadata, per-scenario wall duration and process RSS, but timings/RSS are not compared and cannot infer device wattage or latencies. The JSON checksum is for comparison, not authenticated provenance. Never accept an untrusted report or auto-promote it as a baseline.

Linux CI runs `npm run traces:check` and uploads `pef-golden-traces-linux`; this **does not itself prove macOS conformance** until executed on an actual Mac. Later device adapters should emit the same semantic schema, but will need explicit hardware/kernel validation independently. `device` remains `BACKEND_NOT_IMPLEMENTED`. No powercut, NIC, real ISP routing, production cloud, actual watt/thermal/throughput or power budget validated.
