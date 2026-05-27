const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "network-intrusion-detection-system";

const samples = {
  attack: [
    "2026-05-23T08:13:01Z 203.0.113.77 10.0.4.20 TCP 443 22 SYN 64",
    "2026-05-23T08:13:02Z 203.0.113.77 10.0.4.20 TCP 443 23 SYN 64",
    "2026-05-23T08:13:02Z 203.0.113.77 10.0.4.20 TCP 443 80 SYN 64",
    "2026-05-23T08:13:03Z 203.0.113.77 10.0.4.20 TCP 443 445 SYN 64",
    "2026-05-23T08:13:03Z 203.0.113.77 10.0.4.20 TCP 443 3389 SYN 64",
    "2026-05-23T08:14:18Z 45.155.205.233 10.0.7.14 TCP 51682 22 LOGIN_FAIL 420",
    "2026-05-23T08:14:19Z 45.155.205.233 10.0.7.14 TCP 51683 22 LOGIN_FAIL 420",
    "2026-05-23T08:14:20Z 45.155.205.233 10.0.7.14 TCP 51684 22 LOGIN_FAIL 420",
    "2026-05-23T08:14:22Z 45.155.205.233 10.0.7.14 TCP 51685 22 LOGIN_FAIL 420",
    "2026-05-23T08:15:44Z 10.0.7.14 185.199.110.153 TCP 49712 443 TLS_CLIENT_HELLO 1800",
    "2026-05-23T08:16:44Z 10.0.7.14 185.199.110.153 TCP 49712 443 TLS_CLIENT_HELLO 1784",
    "2026-05-23T08:17:44Z 10.0.7.14 185.199.110.153 TCP 49712 443 TLS_CLIENT_HELLO 1810",
    "2026-05-23T08:18:44Z 10.0.7.14 185.199.110.153 TCP 49712 443 TLS_CLIENT_HELLO 1796",
    "2026-05-23T08:20:02Z 10.0.9.50 8.8.8.8 UDP 55431 53 DNS_QUERY 950 q=very-long-subdomain-7ac91f21b447a9c0.payload.example.biz",
    "2026-05-23T08:20:03Z 10.0.9.50 8.8.8.8 UDP 55432 53 DNS_QUERY 970 q=another-long-subdomain-9f00aa11cc22dd33.payload.example.biz",
    "2026-05-23T08:26:30Z 10.0.5.11 198.51.100.88 TCP 49122 4444 PSH 94000000"
  ].join("\n"),
  benign: [
    "2026-05-23T09:00:01Z 10.0.2.25 10.0.1.10 TCP 51244 443 TLS_CLIENT_HELLO 1300",
    "2026-05-23T09:00:04Z 10.0.2.25 8.8.8.8 UDP 53312 53 DNS_QUERY 120 q=updates.example.com",
    "2026-05-23T09:02:10Z 10.0.3.18 10.0.1.20 TCP 50100 445 SMB 3200",
    "2026-05-23T09:03:22Z 10.0.4.33 10.0.1.15 TCP 50110 80 HTTP_GET 1600",
    "2026-05-23T09:05:49Z 10.0.2.25 10.0.1.10 TCP 51245 443 TLS_APPLICATION 42000"
  ].join("\n")
};

const rules = [
  {
    id: "watchlist",
    name: "Threat watchlist contact",
    description: "Flags traffic to or from known malicious IP addresses.",
    severity: "Critical",
    weight: 36
  },
  {
    id: "port-scan",
    name: "Horizontal or vertical port scan",
    description: "Detects one source touching many destination ports or hosts in a short window.",
    severity: "High",
    weight: 30
  },
  {
    id: "brute-force",
    name: "Repeated login failures",
    description: "Detects several authentication failures from the same source to one service.",
    severity: "High",
    weight: 28
  },
  {
    id: "dns-tunnel",
    name: "DNS tunneling pattern",
    description: "Flags long or high-entropy DNS queries that can hide command and control traffic.",
    severity: "High",
    weight: 26
  },
  {
    id: "beaconing",
    name: "Periodic beaconing",
    description: "Detects repeated outbound connections with consistent timing.",
    severity: "Medium",
    weight: 22
  },
  {
    id: "exfiltration",
    name: "Large outbound transfer",
    description: "Flags high-volume outbound traffic to external destinations.",
    severity: "Critical",
    weight: 34
  },
  {
    id: "risky-port",
    name: "Risky service exposure",
    description: "Flags traffic involving commonly abused admin, database, and backdoor ports.",
    severity: "Medium",
    weight: 14
  }
];

