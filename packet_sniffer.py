#!/usr/bin/env python3
"""
Local packet sniffer for authorized diagnostics.

Run this only on systems and networks you own or have explicit permission to
monitor. Administrative privileges are usually required for live capture.
"""

from __future__ import annotations

import argparse
import csv
import json
import signal
import socket
import struct
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, TextIO


ETH_P_ALL = 0x0003
SIO_RCVALL = 0x98000001
RCVALL_ON = 1
RCVALL_OFF = 0
PROTOCOL_NAMES = {1: "ICMP", 6: "TCP", 17: "UDP"}


@dataclass
class PacketSummary:
    timestamp: str
    source: str
    destination: str
    protocol: str
    length: int
    source_port: int | None = None
    destination_port: int | None = None
    tcp_flags: str | None = None
    icmp_type: int | None = None
    icmp_code: int | None = None
    payload_preview: str | None = None


class CaptureStopped(Exception):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture and summarize local network packets for authorized diagnostics."
    )
    parser.add_argument(
        "--host",
        default="auto",
        help="Local IP address to bind on. Use 'auto' to detect the primary local IP.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=25,
        help="Number of packets to capture before stopping. Use 0 for unlimited.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30,
        help="Maximum seconds to capture. Use 0 for no time limit.",
    )
    parser.add_argument(
        "--protocol",
        choices=["all", "tcp", "udp", "icmp"],
        default="all",
        help="Only show packets for this protocol.",
    )
    parser.add_argument(
        "--save",
        type=Path,
        help="Optional output path ending in .jsonl or .csv.",
    )
    parser.add_argument(
        "--payload",
        action="store_true",
        help="Include a short hex preview of packet payload bytes.",
    )
    parser.add_argument(
        "--max-payload",
        type=int,
        default=32,
        help="Maximum payload bytes to preview when --payload is enabled.",
    )
    return parser.parse_args()


def detect_local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
        except OSError:
            return socket.gethostbyname(socket.gethostname())


def create_capture_socket(host: str) -> socket.socket:
    if sys.platform.startswith("win"):
        sniffer = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
        sniffer.bind((host, 0))
        sniffer.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
        sniffer.ioctl(SIO_RCVALL, struct.pack("I", RCVALL_ON))
        return sniffer

    if sys.platform.startswith("linux"):
        return socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.ntohs(ETH_P_ALL))

    sniffer = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
    sniffer.bind((host, 0))
    return sniffer


def close_capture_socket(sniffer: socket.socket) -> None:
    if sys.platform.startswith("win"):
        try:
            sniffer.ioctl(SIO_RCVALL, struct.pack("I", RCVALL_OFF))
        except OSError:
            pass
    sniffer.close()


def strip_link_header(packet: bytes) -> bytes:
    if sys.platform.startswith("linux"):
        if len(packet) < 14:
            return b""
        ether_type = struct.unpack("!H", packet[12:14])[0]
        if ether_type != 0x0800:
            return b""
        return packet[14:]
    return packet


def parse_packet(packet: bytes, include_payload: bool, max_payload: int) -> PacketSummary | None:
    ip_packet = strip_link_header(packet)
    if len(ip_packet) < 20:
        return None

    first_byte = ip_packet[0]
    version = first_byte >> 4
    header_length = (first_byte & 0x0F) * 4
    if version != 4 or len(ip_packet) < header_length:
        return None

    total_length = struct.unpack("!H", ip_packet[2:4])[0]
    protocol_number = ip_packet[9]
    source = socket.inet_ntoa(ip_packet[12:16])
    destination = socket.inet_ntoa(ip_packet[16:20])
    protocol = PROTOCOL_NAMES.get(protocol_number, str(protocol_number))
    transport = ip_packet[header_length:total_length or len(ip_packet)]

    summary = PacketSummary(
        timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source=source,
        destination=destination,
        protocol=protocol,
        length=total_length or len(ip_packet),
    )

    if protocol == "TCP" and len(transport) >= 20:
        summary.source_port, summary.destination_port = struct.unpack("!HH", transport[:4])
        data_offset = (transport[12] >> 4) * 4
        summary.tcp_flags = decode_tcp_flags(transport[13])
        payload = transport[data_offset:]
        attach_payload(summary, payload, include_payload, max_payload)
    elif protocol == "UDP" and len(transport) >= 8:
        summary.source_port, summary.destination_port = struct.unpack("!HH", transport[:4])
        attach_payload(summary, transport[8:], include_payload, max_payload)
    elif protocol == "ICMP" and len(transport) >= 4:
        summary.icmp_type, summary.icmp_code = struct.unpack("!BB", transport[:2])
        attach_payload(summary, transport[4:], include_payload, max_payload)
    else:
        attach_payload(summary, transport, include_payload, max_payload)

    return summary


