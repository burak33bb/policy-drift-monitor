# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import typing
from urllib.parse import urlparse

from genlayer import *

NO_CHANGE = "NO_CHANGE"
LOW = "LOW"
MEDIUM = "MEDIUM"
HIGH = "HIGH"
VALID_SEVERITIES = [NO_CHANGE, LOW, MEDIUM, HIGH]


class PolicyDriftMonitor(gl.Contract):
    watch_name: str
    policy_url: str
    allowed_domain: str
    baseline_hash: str
    baseline_excerpt: str
    latest_check: str
    check_count: u256

    def __init__(
        self,
        watch_name: str,
        policy_url: str,
        allowed_domain: str,
        baseline_excerpt: str,
    ):
        watch_name = watch_name.strip()
        policy_url = policy_url.strip()
        allowed_domain = _normalize_domain(allowed_domain)
        baseline_excerpt = _normalize_text(baseline_excerpt)
        if not watch_name:
            raise ValueError("Watch name is required.")
        if _normalize_domain(policy_url) != allowed_domain:
            raise ValueError("Policy URL must match allowed domain.")
        if len(baseline_excerpt) < 20:
            raise ValueError("Baseline excerpt is too short.")

        self.watch_name = watch_name
        self.policy_url = policy_url
        self.allowed_domain = allowed_domain
        self.baseline_excerpt = baseline_excerpt
        self.baseline_hash = _fingerprint(baseline_excerpt)
        self.latest_check = ""
        self.check_count = u256(0)

    @gl.public.write
    def check_policy(self, current_excerpt: str) -> typing.Any:
        current_excerpt = _normalize_text(current_excerpt)[:1000]
        if len(current_excerpt) < 20:
            raise ValueError("Current excerpt is too short.")
        current_hash = _fingerprint(current_excerpt)
        changed = current_hash != self.baseline_hash

        if changed:

            def classify_change() -> str:
                result = gl.exec_prompt(f"""
Compare these policy excerpts and return only JSON.

URL: {self.policy_url}

Baseline:
{self.baseline_excerpt}

Current:
{current_excerpt}

Schema:
{{
  "severity": "LOW | MEDIUM | HIGH",
  "summary": "short practical summary",
  "confidence": 0
}}
                    """)
                value = _parse_json_dict(result)
                _validate_drift(value, True)
                return _canonical_json(value)

            agreed = gl.eq_principle_prompt_comparative(
                classify_change,
                principle="Severity, confidence, and practical summary must describe the excerpt change.",
            )
            drift = _parse_json_dict(agreed)
            _validate_drift(drift, True)
        else:
            drift = {
                "severity": NO_CHANGE,
                "summary": "Tracked excerpt still matches the live page.",
                "confidence": 100,
            }

        next_count = int(self.check_count) + 1
        record = {
            "id": next_count,
            "watch_name": self.watch_name,
            "policy_url": self.policy_url,
            "baseline_hash": self.baseline_hash,
            "current_hash": current_hash,
            "changed": changed,
            "drift": drift,
        }
        self.latest_check = _canonical_json(record)
        self.check_count = u256(next_count)
        if changed:
            self.baseline_hash = current_hash
            self.baseline_excerpt = current_excerpt
        return record

    @gl.public.view
    def get_watch(self) -> dict:
        return {
            "watch_name": self.watch_name,
            "policy_url": self.policy_url,
            "allowed_domain": self.allowed_domain,
            "baseline_hash": self.baseline_hash,
            "check_count": self.check_count,
        }

    @gl.public.view
    def get_check_count(self) -> int:
        return int(self.check_count)

    @gl.public.view
    def get_latest_check(self) -> typing.Any:
        if not self.latest_check:
            return {}
        return json.loads(self.latest_check)

    @gl.public.view
    def get_check(self, check_id: int) -> typing.Any:
        if check_id != int(self.check_count) or not self.latest_check:
            raise ValueError("Only the latest check is stored.")
        return json.loads(self.latest_check)


def _normalize_domain(value: str) -> str:
    value = value.strip().lower()
    if "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    return parsed.netloc.replace("www.", "").split(":")[0]


def _normalize_text(value: str) -> str:
    return " ".join(value.strip().split())


def _fingerprint(value: str) -> str:
    checksum = 0
    for index, char in enumerate(value):
        checksum = (checksum + ((index + 1) * ord(char))) % 1000000007
    return str(checksum)


def _parse_json_dict(json_str: str) -> dict:
    first_brace = json_str.find("{")
    last_brace = json_str.rfind("}")
    if first_brace == -1 or last_brace == -1 or last_brace < first_brace:
        raise ValueError("No JSON object found.")
    return json.loads(json_str[first_brace : last_brace + 1])


def _canonical_json(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _validate_drift(value: dict, changed: bool) -> None:
    severity = value.get("severity")
    if severity not in VALID_SEVERITIES:
        raise ValueError("Invalid severity.")
    if changed and severity == NO_CHANGE:
        raise ValueError("Changed excerpt cannot be NO_CHANGE.")
    if not changed and severity != NO_CHANGE:
        raise ValueError("Unchanged excerpt must be NO_CHANGE.")
    confidence = value.get("confidence")
    if not isinstance(confidence, int) or confidence < 0 or confidence > 100:
        raise ValueError("Invalid confidence.")
    if not isinstance(value.get("summary"), str) or not value.get("summary").strip():
        raise ValueError("Summary is required.")