const riskyPorts = new Set([21, 22, 23, 135, 139, 445, 1433, 1521, 3306, 3389, 4444, 5900, 6379, 8080, 9200]);

const state = {
  enabledRules: Object.fromEntries(rules.map((rule) => [rule.id, true])),
  lastResult: null,
  history: []
};

function init() {
  restore();
  bindEvents();
  renderRules();
  renderResult(state.lastResult);
  renderHistory();
  if (!$("trafficInput").value.trim()) loadSample("attack");
}

function bindEvents() {
  $("loadSample").addEventListener("click", () => loadSample("attack"));
  $("loadBenign").addEventListener("click", () => loadSample("benign"));
  $("analyzeTraffic").addEventListener("click", analyzeTraffic);
  $("resetSystem").addEventListener("click", resetSystem);
  $("clearAlerts").addEventListener("click", clearAlerts);
  $("exportReport").addEventListener("click", exportReport);
  $("trafficFile").addEventListener("change", importTrafficFile);
  ["sensorProfile", "detectionMode", "protectedSubnet", "trustedDns", "watchlistInput", "trafficInput"].forEach((id) => {
    $(id).addEventListener("input", save);
    $(id).addEventListener("change", save);
  });
}

function loadSample(type) {
  $("trafficInput").value = samples[type];
  $("sourceBadge").textContent = type === "attack" ? "Attack sample" : "Benign sample";
  save();
}

async function importTrafficFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $("trafficInput").value = await file.text();
  $("sourceBadge").textContent = file.name;
  save();
}

function renderRules() {
  const list = $("ruleList");
  const template = $("ruleTemplate");
  list.innerHTML = "";

  rules.forEach((rule) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".rule-card");
    const checkbox = node.querySelector("input");
    card.dataset.severity = rule.severity.toLowerCase();
    node.querySelector("h3").textContent = rule.name;
    node.querySelector("p").textContent = `${rule.description} Severity: ${rule.severity}.`;
    checkbox.checked = Boolean(state.enabledRules[rule.id]);
    checkbox.dataset.ruleId = rule.id;
    checkbox.addEventListener("change", (event) => {
      state.enabledRules[event.target.dataset.ruleId] = event.target.checked;
      renderRules();
      save();
    });
    list.appendChild(node);
  });

  $("ruleCount").textContent = `${activeRules().length} enabled`;
}

function activeRules() {
  return rules.filter((rule) => state.enabledRules[rule.id]);
}

function analyzeTraffic() {
  const events = parseTraffic($("trafficInput").value);
  if (!events.length) return;

  const context = {
    watchlist: parseList($("watchlistInput").value),
    mode: $("detectionMode").value,
    protectedSubnet: $("protectedSubnet").value.trim(),
    trustedDns: parseList($("trustedDns").value)
  };
  const alerts = detectAlerts(events, context).filter((alert) => state.enabledRules[alert.ruleId]);
  const multiplier = context.mode === "strict" ? 1.15 : context.mode === "monitor" ? 0.9 : 1;
  const score = Math.min(100, Math.round(alerts.reduce((sum, alert) => sum + alert.weight, 0) * multiplier));
  const risk = score >= 75 ? "Critical" : score >= 45 ? "Elevated" : score >= 20 ? "Watch" : "Normal";
  const result = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    sensor: $("sensorProfile").selectedOptions[0].textContent,
    mode: context.mode,
    events,
    alerts,
    score,
    risk,
    summary: recommendationFor(risk, alerts)
  };

  state.lastResult = result;
  state.history.unshift({
    id: result.id,
    time: result.time,
    sensor: result.sensor,
    score: result.score,
    risk: result.risk,
    alerts: result.alerts.length,
    events: result.events.length
  });
  state.history = state.history.slice(0, 16);
  renderResult(result);
  renderHistory();
  save();
}

function parseTraffic(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : parsed.events || [];
      return rows.map(normalizeEvent).filter(Boolean);
    } catch {
      return [];
    }
  }

  return trimmed.split(/\r?\n/).map((line, index) => parseLine(line, index)).filter(Boolean);
}