def attach_payload(summary: PacketSummary, payload: bytes, include_payload: bool, max_payload: int) -> None:
    if include_payload and payload:
        summary.payload_preview = payload[: max(0, max_payload)].hex(" ")


def decode_tcp_flags(flag_byte: int) -> str:
    flags = [
        ("FIN", 0x01),
        ("SYN", 0x02),
        ("RST", 0x04),
        ("PSH", 0x08),
        ("ACK", 0x10),
        ("URG", 0x20),
        ("ECE", 0x40),
        ("CWR", 0x80),
    ]
    return ",".join(name for name, mask in flags if flag_byte & mask) or "NONE"


def matches_protocol(summary: PacketSummary, selected: str) -> bool:
    return selected == "all" or summary.protocol.lower() == selected


def print_header() -> None:
    print(f"{'Time':<20} {'Protocol':<8} {'Source':<22} {'Destination':<22} {'Info'}")
    print("-" * 92)


def print_summary(summary: PacketSummary) -> None:
    local_time = datetime.fromisoformat(summary.timestamp).astimezone().strftime("%H:%M:%S")
    src = with_port(summary.source, summary.source_port)
    dst = with_port(summary.destination, summary.destination_port)
    details = f"{summary.length} bytes"
    if summary.tcp_flags:
        details += f" flags={summary.tcp_flags}"
    if summary.icmp_type is not None:
        details += f" type={summary.icmp_type} code={summary.icmp_code}"
    if summary.payload_preview:
        details += f" payload={summary.payload_preview}"
    print(f"{local_time:<20} {summary.protocol:<8} {src:<22} {dst:<22} {details}")


def with_port(ip: str, port: int | None) -> str:
    return f"{ip}:{port}" if port else ip


def open_writer(path: Path | None) -> tuple[BinaryIO | TextIO | None, csv.DictWriter | None]:
    if not path:
        return None, None
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".csv":
        text_handle = path.open("w", newline="", encoding="utf-8")
        writer = csv.DictWriter(text_handle, fieldnames=list(PacketSummary.__dataclass_fields__.keys()))
        writer.writeheader()
        return text_handle, writer
    if path.suffix.lower() != ".jsonl":
        raise ValueError("Output path must end in .jsonl or .csv")
    return path.open("wb"), None


def save_summary(handle: BinaryIO | TextIO | None, writer: csv.DictWriter | None, summary: PacketSummary) -> None:
    if not handle:
        return
    row = asdict(summary)
    if writer:
        writer.writerow(row)
        handle.flush()
        return
    handle.write((json.dumps(row) + "\n").encode("utf-8"))
    handle.flush()


def capture(args: argparse.Namespace) -> int:
    host = detect_local_ip() if args.host == "auto" else args.host
    captured = 0
    shown = 0
    started = time.monotonic()
    writer_handle = None
    writer = None

    def stop_capture(_signum: int, _frame: object) -> None:
        raise CaptureStopped()

    signal.signal(signal.SIGINT, stop_capture)

    try:
        writer_handle, writer = open_writer(args.save)
        sniffer = create_capture_socket(host)
    except PermissionError:
        print("Permission denied. Start the terminal as Administrator/root and try again.", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"Could not start packet capture on {host}: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"Listening on {host}. Press Ctrl+C to stop.")
    print_header()

    try:
        while True:
            if args.timeout and time.monotonic() - started >= args.timeout:
                break
            if args.count and shown >= args.count:
                break
            packet = sniffer.recvfrom(65535)[0]
            captured += 1
            summary = parse_packet(packet, args.payload, args.max_payload)
            if not summary or not matches_protocol(summary, args.protocol):
                continue
            shown += 1
            print_summary(summary)
            save_summary(writer_handle, writer, summary)
    except CaptureStopped:
        pass
    finally:
        close_capture_socket(sniffer)
        if writer_handle:
            writer_handle.close()

    print(f"\nStopped. Displayed {shown} packet(s), inspected {captured} packet(s).")
    return 0


def main() -> int:
    return capture(parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
