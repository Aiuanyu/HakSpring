#!/usr/bin/env python3
"""Test single entry audio check"""

import urllib.request
import ssl
import sys

# Create SSL context that doesn't verify certificates
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Test parameters
url = "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/114/5/si/si-01-001.mp3"

print(f"Testing URL: {url}", flush=True)

try:
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=5, context=ssl_context) as response:
        print(f"Status: {response.status}", flush=True)
        print(f"Exists: {response.status == 200}", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)

print("Test complete", flush=True)