function parseLine(line, index) {
  const value = line.trim();
  if (!value) return null;

  if (value.includes(",")) {
    const [time, src, dst, proto, srcPort, dstPort, action, bytes, ...rest] = value.split(",").map((item) => item.trim());
    return normalizeEvent({ time, src, dst, proto, srcPort, dstPort, action, bytes, detail: rest.join(",") }, index);
  }

  const parts = value.split(/\s+/);
  if (parts.length < 8) return null;
  const [time, src, dst, proto, srcPort, dstPort, action, bytes, ...detailParts] = parts;
  return normalizeEvent({ time, src, dst, proto, srcPort, dstPort, action, bytes, detail: detailParts.join(" ") }, index);
}

function normalizeEvent(event, index = 0) {
  const time = event.time || event.timestamp || new Date().toISOString();
  const parsedTime = Date.parse(time);
  const src = event.src || event.source || event.sourceIp || event.source_ip;
  const dst = event.dst || event.destination || event.destIp || event.destination_ip;
  if (!src || !dst) return null;

  return {
    id: `${index}-${src}-${dst}-${event.dstPort || event.destinationPort || ""}`,
    time,
    epoch: Number.isNaN(parsedTime) ? index * 1000 : parsedTime,
    src,
    dst,
    proto: String(event.proto || event.protocol || "TCP").toUpperCase(),
    srcPort: Number(event.srcPort || event.sourcePort || event.source_port || 0),
    dstPort: Number(event.dstPort || event.destinationPort || event.destination_port || 0),
    action: String(event.action || event.event || event.signature || "").toUpperCase(),
    bytes: Number(event.bytes || event.size || 0),
    detail: String(event.detail || event.message || "")
  };
}

function detectAlerts(events, context) {
  return [
    ...detectWatchlist(events, context.watchlist),
    ...detectPortScans(events),
    ...detectBruteForce(events),
    ...detectDnsTunneling(events),
    ...detectBeaconing(events),
    ...detectExfiltration(events),
    ...detectRiskyPorts(events)
  ];
}

function detectWatchlist(events, watchlist) {
  const matches = events.filter((event) => watchlist.includes(event.src) || watchlist.includes(event.dst));
  if (!matches.length) return [];
  return [alert("watchlist", "Threat watchlist contact", `${matches.length} event(s) involved a known malicious IP.`, "Critical", ruleWeight("watchlist"), matches)];
}

function detectPortScans(events) {
  const groups = groupBy(events, (event) => `${event.src}->${event.dst}`);
  const alerts = [];
  groups.forEach((items, key) => {
    const ports = new Set(items.map((item) => item.dstPort).filter(Boolean));
    const syns = items.filter((item) => item.action.includes("SYN")).length;
    if (ports.size >= 5 || syns >= 5) {
      alerts.push(alert("port-scan", "Port scan behavior", `${key} touched ${ports.size} destination ports in the sample.`, "High", ruleWeight("port-scan"), items));
    }
  });
  return alerts;
}

function detectBruteForce(events) {
  const failures = events.filter((event) => event.action.includes("FAIL") || event.detail.toUpperCase().includes("LOGIN_FAIL"));
  const groups = groupBy(failures, (event) => `${event.src}->${event.dst}:${event.dstPort}`);
  const alerts = [];
  groups.forEach((items, key) => {
    if (items.length >= 4) {
      alerts.push(alert("brute-force", "Repeated login failures", `${key} produced ${items.length} failed authentication attempts.`, "High", ruleWeight("brute-force"), items));
    }
  });
  return alerts;
}

function detectDnsTunneling(events) {
  const dns = events.filter((event) => event.dstPort === 53 || event.action.includes("DNS"));
  const matches = dns.filter((event) => {
    const query = (event.detail.match(/q=([^\s]+)/i) || [])[1] || event.detail;
    return query.length > 55 || entropy(query) > 4.2;
  });
  if (!matches.length) return [];
  return [alert("dns-tunnel", "DNS tunneling pattern", `${matches.length} DNS request(s) used long or high-entropy names.`, "High", ruleWeight("dns-tunnel"), matches)];
}

