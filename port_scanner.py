#!/usr/bin/env python3
"""
TCP port scanner for authorized local diagnostics.

Use this only against systems you own or have explicit permission to test.
The scanner performs TCP connect checks and does not attempt exploitation.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import ipaddress
import json
import socket
import ssl
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


COMMON_PORTS = {
    20: "ftp-data",
    21: "ftp",
    22: "ssh",
    23: "telnet",
    25: "smtp",
    53: "dns",
    80: "http",
    110: "pop3",
    135: "msrpc",
    139: "netbios-ssn",
    143: "imap",
    389: "ldap",
    443: "https",
    445: "smb",
    465: "smtps",
    587: "submission",
    636: "ldaps",
    993: "imaps",
    995: "pop3s",
    1433: "mssql",
    1521: "oracle",
    2049: "nfs",
    3306: "mysql",
    3389: "rdp",
    5432: "postgres",
    5900: "vnc",
    5985: "winrm-http",
    5986: "winrm-https",
    6379: "redis",
    8080: "http-alt",
    8443: "https-alt",
    9200: "elasticsearch",
}

PORT_PRESETS = {
    "quick": "21,22,23,25,53,80,110,135,139,143,389,443,445,587,993,995,1433,3306,3389,5432,5900,5985,5986,6379,8080,8443,9200",
    "web": "80,443,8000,8080,8081,8443,8888,9000,9443",
    "windows": "53,88,135,139,389,445,464,593,636,3268,3269,3389,5985,5986",
    "top100": "7,9,13,21,22,23,25,26,37,53,79,80,81,88,106,110,111,113,119,135,139,143,144,179,199,389,427,443,444,445,465,513,514,515,543,544,548,554,587,631,646,873,990,993,995,1025,1026,1027,1028,1029,1110,1433,1720,1723,1755,1900,2000,2001,2049,2121,2717,3000,3128,3306,3389,3986,4899,5000,5009,5051,5060,5101,5190,5357,5432,5631,5666,5800,5900,6000,6001,6646,7070,8000,8008,8009,8080,8081,8443,8888,9100,9999,10000,32768,49152,49153,49154,49155,49156,49157",
}


@dataclass
class ScanResult:
    timestamp: str
    host: str
    port: int
    state: str
    service: str
    latency_ms: float | None = None
    banner: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan TCP ports on authorized hosts using safe connect checks."
    )
    parser.add_argument(
        "targets",
        nargs="+",
        help="Hosts, IPs, CIDR ranges, or comma-separated values. Example: 192.168.1.10 192.168.1.0/30",
    )
    parser.add_argument(
        "-p",
        "--ports",
        default="quick",
        help="Ports to scan. Use a preset: quick, web, windows, top100. Or use values like 22,80,443,8000-8100.",
    )
    parser.add_argument("--timeout", type=float, default=1.0, help="Seconds to wait for each TCP connection.")
    parser.add_argument("--concurrency", type=int, default=100, help="Maximum simultaneous connection attempts.")
    parser.add_argument("--banner", action="store_true", help="Try to read a small banner from open ports.")
    parser.add_argument("--show-closed", action="store_true", help="Print closed and filtered ports too.")
    parser.add_argument("--save", type=Path, help="Optional output path ending in .jsonl or .csv.")
    parser.add_argument("--no-color", action="store_true", help="Disable colored terminal output.")
    return parser.parse_args()


def parse_targets(raw_targets: list[str]) -> list[str]:
    expanded: list[str] = []
    for raw_item in raw_targets:
        for item in raw_item.split(","):
            target = item.strip()
            if not target:
                continue
            try:
                network = ipaddress.ip_network(target, strict=False)
                if network.num_addresses == 1:
                    expanded.append(str(network.network_address))
                else:
                    expanded.extend(str(address) for address in network.hosts())
            except ValueError:
                expanded.append(target)
    return dedupe(expanded)


def parse_ports(raw_ports: str) -> list[int]:
    raw_ports = PORT_PRESETS.get(raw_ports.lower(), raw_ports)
    ports: list[int] = []
    for part in raw_ports.split(","):
        value = part.strip()
        if not value:
            continue
        if "-" in value:
            start_text, end_text = value.split("-", 1)
            start = parse_port_number(start_text)
            end = parse_port_number(end_text)
            if start > end:
                start, end = end, start
            ports.extend(range(start, end + 1))
        else:
            ports.append(parse_port_number(value))
    return sorted(set(ports))


def parse_port_number(value: str) -> int:
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError(f"Port out of range: {port}")
    return port


def dedupe(items: list[str]) -> list[str]:
    seen = set()
    unique = []
    for item in items:
        if item not in seen:
            unique.append(item)
            seen.add(item)
    return unique


async def scan_port(host: str, port: int, timeout: float, read_banner: bool) -> ScanResult:
    started = time.perf_counter()
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    service = service_name(port)

    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        banner = await grab_banner(reader, writer, host, port, timeout) if read_banner else None
        writer.close()
        await writer.wait_closed()
        return ScanResult(timestamp, host, port, "open", service, latency_ms, banner)
    except (asyncio.TimeoutError, TimeoutError):
        return ScanResult(timestamp, host, port, "filtered", service)
    except (ConnectionRefusedError, OSError):
        return ScanResult(timestamp, host, port, "closed", service)
    except ssl.SSLError:
        return ScanResult(timestamp, host, port, "open", service, round((time.perf_counter() - started) * 1000, 2))


async def grab_banner(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    host: str,
    port: int,
    timeout: float,
) -> str | None:
    try:
        if port in {80, 8080, 8000, 8008, 8081, 8888}:
            writer.write(f"HEAD / HTTP/1.0\r\nHost: {host}\r\n\r\n".encode("ascii", "ignore"))
            await writer.drain()
        data = await asyncio.wait_for(reader.read(160), timeout=min(timeout, 1.5))
        text = data.decode("utf-8", errors="replace").strip()
        return " ".join(text.split())[:160] if text else None
    except Exception:
        return None


def service_name(port: int) -> str:
    if port in COMMON_PORTS:
        return COMMON_PORTS[port]
    try:
        return socket.getservbyport(port, "tcp")
    except OSError:
        return "unknown"


async def run_scan(args: argparse.Namespace) -> list[ScanResult]:
    targets = parse_targets(args.targets)
    ports = parse_ports(args.ports)
    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    results: list[ScanResult] = []

    async def worker(host: str, port: int) -> None:
        async with semaphore:
            result = await scan_port(host, port, args.timeout, args.banner)
            results.append(result)
            if result.state == "open" or args.show_closed:
                print_result(result, use_color=not args.no_color)

    print(f"Scanning {len(targets)} target(s), {len(ports)} port(s) each.")
    print(f"Concurrency: {args.concurrency}, timeout: {args.timeout}s")
    print("-" * 76)

    tasks = [asyncio.create_task(worker(host, port)) for host in targets for port in ports]
    await asyncio.gather(*tasks)
    results.sort(key=lambda item: (item.host, item.port))
    return results


def print_result(result: ScanResult, use_color: bool) -> None:
    state = color(result.state.upper(), "green", use_color) if result.state == "open" else result.state.upper()
    latency = f"{result.latency_ms:>7.2f} ms" if result.latency_ms is not None else "       -"
    banner = f"  {result.banner}" if result.banner else ""
    print(f"{result.host:<22} {result.port:<6} {state:<14} {result.service:<14} {latency}{banner}")


def color(text: str, name: str, enabled: bool) -> str:
    if not enabled or not sys.stdout.isatty():
        return text
    codes = {"green": "32", "yellow": "33", "red": "31"}
    return f"\033[{codes.get(name, '0')}m{text}\033[0m"


def save_results(path: Path | None, results: list[ScanResult]) -> None:
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [asdict(result) for result in results]
    if path.suffix.lower() == ".jsonl":
        with path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row) + "\n")
        return
    if path.suffix.lower() == ".csv":
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(ScanResult.__dataclass_fields__.keys()))
            writer.writeheader()
            writer.writerows(rows)
        return
    raise ValueError("Output path must end in .jsonl or .csv")


def summarize(results: list[ScanResult]) -> None:
    open_results = [result for result in results if result.state == "open"]
    filtered = sum(1 for result in results if result.state == "filtered")
    closed = sum(1 for result in results if result.state == "closed")
    print("-" * 76)
    print(f"Open: {len(open_results)}  Filtered: {filtered}  Closed: {closed}")
    if open_results:
        print("Open ports:")
        for result in open_results:
            print(f"  {result.host}:{result.port} ({result.service})")


def main() -> int:
    args = parse_args()
    try:
        results = asyncio.run(run_scan(args))
        save_results(args.save, results)
        summarize(results)
        return 0
    except KeyboardInterrupt:
        print("\nScan stopped.")
        return 130
    except (ValueError, argparse.ArgumentTypeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
