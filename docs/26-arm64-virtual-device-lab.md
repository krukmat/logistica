# W1.10.D ARM64 PEF VM

D1 and D2.1 SOFTWARE IMPLEMENTED; Mac guest not yet executed. Actual R28S untested; device backend remains BLOCKED.

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

D2.2 guest-only Linux namespaces coupled to shared Core route adapter are IMPLEMENTED but Mac VM execution is NOT RUN. D3 abrupt virtual reboot, D4 UI comparison and real device validation remain pending. The two native Ethernet ports of the target board cannot be falsely described as physical dual WAN plus LAN without additional interfaces.

D2.2 now provides an ARM64 Linux VM-only adapter, 3 temporary veth logical paths (WAN A, WAN B, LAN), Core-controlled real namespace route writes/readback, failover from WAN A to WAN B, local-only, then recovery. Root operations apply only inside VM namespaces; no host default route changes. Do not confuse three virtual paths with the R28S's two physical Ethernet ports.

Guest network evidence is stored in the VM at ~/.local/share/pef-arm64-lab/r28s-1g-network.json. A green ARM64 CI run does not validate this guest root-scoped test because it deliberately cannot be executed in CI.
