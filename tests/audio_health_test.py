"""tests/audio_health_test.py：scripts/check_audio_health.py 个判斷（離線，注入假回應）。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import check_audio_health as health  # noqa: E402


def run(proxy_codes, dns_codes, retry=True):
    proxies, dnss, slept = list(proxy_codes), list(dns_codes), []
    result = health.check(
        retry=retry,
        sleep=slept.append,
        get_status=lambda url, headers=None: proxies.pop(0),
        get_dns=lambda: dnss.pop(0),
    )
    return result, slept


class AudioHealthTest(unittest.TestCase):
    def test_206_and_dns_ok_is_healthy_without_retry(self):
        result, slept = run([206], [0])
        self.assertTrue(result["ok"])
        self.assertEqual(slept, [])

    def test_404_is_a_missing_file_not_an_outage(self):
        result, _ = run([404], [0])
        self.assertTrue(result["ok"])

    def test_530_twice_is_an_outage(self):
        result, slept = run([530, 530], [2, 2])
        self.assertFalse(result["ok"])
        self.assertEqual(result["proxy_status"], 530)
        self.assertEqual(result["dns_status"], 2)
        self.assertEqual(slept, [health.RETRY_DELAY])
        self.assertEqual(result["first_attempt"]["proxy_status"], 530)

    def test_a_single_blip_recovers_on_the_retry(self):
        result, _ = run([530, 206], [2, 0])
        self.assertTrue(result["ok"])

    def test_unreachable_proxy_is_an_outage(self):
        result, _ = run([0, 0], [0, 0])
        self.assertFalse(result["ok"])

    def test_dns_servfail_alone_is_an_outage(self):
        result, _ = run([206, 206], [2, 2])
        self.assertFalse(result["ok"])

    def test_a_dns_query_that_failed_is_not_counted_alone(self):
        result, _ = run([206], [-1])
        self.assertTrue(result["ok"])

    def test_no_retry_flag(self):
        result, slept = run([530], [2], retry=False)
        self.assertFalse(result["ok"])
        self.assertEqual(slept, [])


if __name__ == "__main__":
    unittest.main()
