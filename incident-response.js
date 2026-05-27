const $ = (id) => document.getElementById(id);

const samples = {
  phishing: [
    "User reported a suspicious email with a fake Microsoft 365 login page.",
    "Two users entered credentials before reporting the message.",
    "Mailbox rule created to forward messages externally.",
    "Several failed logins followed by one successful login from unusual country.",
    "No ransomware or endpoint malware observed yet."
  ].join("\n"),
  ransomware: [
    "Multiple endpoints show encrypted files with .locked extension.",
    "Ransom note found on shared drive.",
    "EDR reports suspicious PowerShell and credential dumping behavior.",
    "File server has high write activity from one workstation.",
    "Backups exist but last successful restore test was unknown."
  ].join("\n")
};

const incidentTypes = [
  {
    id: "phishing",
    name: "Credential phishing",
    severity: "High",
    weight: 26,
    terms: ["phish", "fake login", "credential", "mailbox", "forward", "microsoft 365", "unusual country", "impossible travel"],
    explanation: "The notes point to stolen credentials, mailbox changes, or suspicious sign-in behavior."
  },
  {
    id: "ransomware",
    name: "Ransomware or destructive malware",
    severity: "Critical",
    weight: 38,
    terms: ["ransom", "encrypted", ".locked", "decrypt", "shadow copy", "file server", "high write", "locked extension"],
    explanation: "The notes suggest active encryption or destructive behavior, so containment comes first."
  },
  {
    id: "malware",
    name: "Malware execution",
    severity: "High",
    weight: 28,
    terms: ["malware", "edr", "powershell", "mimikatz", "credential dumping", "beacon", "payload", "trojan"],
    explanation: "The notes include suspicious execution, endpoint detection, or post-exploitation behavior."
  },
  {
    id: "data-exposure",
    name: "Possible data exposure",
    severity: "High",
    weight: 30,
    terms: ["exfil", "leak", "database", "regulated", "pii", "patient", "payment", "customer data", "public bucket"],
    explanation: "The notes mention sensitive data, exposure, or possible outbound theft."
  },
  {
    id: "brute-force",
    name: "Account brute force",
    severity: "Medium",
    weight: 18,
    terms: ["failed logins", "password spray", "brute force", "lockout", "many failures", "successful login"],
    explanation: "The notes show repeated authentication attempts or a suspicious successful login."
  },
  {
    id: "privilege",
    name: "Privilege or admin abuse",
    severity: "High",
    weight: 24,
    terms: ["admin", "domain admin", "privilege", "new user", "new account", "group added", "sudo", "root"],
    explanation: "The notes indicate privileged account activity that could expand attacker control."
  }
];

const coreEvidence = [
  "Original alerts, timestamps, and detection IDs",
  "Affected usernames, hostnames, IP addresses, and cloud resources",
  "Authentication logs before and after the first suspicious event",
  "Endpoint or server logs from affected systems",
  "Screenshots or copies of user reports and attacker messages"
];

const typeEvidence = {
  phishing: ["Original phishing email with full headers", "Mailbox rules and forwarding settings", "OAuth app grants and active sessions"],
  ransomware: ["Ransom note and sample encrypted filename", "EDR process tree and command lines", "Backup status and last known clean restore point"],
  malware: ["Process tree, command line, hash, and parent process", "Network connections and persistence locations", "Memory or disk image when practical"],
  "data-exposure": ["Data owner and affected dataset", "Access logs for exposed storage, app, or database", "Outbound transfer records and sharing permissions"],
  "brute-force": ["Authentication source IPs and user targets", "Successful login after failure bursts", "MFA challenge and device registration logs"],
  privilege: ["Admin group membership changes", "Privileged command history", "New accounts, keys, tokens, or service principals"]
};

const playbooks = {
  phishing: [
    ["Contain accounts", "Reset affected passwords, revoke sessions, and require MFA re-registration if the second factor may be compromised."],
    ["Clean mailboxes", "Remove malicious messages, review forwarding rules, and disable suspicious OAuth grants."],
    ["Hunt for spread", "Search for similar messages, unusual sign-ins, and mailbox access across nearby users."]
  ],
  ransomware: [
    ["Isolate affected systems", "Disconnect impacted hosts and pause shared-drive access to stop encryption from spreading."],
    ["Protect backups", "Check backup integrity before restoring, and keep backups isolated from compromised credentials."],
    ["Find patient zero", "Use endpoint telemetry to identify initial execution, lateral movement, and persistence."]
  ],
  malware: [
    ["Quarantine host", "Isolate the endpoint while preserving volatile evidence if possible."],
    ["Block indicators", "Block confirmed hashes, domains, IPs, and command lines across security controls."],
    ["Remove persistence", "Check startup folders, scheduled tasks, services, registry run keys, and cloud agents."]
  ],
  "data-exposure": [
    ["Restrict access", "Remove public sharing, rotate exposed keys, and limit access to least privilege."],
    ["Scope data", "Identify what records were accessible, whether they were downloaded, and who owns notification decisions."],
    ["Preserve logs", "Export access logs quickly because cloud and app logs may age out."]
  ],
  "brute-force": [
    ["Block sources", "Block or rate-limit malicious sources while checking for successful authentication."],
    ["Protect users", "Reset passwords for targeted accounts and require MFA where missing."],
    ["Review sign-ins", "Look for new devices, token issuance, mailbox changes, and privilege changes."]
  ],
  privilege: [
    ["Freeze privilege changes", "Remove unauthorized admin access and pause risky automation until ownership is verified."],
    ["Rotate secrets", "Rotate admin passwords, API keys, tokens, and service account credentials that may be exposed."],
    ["Audit changes", "Review recent account creation, group membership, policy, and infrastructure changes."]
  ]
};

