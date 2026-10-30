#!/usr/bin/env python3
"""定時健康檢查：認證詞彙音檔轉送（/audio-proxy）通毋通。

20261029 哈客學院網站（elearning.hakka.gov.tw）DNSSEC 出問題，音檔轉送回 530，客服兩日後正知。
這隻腳本由 .github/workflows/audio-health.yml 定時跑，毋通就自動開 issue（GitHub 寄信分維護者），
恢復就留言並關掉。判斷放在這裡（可離線測試），workflow 淨負責開關 issue。

    python3 scripts/check_audio_health.py            # 印 JSON；有 GITHUB_OUTPUT 就寫 ok=true|false
    python3 scripts/check_audio_health.py --no-retry # 毋重試（測試用）

「毋通」的定義：音檔轉送回 5xx／連毋著，或 Cloudflare DoH 對上游網域回 SERVFAIL（Status 2）。
失敗愛連續兩擺（間隔 RETRY_DELAY 秒）正算，避免單擺網路抖動亂報。
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROXY = "https://hakspring.pages.dev/audio-proxy"
UPSTREAM = (
    "https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/112/5/si/si-01-001.mp3"
)
DOH = "https://cloudflare-dns.com/dns-query?name=elearning.hakka.gov.tw&type=A"
TIMEOUT = 20
RETRY_DELAY = 30


def http_status(url, headers=None):
    """GET 一擺，回 HTTP 狀態碼；連毋著回 0。"""
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            response.read(1)
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return 0


def dns_status(fetch_json=None):
    """Cloudflare DoH 對上游網域个 Status（0 成功、2 SERVFAIL／DNSSEC 驗證失敗）；問毋著回 -1。"""
    try:
        if fetch_json is None:
            request = urllib.request.Request(DOH, headers={"accept": "application/dns-json"})
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return json.load(response).get("Status", -1)
        return fetch_json(DOH).get("Status", -1)
    except Exception:
        return -1


def check_once(get_status=http_status, get_dns=dns_status):
    proxy_url = f"{PROXY}?url={urllib.parse.quote(UPSTREAM, safe='')}"
    proxy = get_status(proxy_url, {"Range": "bytes=0-0"})
    dns = get_dns()
    # 206／200 係通；404 係單隻檔案無（毋算上游壞）；5xx 或連毋著算壞。DoH 問毋著（-1）毋單獨算壞。
    proxy_ok = 0 < proxy < 500
    dns_ok = dns in (0, -1)
    return {"ok": proxy_ok and dns_ok, "proxy_status": proxy, "dns_status": dns}


def check(retry=True, sleep=time.sleep, get_status=http_status, get_dns=dns_status):
    """失敗愛連續兩擺正算失敗。"""
    first = check_once(get_status, get_dns)
    if first["ok"] or not retry:
        return first
    sleep(RETRY_DELAY)
    second = check_once(get_status, get_dns)
    second["first_attempt"] = {k: first[k] for k in ("proxy_status", "dns_status")}
    return second


def main(argv):
    result = check(retry="--no-retry" not in argv)
    print(json.dumps(result, ensure_ascii=False))
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"ok={'true' if result['ok'] else 'false'}\n")
            handle.write(f"proxy_status={result['proxy_status']}\n")
            handle.write(f"dns_status={result['dns_status']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
