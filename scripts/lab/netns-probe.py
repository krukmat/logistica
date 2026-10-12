#!/usr/bin/env python3
"""Directly probe each synthetic WAN peer from the Edge namespace only."""
import sys
import urllib.request

ENDPOINTS = {
    "primary": ("http://10.250.20.1:8765/link.txt", "WAN_A"),
    "backup": ("http://10.250.30.1:8765/link.txt", "WAN_B"),
}

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ENDPOINTS:
        print("expected primary|backup", file=sys.stderr)
        return 2
    url, expected = ENDPOINTS[sys.argv[1]]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=0.6) as response:
            body = response.read(64).decode().strip()
            print("UP" if response.status == 200 and body == expected else "DOWN")
    except (OSError, TimeoutError):
        print("DOWN")
    return 0

if __name__ == "__main__":
    sys.exit(main())
