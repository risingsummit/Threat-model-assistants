#!/usr/bin/env python3
"""
Mini SIEM log analyzer for local lab and defensive training use.

It parses common text, CSV, JSON, and JSONL logs, normalizes key fields, applies
simple detection rules, and exports concise investigation reports.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WINDOWS_EVENT_HINTS = {
    "4624": "Successful logon",
    "4625": "Failed logon",
    "4634": "Logoff",
    "4648": "Explicit credential use",
    "4672": "Special privileges assigned",
    "4688": "Process creation",
    "4720": "User account created",
    "4722": "User account enabled",
    "4723": "Password change attempted",
    "4724": "Password reset attempted",
    "4728": "Member added to global group",
    "4732": "Member added to local group",
    "4738": "User account changed",
    "4740": "User account locked out",
    "4768": "Kerberos authentication ticket requested",
    "4769": "Kerberos service ticket requested",
    "4771": "Kerberos pre-authentication failed",
    "4776": "Credential validation",
    "7045": "Service installed",
    "1102": "Audit log cleared",
}

SUSPICIOUS_COMMANDS = [
    "powershell -enc",
    "powershell.exe -enc",
    "frombase64string",
    "downloadstring",
    "invoke-webrequest",
    "iwr ",
    "certutil -urlcache",
    "rundll32",
    "regsvr32",
    "wmic process call create",
    "bitsadmin",
    "vssadmin delete shadows",
    "wevtutil cl",
    "net user",
    "net localgroup administrators",
]

SEVERITY_WEIGHT = {"Low": 10, "Medium": 25, "High": 45, "Critical": 70}


@dataclass
class Event:
    timestamp: datetime
    source_file: str
    raw: str
    host: str = "unknown"
    user: str = "unknown"
    source_ip: str = ""
    event_id: str = ""
    action: str = ""
    message: str = ""
    level: str = ""
    process: str = ""


@dataclass
class Finding:
    rule: str
    severity: str
    summary: str
    evidence: list[Event] = field(default_factory=list)
    recommendation: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze logs with mini SIEM-style correlation rules.")
    parser.add_argument("paths", nargs="+", type=Path, help="Log files or folders to analyze.")
    parser.add_argument("--save", type=Path, help="Optional report path ending in .md or .json.")
    parser.add_argument("--since", help="Only include events at or after this timestamp, such as 2026-05-24T08:00:00.")
    parser.add_argument("--limit", type=int, default=12, help="Maximum evidence events per finding.")
    parser.add_argument("--show-events", action="store_true", help="Print normalized event samples.")
    return parser.parse_args()


def collect_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    allowed = {".log", ".txt", ".csv", ".json", ".jsonl", ".ndjson"}
    for path in paths:
        if path.is_dir():
            files.extend(item for item in path.rglob("*") if item.is_file() and item.suffix.lower() in allowed)
        elif path.is_file():
            files.append(path)
        else:
            print(f"Skipping missing path: {path}", file=sys.stderr)
    return sorted(set(files))


def parse_timestamp(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc)

    text = str(value or "").strip()
    if not text:
        return datetime.now(timezone.utc)

    text = text.replace("Z", "+00:00")
    candidates = [
        text,
        text.replace(" ", "T", 1),
    ]
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%m/%d/%Y %H:%M:%S",
        "%b %d %H:%M:%S",
    ]

    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    for fmt in formats:
        try:
            parsed = datetime.strptime(text, fmt)
            if fmt == "%b %d %H:%M:%S":
                parsed = parsed.replace(year=datetime.now().year)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    return datetime.now(timezone.utc)


def parse_file(path: Path) -> list[Event]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return parse_csv(path)
    if suffix in {".json", ".jsonl", ".ndjson"}:
        return parse_json(path)
    return parse_text(path)


def parse_csv(path: Path) -> list[Event]:
    events: list[Event] = []
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            events.append(normalize_record(row, path, json.dumps(row)))
    return events


def parse_json(path: Path) -> list[Event]:
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return []

    rows: list[Any] = []
    if path.suffix.lower() == ".json":
        parsed = json.loads(text)
        if isinstance(parsed, list):
            rows = parsed
        elif isinstance(parsed, dict):
            rows = parsed.get("events") if isinstance(parsed.get("events"), list) else [parsed]
    else:
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]

    return [normalize_record(row, path, json.dumps(row)) for row in rows if isinstance(row, dict)]


def parse_text(path: Path) -> list[Event]:
    events: list[Event] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        events.append(normalize_record(parse_line(line), path, line))
    return events


def parse_line(line: str) -> dict[str, Any]:
    record: dict[str, Any] = {"message": line}

    timestamp_match = re.search(
        r"(?P<timestamp>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})",
        line,
    )
    if timestamp_match:
        record["timestamp"] = timestamp_match.group("timestamp")

    event_match = re.search(r"\b(?:event[_ -]?id|eid|id)[=: ]+(?P<event_id>\d{3,5})\b", line, re.I)
    if event_match:
        record["event_id"] = event_match.group("event_id")
    else:
        standalone_event = re.search(r"\b(46(?:24|25|48|72|88)|47(?:20|22|23|24|28|32|38|40)|4771|4776|7045|1102)\b", line)
        if standalone_event:
            record["event_id"] = standalone_event.group(1)

    ip_match = re.search(r"\b(?:src|source|source_ip|ip)[=: ]+(?P<ip>\d{1,3}(?:\.\d{1,3}){3})\b", line, re.I)
    if ip_match:
        record["source_ip"] = ip_match.group("ip")
    else:
        any_ip = re.search(r"\b(?P<ip>\d{1,3}(?:\.\d{1,3}){3})\b", line)
        if any_ip:
            record["source_ip"] = any_ip.group("ip")

    for field_name in ["host", "user", "action", "level", "process"]:
        match = re.search(rf"\b{field_name}[=: ]+(?P<value>[^,\s]+)", line, re.I)
        if match:
            record[field_name] = match.group("value")

    return record


def normalize_record(record: dict[str, Any], path: Path, raw: str) -> Event:
    lowered = {str(key).lower().replace(" ", "_"): value for key, value in record.items()}
    event_id = first_value(lowered, "event_id", "eventid", "eid", "id")
    message = str(first_value(lowered, "message", "msg", "description", "raw", default=""))
    action = str(first_value(lowered, "action", "event", "activity", default=""))

    if event_id and not action:
        action = WINDOWS_EVENT_HINTS.get(str(event_id), "")

    return Event(
        timestamp=parse_timestamp(first_value(lowered, "timestamp", "time", "date", "datetime")),
        source_file=str(path),
        raw=raw,
        host=str(first_value(lowered, "host", "hostname", "computer", "computername", "device", default="unknown")),
        user=str(first_value(lowered, "user", "username", "account", "targetusername", "subjectusername", default="unknown")),
        source_ip=str(first_value(lowered, "source_ip", "src_ip", "src", "ip", "client_ip", "address", default="")),
        event_id=str(event_id or ""),
        action=action,
        message=message,
        level=str(first_value(lowered, "level", "severity", "status", default="")),
        process=str(first_value(lowered, "process", "process_name", "image", "commandline", "command_line", default="")),
    )


def first_value(record: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        if key in record and record[key] not in {None, ""}:
            return record[key]
    return default


def detect_findings(events: list[Event], evidence_limit: int) -> list[Finding]:
    rules = [
        detect_failed_logon_bursts,
        detect_account_lockouts,
        detect_privileged_logons,
        detect_user_or_group_changes,
        detect_suspicious_processes,
        detect_service_installation,
        detect_log_clear,
        detect_repeated_denies,
        detect_new_source_ip_for_user,
    ]
    findings: list[Finding] = []
    for rule in rules:
        findings.extend(rule(events, evidence_limit))
    return sorted(findings, key=lambda item: SEVERITY_WEIGHT[item.severity], reverse=True)


def detect_failed_logon_bursts(events: list[Event], limit: int) -> list[Finding]:
    failures = [event for event in events if event.event_id in {"4625", "4771", "4776"} or contains_any(event, ["failed logon", "authentication failed", "login failed"])]
    grouped: dict[tuple[str, str], list[Event]] = defaultdict(list)
    for event in failures:
        grouped[(event.user, event.source_ip or "unknown")].append(event)

    findings = []
    for (user, source_ip), items in grouped.items():
        if len(items) >= 5:
            findings.append(Finding(
                rule="Repeated failed authentication",
                severity="High",
                summary=f"{len(items)} failed authentication events for {user} from {source_ip}.",
                evidence=items[:limit],
                recommendation="Check whether this is password spraying or brute force activity, then reset credentials or block the source if unauthorized.",
            ))
    return findings


def detect_account_lockouts(events: list[Event], limit: int) -> list[Finding]:
    matches = [event for event in events if event.event_id == "4740" or contains_any(event, ["account locked"])]
    if not matches:
        return []
    return [Finding(
        rule="Account lockout",
        severity="Medium",
        summary=f"{len(matches)} account lockout event(s) found.",
        evidence=matches[:limit],
        recommendation="Review the locked accounts, source hosts, and recent failed logons.",
    )]


def detect_privileged_logons(events: list[Event], limit: int) -> list[Finding]:
    matches = [event for event in events if event.event_id == "4672" or contains_any(event, ["special privileges", "admin logon"])]
    if not matches:
        return []
    return [Finding(
        rule="Privileged logon",
        severity="Medium",
        summary=f"{len(matches)} privileged logon event(s) found.",
        evidence=matches[:limit],
        recommendation="Confirm these privileged sessions match approved administrator activity.",
    )]


def detect_user_or_group_changes(events: list[Event], limit: int) -> list[Finding]:
    ids = {"4720", "4722", "4723", "4724", "4728", "4732", "4738"}
    matches = [event for event in events if event.event_id in ids or contains_any(event, ["user account created", "added to", "password reset"])]
    if not matches:
        return []
    return [Finding(
        rule="Identity or group change",
        severity="High",
        summary=f"{len(matches)} user, password, or group membership change event(s) found.",
        evidence=matches[:limit],
        recommendation="Validate that each account or group change was approved and performed by the expected administrator.",
    )]


def detect_suspicious_processes(events: list[Event], limit: int) -> list[Finding]:
    matches = []
    for event in events:
        haystack = f"{event.process} {event.message} {event.raw}".lower()
        if event.event_id == "4688" and any(command in haystack for command in SUSPICIOUS_COMMANDS):
            matches.append(event)
        elif any(command in haystack for command in SUSPICIOUS_COMMANDS):
            matches.append(event)
    if not matches:
        return []
    return [Finding(
        rule="Suspicious command or process",
        severity="Critical",
        summary=f"{len(matches)} suspicious command/process event(s) found.",
        evidence=matches[:limit],
        recommendation="Inspect the command line, parent process, user context, and endpoint timeline.",
    )]


def detect_service_installation(events: list[Event], limit: int) -> list[Finding]:
    matches = [event for event in events if event.event_id == "7045" or contains_any(event, ["service installed", "new service"])]
    if not matches:
        return []
    return [Finding(
        rule="Service installation",
        severity="High",
        summary=f"{len(matches)} service installation event(s) found.",
        evidence=matches[:limit],
        recommendation="Confirm the service binary path, signer, installer source, and change ticket.",
    )]


def detect_log_clear(events: list[Event], limit: int) -> list[Finding]:
    matches = [event for event in events if event.event_id == "1102" or contains_any(event, ["audit log cleared", "wevtutil cl"])]
    if not matches:
        return []
    return [Finding(
        rule="Security log cleared",
        severity="Critical",
        summary=f"{len(matches)} log clearing event(s) found.",
        evidence=matches[:limit],
        recommendation="Treat unexpected log clearing as high priority and preserve remaining evidence immediately.",
    )]


def detect_repeated_denies(events: list[Event], limit: int) -> list[Finding]:
    denied = [event for event in events if contains_any(event, [" action=deny", "blocked", " denied", " firewall deny"])]
    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in denied:
        grouped[event.source_ip or "unknown"].append(event)

    findings = []
    for source_ip, items in grouped.items():
        if len(items) >= 3:
            findings.append(Finding(
                rule="Repeated denied network activity",
                severity="Medium",
                summary=f"{len(items)} denied or blocked network events from {source_ip}.",
                evidence=items[:limit],
                recommendation="Review whether the source is expected, then block, rate-limit, or investigate the host if activity is suspicious.",
            ))
    return findings


def detect_new_source_ip_for_user(events: list[Event], limit: int) -> list[Finding]:
    successes = [event for event in events if event.event_id == "4624" or contains_any(event, ["successful logon", "login success"])]
    by_user: dict[str, set[str]] = defaultdict(set)
    evidence: dict[str, list[Event]] = defaultdict(list)
    for event in successes:
        if event.user == "unknown" or not event.source_ip:
            continue
        by_user[event.user].add(event.source_ip)
        evidence[event.user].append(event)

    findings = []
    for user, ips in by_user.items():
        if len(ips) >= 3:
            findings.append(Finding(
                rule="Multiple source IPs for one user",
                severity="Low",
                summary=f"{user} logged in from {len(ips)} source IPs.",
                evidence=evidence[user][:limit],
                recommendation="Review whether these source addresses match normal user behavior or VPN patterns.",
            ))
    return findings


def contains_any(event: Event, needles: list[str]) -> bool:
    haystack = f"{event.action} {event.message} {event.raw}".lower()
    return any(needle in haystack for needle in needles)


def print_summary(events: list[Event], findings: list[Finding]) -> None:
    print(f"Analyzed {len(events)} event(s).")
    print(f"Findings: {len(findings)}")
    print("-" * 80)

    if not findings:
        print("No SIEM rules matched these logs.")
        return

    for finding in findings:
        print(f"[{finding.severity}] {finding.rule}: {finding.summary}")
        print(f"  Recommendation: {finding.recommendation}")
        for event in finding.evidence[:3]:
            print(f"  - {format_event(event)}")
        print()


def print_event_samples(events: list[Event]) -> None:
    print("Normalized event samples:")
    for event in events[:10]:
        print(f"  {format_event(event)}")
    print()


def format_event(event: Event) -> str:
    event_name = WINDOWS_EVENT_HINTS.get(event.event_id, event.action or event.level or "event")
    source = f" from {event.source_ip}" if event.source_ip else ""
    user = f" user={event.user}" if event.user != "unknown" else ""
    return f"{event.timestamp.isoformat(timespec='seconds')} {event.host}{source}{user} id={event.event_id or '-'} {event_name}"


def build_markdown_report(events: list[Event], findings: list[Finding]) -> str:
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    lines = [
        "# Mini SIEM Report",
        "",
        f"Generated: {generated}",
        f"Events analyzed: {len(events)}",
        f"Findings: {len(findings)}",
        "",
        "## Severity Counts",
    ]
    severity_counts = Counter(finding.severity for finding in findings)
    for severity in ["Critical", "High", "Medium", "Low"]:
        lines.append(f"- {severity}: {severity_counts.get(severity, 0)}")

    lines.extend(["", "## Findings"])
    if not findings:
        lines.append("No SIEM rules matched these logs.")
    for finding in findings:
        lines.extend([
            "",
            f"### {finding.severity}: {finding.rule}",
            "",
            finding.summary,
            "",
            f"Recommendation: {finding.recommendation}",
            "",
            "Evidence:",
        ])
        for event in finding.evidence:
            lines.append(f"- {format_event(event)}")
    return "\n".join(lines)


def save_report(path: Path | None, events: list[Event], findings: list[Finding]) -> None:
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".md":
        path.write_text(build_markdown_report(events, findings), encoding="utf-8")
        return
    if path.suffix.lower() == ".json":
        payload = {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "event_count": len(events),
            "findings": [
                {
                    "rule": finding.rule,
                    "severity": finding.severity,
                    "summary": finding.summary,
                    "recommendation": finding.recommendation,
                    "evidence": [asdict(event) | {"timestamp": event.timestamp.isoformat()} for event in finding.evidence],
                }
                for finding in findings
            ],
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return
    raise ValueError("Report path must end in .md or .json")


def main() -> int:
    args = parse_args()
    since = parse_timestamp(args.since) if args.since else None
    files = collect_files(args.paths)
    if not files:
        print("No log files found.", file=sys.stderr)
        return 1

    events: list[Event] = []
    for path in files:
        try:
            events.extend(parse_file(path))
        except Exception as exc:
            print(f"Could not parse {path}: {exc}", file=sys.stderr)

    if since:
        events = [event for event in events if event.timestamp >= since]

    events.sort(key=lambda event: event.timestamp)
    findings = detect_findings(events, args.limit)

    if args.show_events:
        print_event_samples(events)
    print_summary(events, findings)
    save_report(args.save, events, findings)
    if args.save:
        print(f"Report saved to {args.save}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
