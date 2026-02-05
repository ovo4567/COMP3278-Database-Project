import json
import os
import sys
import time
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

BASE_URL = os.environ.get("API_BASE", "http://localhost:8000")


def fetch_json(path: str):
    url = f"{BASE_URL}{path}"
    with urlopen(url, timeout=5) as resp:
        data = resp.read().decode("utf-8")
        return json.loads(data)


def main() -> int:
    try:
        # wait for server to be ready
        for _ in range(10):
            try:
                health = fetch_json("/health")
                print("/health ok:", health)
                break
            except URLError:
                time.sleep(1)
        else:
            raise URLError("Server not reachable")

        users = fetch_json("/users")
        print("/users ok: count=", len(users))

        try:
            feed = fetch_json("/feed?limit=5")
            print("/feed ok: count=", len(feed))
        except HTTPError as e:
            if e.code == 401:
                print("/feed ok: requires auth (401)")
            else:
                raise

        print("Smoke test passed.")
        return 0
    except (URLError, HTTPError) as e:
        print("Smoke test failed:", e)
        return 1
    except Exception as e:
        print("Smoke test failed:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
