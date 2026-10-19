# M7.1–M7.2 security lab audit — 2026-10-19

**Status: CLOSED — SOFTWARE LAB ONLY; verified current-head CI #39286831769.**

## Change and test inventory

- M7.1 creates a local software Ed25519 private key exactly once (owner-only permissions, fsync file+directory), verifies challenge signatures with a pinned public key, and fails closed for scope revision mismatch and corrupted local identity. The smoke removes its temporary directory after each run. `src/runtime/m71-identity-smoke.js`; negative and persistence tests in `test/m71-identity.test.js`, dashboard action `m71Identity`.
- M7.2 extends the *existing* M5 atomic installation path; pinned trust enforces Ed25519-signed transition authority for an exact SHA256 digest of the release file manifest, ordinal high-water and sequence. Explicit signed known-good rollback on injected health failure after an **actual packaged Edge boot**, with Property journal preserved; corruption/forgery/unsigned bypass rejection. `src/runtime/m72-signed-release-smoke.js`; `test/m72-signed-release.test.js`, dashboard `m72Release`.
- Test commands: `npm run m7:identity` and `npm run m7:release`. The workflow contains x64/ARM64 evidence steps and artifact upload. Pending proof: CI exit=0 including these commands, dashboard HTTP action→real code→evidence, and no existing M5 regression.

## Lab security limitations

- Keypair not HSM/TPM/Apple Secure Enclave-backed; key copied with filesystem access. Release signer private key is **ephemeral in the lab smoke** and is not persisted in the trust anchor. Public Ed25519 pin and signed state are host files 0600, not monotonic firmware counters.
- A principal able to modify or restore an older `state.json` (even without changing the trust pin), or roll back the whole filesystem, can bypass the software-only high-water; this is not a hardware monotonic counter. The ordinal gate protects against **API-level stale/downgrade requests under an intact trusted root**, not OS-root compromise or disk image rewind.
- No bootloader signature, kernel measured boot, signed firmware, production OTA distribution, remote certificates, mTLS, remote attestation, hardware powercut or PKI issuer integration. The M5 unsigned legacy test remains functional only in untrusted lab install roots.
- The M7.2 health-negative scenario is *injected* after a real versioned Edge daemon starts; it does not demonstrate an actual crashing candidate or watchdog on physical device.

## Evidence / decisions

**CI acceptance established.** [#39286831769](https://github.com/krukmat/logistica/actions/runs/39286831769) SUCCESS at commit `fc9ac7f72f70bd30a3106dad0aa2d65689f56185`; 216 PASS ARM64, 215 PASS +1 skip x64, 0 failures. New M7 dashboard HTTP and standalone CLI smoke gates passed; systemd, netns and prehardware jobs SUCCESS.

**Next:** M7.3 TLS/mTLS can be planned against the already real localhost M6 Cloud Lite. M7.4–M7.6 still unimplemented. No hardware acquisition or hosting.

## Packaged runtime integrity gate and artifacts

The final source changes [`d59ce4b9a1`](https://github.com/krukmat/logistica/commit/d59ce4b9a1), [`407949ecb0`](https://github.com/krukmat/logistica/commit/407949ecb0) and [`fc9ac7f72f`](https://github.com/krukmat/logistica/commit/fc9ac7f72f70bd30a3106dad0aa2d65689f56185) ensure that `bin/pef-edge.js` loads the packaged Edge runtime **only after** checking the active release directory and the installer's signed state/integrity. The final CI verifies tampered release boot denial as well as the existing M7.1 and M7.2 negative tests. CI artifacts: [x64](https://github.com/krukmat/logistica/actions/runs/39286831769/artifacts/12202713938) and [ARM64](https://github.com/krukmat/logistica/actions/runs/39286831769/artifacts/12203461977).

**Important limits:** the entrypoint gate does not prevent a privileged actor from bypassing this Node entrypoint or rolling back `state.json`/the disk image. It is **not** a verified boot chain. No mTLS or production key storage tested. The older error `boot is not a function` in CI #39284165281 was corrected by exporting the M5 packaged process harness, then the current-head suite passed.