function detectBeaconing(events) {
  const outbound = events.filter((event) => isPrivateIp(event.src) && !isPrivateIp(event.dst));
  const groups = groupBy(outbound, (event) => `${event.src}->${event.dst}:${event.dstPort}`);
  const alerts = [];
  groups.forEach((items, key) => {
    if (items.length < 4) return;
    const sorted = items.slice().sort((a, b) => a.epoch - b.epoch);
    const intervals = sorted.slice(1).map((item, index) => item.epoch - sorted[index].epoch);
    const avg = intervals.reduce((sum, item) => sum + item, 0) / intervals.length;
    const variance = intervals.reduce((sum, item) => sum + Math.abs(item - avg), 0) / intervals.length;
    if (avg > 0 && variance / avg < 0.18) {
      alerts.push(alert("beaconing", "Periodic beaconing", `${key} repeated at a steady interval.`, "Medium", ruleWeight("beaconing"), sorted));
    }
  });
  return alerts;
}

function detectExfiltration(events) {
  const matches = events.filter((event) => isPrivateIp(event.src) && !isPrivateIp(event.dst) && event.bytes >= 50000000);
  if (!matches.length) return [];
  const total = matches.reduce((sum, event) => sum + event.bytes, 0);
  return [alert("exfiltration", "Large outbound transfer", `${formatBytes(total)} left protected hosts for external destinations.`, "Critical", ruleWeight("exfiltration"), matches)];
}

function detectRiskyPorts(events) {
  const matches = events.filter((event) => riskyPorts.has(event.dstPort));
  if (!matches.length) return [];
  return [alert("risky-port", "Risky service exposure", `${matches.length} event(s) used high-risk service ports.`, "Medium", ruleWeight("risky-port"), matches)];
}

function alert(ruleId, title, detail, severity, weight, events) {
  return { ruleId, title, detail, severity, weight, events: events.slice(0, 8) };
}

function ruleWeight(id) {
  return rules.find((rule) => rule.id === id)?.weight || 0;
}

function recommendationFor(risk, alerts) {
  if (risk === "Critical") return "Contain affected hosts, preserve logs, block confirmed malicious IPs, and begin incident response triage.";
  if (risk === "Elevated") return "Investigate source and destination hosts, validate user activity, and tune firewall or EDR controls where needed.";
  if (risk === "Watch") return "Monitor the hosts and review whether the activity matches expected business traffic.";
  return alerts.length ? "Low-level signals were detected. Review them for context before closing." : "No enabled detection rule matched this traffic sample.";
}

function renderResult(result) {
  const badge = $("verdictBadge");
  if (!result) {
    $("riskScore").textContent = "0";
    $("scoreFill").style.width = "0%";
    $("summaryBox").textContent = "Analyze traffic to see likely attacks, affected hosts, and response steps.";
    $("triggerCount").textContent = "0 triggered";
    $("timelineCount").textContent = "0 events";
    $("alertStack").innerHTML = `<div class="empty-state">Rule matches will appear here.</div>`;
    $("timelineLog").innerHTML = `<div class="empty-state">Parsed traffic events will appear here.</div>`;
    badge.textContent = "Idle";
    badge.className = "verdict neutral";
    return;
  }

  $("riskScore").textContent = result.score;
  $("scoreFill").style.width = `${result.score}%`;
  $("summaryBox").textContent = result.summary;
  badge.textContent = result.risk;
  badge.className = `verdict ${result.risk.toLowerCase()}`;
  renderAlerts(result.alerts);
  renderTimeline(result.events);
}

function renderAlerts(alerts) {
  $("triggerCount").textContent = `${alerts.length} triggered`;
  if (!alerts.length) {
    $("alertStack").innerHTML = `<div class="empty-state">No enabled detection rule matched this traffic sample.</div>`;
    return;
  }

  const template = $("alertTemplate");
  $("alertStack").innerHTML = "";
  alerts.sort((a, b) => b.weight - a.weight).forEach((item) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".alert-card");
    card.dataset.severity = item.severity.toLowerCase();
    node.querySelector("strong").textContent = item.title;
    node.querySelector("span").textContent = item.detail;
    node.querySelector("small").textContent = `${item.severity} +${item.weight}`;
    $("alertStack").appendChild(node);
  });
}