const state = {
  lastResult: null
};

function init() {
  bindEvents();
  loadSample("phishing");
  renderResult(null);
}

function bindEvents() {
  $("loadSample").addEventListener("click", () => loadSample("phishing"));
  $("loadPhishing").addEventListener("click", () => loadSample("phishing"));
  $("loadRansomware").addEventListener("click", () => loadSample("ransomware"));
  $("analyzeIncident").addEventListener("click", analyzeIncident);
  $("resetAgent").addEventListener("click", resetAgent);
  $("exportPlan").addEventListener("click", exportPlan);
}

function loadSample(type) {
  $("incidentInput").value = samples[type];
  $("sourceBadge").textContent = type === "ransomware" ? "Ransomware sample" : "Phishing sample";
}

function analyzeIncident() {
  const raw = $("incidentInput").value.trim();
  if (!raw) return;

  const matches = matchIncidentTypes(raw);
  const primary = matches[0] || {
    id: "general",
    name: "General security incident",
    severity: "Medium",
    weight: 14,
    hits: [],
    explanation: "The notes do not strongly match one playbook, so use a general triage path."
  };
  const score = scoreIncident(matches, primary);
  const severity = severityFor(score);
  const actions = buildActions(primary, matches);
  const evidence = buildEvidence(primary, matches);
  const summary = summaryFor(primary, severity, matches);

  state.lastResult = {
    time: new Date().toLocaleString(),
    environment: $("environmentType").selectedOptions[0].textContent,
    assetCriticality: $("assetCriticality").selectedOptions[0].textContent,
    dataSensitivity: $("dataSensitivity").selectedOptions[0].textContent,
    phase: $("responsePhase").selectedOptions[0].textContent,
    primary,
    matches,
    score,
    severity,
    actions,
    evidence,
    summary,
    raw
  };

  renderResult(state.lastResult);
}

function matchIncidentTypes(raw) {
  const text = raw.toLowerCase();
  return incidentTypes
    .map((type) => {
      const hits = type.terms.filter((term) => text.includes(term));
      return { ...type, hits, score: hits.length * type.weight };
    })
    .filter((type) => type.hits.length)
    .sort((a, b) => b.score - a.score);
}

function scoreIncident(matches, primary) {
  const context = {
    criticality: $("assetCriticality").value,
    sensitivity: $("dataSensitivity").value,
    phase: $("responsePhase").value
  };
  let score = primary.weight + matches.reduce((sum, match) => sum + Math.min(16, match.hits.length * 5), 0);
  if (context.criticality === "important") score += 8;
  if (context.criticality === "critical") score += 18;
  if (context.sensitivity === "internal") score += 7;
  if (context.sensitivity === "regulated") score += 18;
  if (context.phase === "containment") score += 8;
  if (context.phase === "eradication" || context.phase === "recovery") score -= 4;
  return clamp(score, 0, 100);
}

function severityFor(score) {
  if (score >= 78) return "Critical";
  if (score >= 55) return "High";
  if (score >= 28) return "Medium";
  return "Low";
}

function buildActions(primary, matches) {
  const intro = [
    ["Declare and assign owner", "Name the incident lead, start a timeline, and keep all actions tied to evidence."],
    ["Preserve before changing", "Capture volatile logs, screenshots, and affected asset details before wiping or rebuilding."]
  ];
  const specific = playbooks[primary.id] || [
    ["Stabilize the environment", "Limit access to affected systems while you verify what happened."],
    ["Scope affected assets", "Identify users, hosts, applications, and data touched by the suspicious activity."],
    ["Document decisions", "Record why each containment or recovery action was taken."]
  ];
  const related = matches
    .filter((match) => match.id !== primary.id)
    .slice(0, 2)
    .map((match) => [`Check related ${match.name.toLowerCase()}`, match.explanation]);
  const close = [
    ["Recover safely", "Restore only from trusted sources, rotate exposed credentials, and monitor closely after recovery."],
    ["Lessons learned", "Write down root cause, missed controls, response gaps, and prevention steps."]
  ];
  return [...intro, ...specific, ...related, ...close];
}

