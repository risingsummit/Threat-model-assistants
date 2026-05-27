# Mini SIEM Report

Generated: 2026-05-24T08:06:15+00:00
Events analyzed: 17
Findings: 7

## Severity Counts
- Critical: 2
- High: 3
- Medium: 2
- Low: 0

## Findings

### Critical: Suspicious command or process

1 suspicious command/process event(s) found.

Recommendation: Inspect the command line, parent process, user context, and endpoint timeline.

Evidence:
- 2026-05-24T08:08:12+00:00 WIN10 from 192.168.56.20 user=jsmith id=4688 Process creation

### Critical: Security log cleared

1 log clearing event(s) found.

Recommendation: Treat unexpected log clearing as high priority and preserve remaining evidence immediately.

Evidence:
- 2026-05-24T08:11:05+00:00 DC01 from 192.168.56.10 user=administrator id=1102 Audit log cleared

### High: Repeated failed authentication

5 failed authentication events for administrator from 203.0.113.20.

Recommendation: Check whether this is password spraying or brute force activity, then reset credentials or block the source if unauthorized.

Evidence:
- 2026-05-24T08:01:11+00:00 DC01 from 203.0.113.20 user=administrator id=4625 Failed logon
- 2026-05-24T08:01:14+00:00 DC01 from 203.0.113.20 user=administrator id=4625 Failed logon
- 2026-05-24T08:01:18+00:00 DC01 from 203.0.113.20 user=administrator id=4625 Failed logon
- 2026-05-24T08:01:22+00:00 DC01 from 203.0.113.20 user=administrator id=4625 Failed logon
- 2026-05-24T08:01:27+00:00 DC01 from 203.0.113.20 user=administrator id=4625 Failed logon

### High: Identity or group change

2 user, password, or group membership change event(s) found.

Recommendation: Validate that each account or group change was approved and performed by the expected administrator.

Evidence:
- 2026-05-24T08:05:02+00:00 DC01 from 192.168.56.10 user=svc_temp id=4720 User account created
- 2026-05-24T08:05:45+00:00 DC01 from 192.168.56.10 user=svc_temp id=4732 Member added to local group

### High: Service installation

1 service installation event(s) found.

Recommendation: Confirm the service binary path, signer, installer source, and change ticket.

Evidence:
- 2026-05-24T08:09:51+00:00 WIN10 from 192.168.56.20 user=SYSTEM id=7045 Service installed

### Medium: Account lockout

1 account lockout event(s) found.

Recommendation: Review the locked accounts, source hosts, and recent failed logons.

Evidence:
- 2026-05-24T08:02:10+00:00 DC01 from 203.0.113.20 user=administrator id=4740 User account locked out

### Medium: Privileged logon

1 privileged logon event(s) found.

Recommendation: Confirm these privileged sessions match approved administrator activity.

Evidence:
- 2026-05-24T08:04:30+00:00 DC01 from 192.168.56.10 user=administrator id=4672 Special privileges assigned