function renderTimeline(events) {
  $("timelineCount").textContent = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  $("timelineLog").innerHTML = events.length
    ? events.slice(0, 40).map((event) => `
      <article class="timeline-item">
        <div>
          <strong>${escapeHtml(event.src)} -> ${escapeHtml(event.dst)}:${event.dstPort}</strong>
          <span>${escapeHtml(event.time)} - ${escapeHtml(event.proto)} - ${escapeHtml(event.action || "FLOW")} - ${formatBytes(event.bytes)}</span>
        </div>
        <small>${escapeHtml(event.detail || "event")}</small>
      </article>
    `).join("")
    : `<div class="empty-state">Parsed traffic events will appear here.</div>`;
}

function renderHistory() {
  const critical = state.history.filter((item) => item.risk === "Critical").length;
  const alerts = state.history.reduce((sum, item) => sum + item.alerts, 0);
  const events = state.history.reduce((sum, item) => sum + item.events, 0);
  $("criticalCount").textContent = critical;
  $("alertCount").textContent = alerts;
  $("eventCount").textContent = events;
}

function clearAlerts() {
  state.lastResult = null;
  renderResult(null);
  save();
}

function resetSystem() {
  state.enabledRules = Object.fromEntries(rules.map((rule) => [rule.id, true]));
  state.lastResult = null;
  state.history = [];
  $("sensorProfile").value = "edge";
  $("detectionMode").value = "balanced";
  $("protectedSubnet").value = "10.0.0.0/8";
  $("trustedDns").value = "8.8.8.8, 1.1.1.1";
  $("watchlistInput").value = "185.199.110.153, 45.155.205.233";
  $("trafficInput").value = "";
  $("sourceBadge").textContent = "Manual traffic";
  $("trafficFile").value = "";
  renderRules();
  renderResult(null);
  renderHistory();
  localStorage.removeItem(STORAGE_KEY);
}

function exportReport() {
  const result = state.lastResult;
  const report = result
    ? [
        "# Network Intrusion Detection Report",
        "",
        `Sensor: ${result.sensor}`,
        `Mode: ${result.mode}`,
        `Risk: ${result.risk}`,
        `Score: ${result.score}`,
        `Events analyzed: ${result.events.length}`,
        `Alerts triggered: ${result.alerts.length}`,
        "",
        "## Recommended Action",
        result.summary,
        "",
        "## Alerts",
        ...(result.alerts.length ? result.alerts.map((item) => `- ${item.title} (${item.severity}): ${item.detail}`) : ["- None"]),
        "",
        "## Notable Events",
        ...result.events.slice(0, 20).map((event) => `- ${event.time} ${event.src} -> ${event.dst}:${event.dstPort} ${event.proto} ${event.action || "FLOW"} ${formatBytes(event.bytes)}`)
      ].join("\n")
    : "# Network Intrusion Detection Report\n\nNo traffic has been analyzed.";

  const blob = new Blob([report], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "network-intrusion-report.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

function save() {
  const payload = {
    enabledRules: state.enabledRules,
    lastResult: state.lastResult,
    history: state.history,
    sensor: $("sensorProfile")?.value || "edge",
    mode: $("detectionMode")?.value || "balanced",
    subnet: $("protectedSubnet")?.value || "10.0.0.0/8",
    trustedDns: $("trustedDns")?.value || "",
    watchlist: $("watchlistInput")?.value || "",
    traffic: $("trafficInput")?.value || "",
    source: $("sourceBadge")?.textContent || "Manual traffic"
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const payload = JSON.parse(raw);
    state.enabledRules = { ...state.enabledRules, ...payload.enabledRules };
    state.lastResult = payload.lastResult || null;
    state.history = Array.isArray(payload.history) ? payload.history : [];
    $("sensorProfile").value = payload.sensor || "edge";
    $("detectionMode").value = payload.mode || "balanced";
    $("protectedSubnet").value = payload.subnet || "10.0.0.0/8";
    $("trustedDns").value = payload.trustedDns || "";
    $("watchlistInput").value = payload.watchlist || "";
    $("trafficInput").value = payload.traffic || "";
    $("sourceBadge").textContent = payload.source || "Manual traffic";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) || []), item]);
  });
  return map;
}

function parseList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function isPrivateIp(ip) {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function entropy(value) {
  const chars = [...String(value)];
  const counts = chars.reduce((acc, char) => ({ ...acc, [char]: (acc[char] || 0) + 1 }), {});
  return Object.values(counts).reduce((sum, count) => {
    const p = count / chars.length;
    return sum - p * Math.log2(p);
  }, 0);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

init();