function buildEvidence(primary, matches) {
  const items = new Set(coreEvidence);
  [primary, ...matches].forEach((match) => {
    (typeEvidence[match.id] || []).forEach((item) => items.add(item));
  });
  return [...items].slice(0, 12);
}

function summaryFor(primary, severity, matches) {
  const signalText = matches.length ? `${matches.length} incident pattern(s) matched` : "no strong pattern matched";
  return `${severity} priority: likely ${primary.name.toLowerCase()}. The agent found ${signalText}. Start with containment, preserve evidence, and keep a written timeline.`;
}

function renderResult(result) {
  if (!result) {
    $("severityScore").textContent = "0";
    $("actionCount").textContent = "0";
    $("evidenceCount").textContent = "0";
    $("riskScore").textContent = "0";
    $("scoreFill").style.width = "0%";
    $("summaryBox").textContent = "Add incident notes to receive a guided response plan.";
    $("verdictBadge").textContent = "Idle";
    $("verdictBadge").className = "verdict neutral";
    $("signalCount").textContent = "0 signals";
    $("playbookBadge").textContent = "0 steps";
    $("evidenceBadge").textContent = "0 items";
    $("signalList").innerHTML = `<div class="empty-state">Incident signals will appear here.</div>`;
    $("playbookList").innerHTML = `<div class="empty-state">Response actions will appear here.</div>`;
    $("evidenceList").innerHTML = `<div class="empty-state">Evidence reminders will appear here.</div>`;
    return;
  }

  $("severityScore").textContent = result.score;
  $("actionCount").textContent = result.actions.length;
  $("evidenceCount").textContent = result.evidence.length;
  $("riskScore").textContent = result.score;
  $("scoreFill").style.width = `${result.score}%`;
  $("summaryBox").textContent = result.summary;
  $("verdictBadge").textContent = result.severity;
  $("verdictBadge").className = `verdict ${result.severity.toLowerCase()}`;
  renderSignals(result.matches, result.primary);
  renderSteps("playbookList", result.actions);
  renderSteps("evidenceList", result.evidence.map((item) => ["Preserve", item]));
  $("playbookBadge").textContent = `${result.actions.length} steps`;
  $("evidenceBadge").textContent = `${result.evidence.length} items`;
}

function renderSignals(matches, primary) {
  $("signalCount").textContent = `${matches.length} signals`;
  if (!matches.length) {
    $("signalList").innerHTML = `<div class="empty-state">No strong pattern matched. Use general triage and add more details as you learn them.</div>`;
    return;
  }

  const template = $("signalTemplate");
  $("signalList").innerHTML = "";
  matches.forEach((match) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".signal-card");
    card.dataset.severity = match.severity.toLowerCase();
    node.querySelector("strong").textContent = match.name;
    node.querySelector("p").textContent = match.explanation;
    node.querySelector("small").textContent = `${match.severity} - matched: ${match.hits.join(", ")}`;
    if (match.id === primary.id) card.dataset.primary = "true";
    $("signalList").appendChild(node);
  });
}

function renderSteps(targetId, items) {
  const template = $("stepTemplate");
  const target = $(targetId);
  target.innerHTML = "";
  items.forEach(([title, detail], index) => {
    const node = template.content.cloneNode(true);
    node.querySelector("span").textContent = String(index + 1);
    node.querySelector("strong").textContent = title;
    node.querySelector("p").textContent = detail;
    target.appendChild(node);
  });
}

function resetAgent() {
  state.lastResult = null;
  $("incidentInput").value = "";
  $("environmentType").value = "small-business";
  $("assetCriticality").value = "standard";
  $("dataSensitivity").value = "low";
  $("responsePhase").value = "triage";
  $("sourceBadge").textContent = "Manual case";
  renderResult(null);
}

function exportPlan() {
  const result = state.lastResult;
  const report = result
    ? [
        "# Automated Incident Response Plan",
        "",
        `Created: ${result.time}`,
        `Environment: ${result.environment}`,
        `Asset criticality: ${result.assetCriticality}`,
        `Data sensitivity: ${result.dataSensitivity}`,
        `Current phase: ${result.phase}`,
        `Severity: ${result.severity}`,
        `Priority score: ${result.score}`,
        `Likely category: ${result.primary.name}`,
        "",
        "## Summary",
        result.summary,
        "",
        "## Matched Signals",
        ...(result.matches.length ? result.matches.map((match) => `- ${match.name}: ${match.hits.join(", ")}`) : ["- No strong pattern matched"]),
        "",
        "## Recommended Actions",
        ...result.actions.map(([title, detail], index) => `${index + 1}. ${title}: ${detail}`),
        "",
        "## Evidence To Preserve",
        ...result.evidence.map((item) => `- ${item}`),
        "",
        "## Original Notes",
        result.raw
      ].join("\n")
    : "# Automated Incident Response Plan\n\nNo incident has been analyzed.";

  const blob = new Blob([report], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "incident-response-plan.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

init();
