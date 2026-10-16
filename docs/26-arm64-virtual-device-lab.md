# W1.10.D ARM64 PEF VM

D1/D2 ARM64 MAC GUEST OPERATOR EVIDENCE PASS (2026-10-16, supplied terminal log), with 1GiB constrained guest and guest-only netns. Actual R28S physical hardware untested; device backend remains BLOCKED. [Evidence audit](audit/w1.10-d1-d2-arm64-mac-2026-10-16.md).

The same src/core/, edge-service, on-disk OS fsync/reopen, and four pinned Golden Traces run in ARM64 Linux; no fork of Product Core. Lima Apple VZ VM on Mac M5 uses four virtual ARM64 CPUs, Debian 13, nominal 1 GiB RAM and 16 GiB virtual disk; it does NOT emulate Rockchip RK3528A/Cortex-A53 clock speed, WiFi drivers or real microSD endurance.

Mac commands (repository under home folder, which Lima mounts read-only):
- brew install lima
- cd ~/logistica
- git switch main && git pull
- bash scripts/arm64-vm/lima.sh create r28s-1g
- bash scripts/arm64-vm/lima.sh run r28s-1g
- bash scripts/arm64-vm/lima.sh stop r28s-1g

Guest installs Debian Node >=20 with apt if necessary, runs npm test, pinned Golden Traces and port conformance, then the new arm64:profile strict mode. VM reports stay on guest virtual disk under ~/.local/share/pef-arm64-lab/. The strict mode refuses to label a guest constrained unless observed memory is within 12 percent of nominal and <=4 vCPUs; resource measurement includes process RSS, CPU and journal disk bytes, but not whole system peak. Experimental 768MiB and 512MiB profiles use separate VMs and may fail during boot/provisioning.

CI ubuntu-24.04-arm runs native ARM64 but is NOT a 1GiB VM, so must return LAB_PASS_PROFILE_NOT_ENFORCED. It verifies ISA compatibility and actual shared Core results, not CPU equivalence with Cortex-A53.

D2.2 guest-only Linux namespaces coupled to shared Core route adapter is IMPLEMENTED and user-run VM terminal log reports VM_NETNS_LAB_PASS (2026-10-16). D3 abrupt virtual reboot, D4 UI comparison and real device validation remain pending. The two native Ethernet ports of the target board cannot be falsely described as physical dual WAN plus LAN without additional interfaces.

D2.2 now provides an ARM64 Linux VM-only adapter, 3 temporary veth logical paths (WAN A, WAN B, LAN), Core-controlled real namespace route writes/readback, failover from WAN A to WAN B, local-only, then recovery. Root operations apply only inside VM namespaces; no host default route changes. Do not confuse three virtual paths with the R28S's two physical Ethernet ports.

Guest network evidence is stored in the VM at ~/.local/share/pef-arm64-lab/r28s-1g-network.json. A green ARM64 CI run does not validate this guest root-scoped test because it deliberately cannot be executed in CI.

## Actual local Mac ARM64 VM run — 2026-10-16

See [operator terminal-log audit](audit/w1.10-d1-d2-arm64-mac-2026-10-16.md). The reported 972 MiB observed guest RAM, Node v20.19.2 ARM64, four pinned traces, 34/34 port conformance, 50/50 receipts across normal close/reopen, process RSS 53.83 MiB, and WAN failover/local-only/recovery are **operator-observed guest evidence**. They do not validate host-wide memory under sustained load, abrupt powercut, physical 2WAN+LAN wiring, real microSD durability or the R28S Rockchip SoC.
