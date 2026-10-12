#!/usr/bin/env python3
"""Isolated Linux namespace HTTP client; target is TEST-NET-3, never the Internet."""
import sys
import urllib.request

URL = "http://203.0.113.42:8765/link.txt"


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {"WAN_A", "WAN_B", "DOWN"}:
        print("Usage: netns-client.py WAN_A|WAN_B|DOWN", file=sys.stderr)
        return 2
    expected = sys.argv[1]
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL, timeout=1.5) as response:
            observed = response.read(64).decode().strip()
    except (OSError, TimeoutError) as err:
        if expected == "DOWN":
            print("OBSERVED_DOWN", type(err).__name__)
            return 0
        print("UNEXPECTED_DOWN", type(err).__name__, file=sys.stderr)
        return 1
    if observed != expected:
        print("UNEXPECTED_ENDPOINT", repr(observed), "expected", expected, file=sys.stderr)
        return 1
    print("OBSERVED_" + observed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
