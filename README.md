# Threat Model Assistants

A zero-install collection of browser-based and command-line security training assistants.

## Use

Open `index.html` in a browser for the Network Intrusion Detection System.

Open `password-checker.html` in a browser for the Password Strength & Pwned Checker.

Open `incident-response.html` in a browser for the Automated Incident Response Agent.

Open `rule-creator.html` in a browser for the Custom Security Rule Creator.

Open `financial-copilot.html` in a browser for the AI Financial Copilot.

Open `study-platform.html` in a browser for the AI Study Platform.

Open `threat-model-studio/index.html` in a browser for Threat Model Studio, a GitHub-ready STRIDE threat modeling portfolio project.

## Threat Model Studio

`threat-model-studio` is a polished software engineering showcase project. It turns a product profile, assets, data flows, and mitigation tasks into a prioritized STRIDE threat model with residual risk scoring and Markdown export.

Features:

- Local-only browser app that can run on GitHub Pages
- STRIDE finding generation for spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege
- Editable assets, flows, and mitigation tracker
- Risk score that responds to added security controls
- Sample project data, preview asset, and automated engine tests

## AI Study Platform

`study-platform.html` turns notes, subject goals, exam timing, confidence, and study style into a local study session. It creates a readiness score, study tasks, flashcards, a quick quiz, learning insights, and an exportable Markdown plan.

Features:

- Study profile and notes intake
- Local concept extraction from notes
- Adaptive study tasks by time, confidence, and study style
- Click-to-reveal flashcards
- Interactive quiz scoring
- Exportable Markdown study plan

## AI Financial Copilot

`financial-copilot.html` turns monthly income, spending, savings, debt, goals, and recent transactions into a local planning workspace. It scores financial health, recommends monthly allocations, forecasts savings and debt, categorizes transactions, and exports a Markdown plan.

Features:

- Monthly budget and goal intake
- Local transaction categorization
- Emergency runway, surplus, and financial health scoring
- Savings, debt, and goal trajectory forecast
- Scenario button for testing a lifestyle-spending trim
- Exportable Markdown financial plan

## Custom Security Rule Creator

`rule-creator.html` helps you learn detection engineering by building a custom rule from field conditions, testing it against sample events, explaining match logic, scoring rule quality, and exporting a starter Sigma-style rule plus plain-English documentation.

Features:

- Guided rule builder for log source, severity, logic, and field conditions
- PowerShell and cloud audit training samples
- Rule testing against JSON-line or key-value events
- Matched-event preview and quality guidance for noisy or narrow rules
- Exportable Markdown with starter Sigma-style detection content

## Automated Incident Response Agent

`incident-response.html` turns incident notes into a guided response plan. It classifies likely incident type, estimates response priority, explains matched signals, recommends containment and recovery steps, lists evidence to preserve, and exports a Markdown response plan.

Features:

- Phishing and ransomware training samples
- Local classification for phishing, ransomware, malware, data exposure, brute force, and privilege abuse patterns
- Severity scoring based on matched signals, asset criticality, data sensitivity, and response phase
- Educational response loop for triage, containment, and recovery
- Evidence preservation checklist and exportable incident response plan

## Password Strength & Pwned Checker

`password-checker.html` scores password strength locally, identifies risky patterns, generates strong passwords or passphrases, and checks known breach exposure with the Have I Been Pwned range API. The password itself is never sent to the lookup service; the browser hashes it with SHA-1 and sends only the first 5 hash characters.

Features:

- Local strength score, entropy estimate, and offline cracking-time estimate
- Checklist for length, character variety, common passwords, sequences, repetition, and predictable substitutions
- Strong random password and passphrase generation
- Optional pwned-password lookup using k-anonymity
- MFA readiness tracker for email, banking, cloud, and admin accounts
- Copy, clear, and show/hide controls

## Input Format

Paste one event per line:

```text
timestamp source_ip destination_ip protocol source_port destination_port action bytes optional_detail
```

CSV and simple JSON event arrays are also supported. Field names such as `src`, `dst`, `proto`, `srcPort`, `dstPort`, `action`, `bytes`, and `detail` are recognized.

## Features

- Load attack and benign sample traffic
- Import `.log`, `.txt`, `.csv`, or `.json` traffic files
- Detect watchlist IP contact, port scans, repeated login failures, DNS tunneling, periodic beaconing, risky service ports, and large outbound transfers
- Toggle detection rules on or off
- View intrusion score, triggered alerts, event timeline, and recommended response
- Export the latest analysis as a Markdown incident report
- Build an isolated Active Directory training lab with the files in `active-directory-home-lab`

## Packet Sniffer

This workspace also includes `packet_sniffer.py`, a local packet sniffer for authorized diagnostics. It uses Python's built-in networking libraries and summarizes IPv4 TCP, UDP, and ICMP traffic.

Run it from an Administrator PowerShell window:

```powershell
python .\packet_sniffer.py --count 25 --timeout 30
```

If Windows does not recognize `python`, try `py` instead:

```powershell
py .\packet_sniffer.py --count 25 --timeout 30
```

Useful options:

```powershell
python .\packet_sniffer.py --protocol tcp --count 50
python .\packet_sniffer.py --save captures\packets.jsonl --count 100
python .\packet_sniffer.py --save captures\packets.csv --protocol udp
python .\packet_sniffer.py --payload --max-payload 24 --count 10
```

Only use live capture on devices and networks you own or have explicit permission to monitor.

## Port Scanner

`port_scanner.py` checks TCP ports on authorized hosts using safe connection attempts. It supports single hosts, comma-separated targets, CIDR ranges, port ranges, presets, banner grabbing, and CSV/JSONL export.

Examples:

```powershell
python .\port_scanner.py 127.0.0.1
python .\port_scanner.py 192.168.56.10 -p windows
python .\port_scanner.py 192.168.56.0/30 -p 22,80,443,3389
python .\port_scanner.py scanme.example.local -p web --banner
python .\port_scanner.py 192.168.56.10 -p 1-1024 --save captures\ports.csv
```

If Windows does not recognize `python`, try `py` instead.

## Log Analyzer / Mini SIEM

`log_analyzer.py` parses local logs, normalizes common fields, and flags suspicious patterns such as repeated failed logons, account lockouts, privileged logons, identity changes, suspicious process commands, service installation, and security log clearing.

Try it with the included sample logs:

```powershell
python .\log_analyzer.py .\sample-logs --show-events
python .\log_analyzer.py .\sample-logs --save reports\mini-siem-report.md
python .\log_analyzer.py .\sample-logs\windows-security-sample.csv --save reports\mini-siem-report.json
```

It accepts `.log`, `.txt`, `.csv`, `.json`, and `.jsonl` files. If Windows does not recognize `python`, use `py`.

To export recent Windows Security events into a CSV the analyzer can read:

```powershell
.\scripts\export-windows-security-events.ps1 -OutputPath .\sample-logs\my-security-events.csv -Hours 24
python .\log_analyzer.py .\sample-logs\my-security-events.csv --save reports\my-siem-report.md
```

## Notes

This is a local training and triage assistant, not a production packet sensor. For production use, connect it to real packet capture or flow logs, enrich alerts with asset identity and threat intelligence, and route high-confidence findings into your SIEM or SOAR workflow.
