# M7.1–M7.2 security lab audit — 2026-10-19

**Status at authoring: IMPLEMENTED / CI_PENDING; NOT CLOSED.**

## Change and test inventory

- M7.1 creates a local software Ed25519 private key exactly once (owner-only permissions, fsync file+directory), verifies challenge signatures with a pinned public key, and fails closed for scope revision mismatch and corrupted local identity. The smoke removes its temporary directory after each run. `src/runtime/m71-identity-smoke.js`; negative and persistence tests in `test/m71-identity.test.js`, dashboard action `m71Identity`.
- M7.2 extends the *existing* M5 atomic installation path; pinned trust enforces Ed25519-signed transition authority for an exact SHA256 digest of the release file manifest, ordinal high-water and sequence. Explicit signed known-good rollback on injected health failure after an **actual packaged Edge boot**, with Property journal preserved; corruption/forgery/unsigned bypass rejection. `src/runtime/m72-signed-release-smoke.js`; `test/m72-signed-release.test.js`, dashboard `m72Release`.
- Test commands: `npm run m7:identity` and `npm run m7:release`. The workflow contains x64/ARM64 evidence steps and artifact upload. Pending proof: CI exit=0 including these commands, dashboard HTTP action→real code→evidence, and no existing M5 regression.

## Lab security limitations

- Keypair not HSM/TPM/Apple Secure Enclave-backed; key copied with filesystem access. Release signer private key is **ephemeral in the lab smoke** and is not persisted in the trust anchor. Public Ed25519 pin and signed state are host files 0600, not monotonic firmware counters.
- A privileged actor capable of resetting the full state directory/trust anchor can roll back the software trust root. The ordinal gate protects against **API-level stale/downgrade requests under an intact trusted root**, not OS-root compromise or disk image rewind.
- No bootloader signature, kernel measured boot, signed firmware, production OTA distribution, remote certificates, mTLS, remote attestation, hardware powercut or PKI issuer integration. The M5 unsigned legacy test remains functional only in untrusted lab install roots.
- The M7.2 health-negative scenario is *injected* after a real versioned Edge daemon starts; it does not demonstrate an actual crashing candidate or watchdog on physical device.

## Evidence / decisions

**CI acceptance not yet established.** The GitHub Actions workflow runs triggered by initial M7 source changes remain queued at the time of writing. Until a current-HEAD successful run, do not report CLOSED or LAB_PASS on the new work. M1–M6 green CI results from earlier commits do not validate M7.1/M7.2.

**Next:** inspect first actual CI result, fix failures, retest, then update this audit and roadmap to CLOSED *in lab scope only*. No hardware acquisition or hosting.
