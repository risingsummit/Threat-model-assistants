const sampleProject = {
  name: "AtlasDocs Collaboration Platform",
  summary: "A SaaS document-sharing platform for small legal and finance teams.",
  deployment: "internet-facing",
  authModel: "password-mfa",
  dataSensitivity: "regulated",
  assets: [
    { id: "asset-1", name: "User accounts", type: "identity", criticality: "high", controls: ["MFA", "Password policy", "Session timeout"] },
    { id: "asset-2", name: "Document storage", type: "data", criticality: "critical", controls: ["Encryption at rest", "Backups"] },
    { id: "asset-3", name: "Audit log pipeline", type: "logging", criticality: "medium", controls: ["Centralized logging"] }
  ],
  flows: [
    { id: "flow-1", name: "Browser uploads document", source: "Customer browser", destination: "Public API", protocol: "HTTPS", trustBoundary: true, dataClass: "regulated", controls: ["TLS", "MFA"] },
    { id: "flow-2", name: "API stores document", source: "Public API", destination: "Document storage", protocol: "SQL/SDK", trustBoundary: false, dataClass: "regulated", controls: ["Encryption at rest"] },
    { id: "flow-3", name: "API writes audit event", source: "Public API", destination: "Audit log pipeline", protocol: "HTTPS", trustBoundary: false, dataClass: "internal", controls: ["Centralized logging"] }
  ],
  mitigations: [
    { id: "mit-1", title: "Add object-level authorization tests", owner: "AppSec", status: "planned" },
    { id: "mit-2", title: "Enable immutable audit log retention", owner: "Platform", status: "in-progress" }
  ]
};

let project = structuredClone(sampleProject);

const els = {
  projectName: document.querySelector("#projectName"),
  projectSummary: document.querySelector("#projectSummary"),
  deployment: document.querySelector("#deployment"),
  authModel: document.querySelector("#authModel"),
  dataSensitivity: document.querySelector("#dataSensitivity"),
  riskBadge: document.querySelector("#riskBadge"),
  riskScore: document.querySelector("#riskScore"),
  riskSummary: document.querySelector("#riskSummary"),
  scoreRing: document.querySelector(".score-ring"),
  flowCount: document.querySelector("#flowCount"),
  flowMap: document.querySelector("#flowMap"),
  assetList: document.querySelector("#assetList"),
  flowList: document.querySelector("#flowList"),
  findingList: document.querySelector("#findingList"),
  findingCount: document.querySelector("#findingCount"),
  mitigationList: document.querySelector("#mitigationList"),
  exportDialog: document.querySelector("#exportDialog"),
  markdownOutput: document.querySelector("#markdownOutput")
};

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function syncProjectFromProfile() {
  project.name = els.projectName.value.trim();
  project.summary = els.projectSummary.value.trim();
  project.deployment = els.deployment.value;
  project.authModel = els.authModel.value;
  project.dataSensitivity = els.dataSensitivity.value;
}

function syncProfileToForm() {
  els.projectName.value = project.name || "";
  els.projectSummary.value = project.summary || "";
  els.deployment.value = project.deployment || "internet-facing";
  els.authModel.value = project.authModel || "password-mfa";
  els.dataSensitivity.value = project.dataSensitivity || "internal";
}

function makeField(labelText, value, onInput, type = "text") {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.value = value || "";
  input.addEventListener("input", () => {
    onInput(input.value);
    render();
  });
  label.append(input);
  return label;
}

function makeSelect(labelText, value, options, onInput) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  options.forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.append(option);
  });
  select.value = value;
  select.addEventListener("change", () => {
    onInput(select.value);
    render();
  });
  label.append(select);
  return label;
}

function renderAssets() {
  els.assetList.replaceChildren();
  if (!project.assets.length) {
    els.assetList.append(emptyState("No assets yet. Add the systems, stores, identities, and logs your product depends on."));
    return;
  }

  project.assets.forEach((asset) => {
    const card = document.createElement("article");
    card.className = "item-card";
    const grid = document.createElement("div");
    grid.className = "item-grid";
    grid.append(
      makeField("Name", asset.name, (value) => { asset.name = value; }),
      makeSelect("Type", asset.type, [["identity", "Identity"], ["data", "Data"], ["service", "Service"], ["logging", "Logging"], ["infrastructure", "Infrastructure"]], (value) => { asset.type = value; }),
      makeSelect("Criticality", asset.criticality, [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]], (value) => { asset.criticality = value; }),
      makeField("Controls", ThreatEngine.normalizeList(asset.controls).join(", "), (value) => { asset.controls = ThreatEngine.normalizeList(value); })
    );
    card.append(grid, removeAction("Remove asset", () => {
      project.assets = project.assets.filter((item) => item.id !== asset.id);
      render();
    }));
    els.assetList.append(card);
  });
}

function renderFlows() {
  els.flowList.replaceChildren();
  if (!project.flows.length) {
    els.flowList.append(emptyState("No data flows yet. Add how users, services, and data stores communicate."));
    return;
  }

  project.flows.forEach((flow) => {
    const card = document.createElement("article");
    card.className = "item-card";
    const grid = document.createElement("div");
    grid.className = "item-grid";
    grid.append(
      makeField("Name", flow.name, (value) => { flow.name = value; }),
      makeField("Source", flow.source, (value) => { flow.source = value; }),
      makeField("Destination", flow.destination, (value) => { flow.destination = value; }),
      makeField("Protocol", flow.protocol, (value) => { flow.protocol = value; }),
      makeSelect("Data class", flow.dataClass, [["public", "Public"], ["internal", "Internal"], ["confidential", "Confidential"], ["regulated", "Regulated"]], (value) => { flow.dataClass = value; }),
      makeSelect("Trust boundary", String(Boolean(flow.trustBoundary)), [["true", "Crosses boundary"], ["false", "Same boundary"]], (value) => { flow.trustBoundary = value === "true"; }),
      makeField("Controls", ThreatEngine.normalizeList(flow.controls).join(", "), (value) => { flow.controls = ThreatEngine.normalizeList(value); })
    );
    card.append(grid, removeAction("Remove flow", () => {
      project.flows = project.flows.filter((item) => item.id !== flow.id);
      render();
    }));
    els.flowList.append(card);
  });
}

function renderMitigations() {
  els.mitigationList.replaceChildren();
  if (!project.mitigations.length) {
    els.mitigationList.append(emptyState("No mitigation tasks yet. Add the security work you want tracked."));
    return;
  }

  project.mitigations.forEach((mitigation) => {
    const card = document.createElement("article");
    card.className = "item-card";
    const grid = document.createElement("div");
    grid.className = "item-grid";
    grid.append(
      makeField("Title", mitigation.title, (value) => { mitigation.title = value; }),
      makeField("Owner", mitigation.owner, (value) => { mitigation.owner = value; }),
      makeSelect("Status", mitigation.status, [["open", "Open"], ["planned", "Planned"], ["in-progress", "In progress"], ["done", "Done"]], (value) => { mitigation.status = value; })
    );
    card.append(grid, removeAction("Remove task", () => {
      project.mitigations = project.mitigations.filter((item) => item.id !== mitigation.id);
      render();
    }));
    els.mitigationList.append(card);
  });
}

function renderFindings(analysis) {
  els.findingList.replaceChildren();
  els.findingCount.textContent = `${analysis.findings.length} findings`;
  if (!analysis.findings.length) {
    els.findingList.append(emptyState("No findings from the current rule set."));
    return;
  }

  analysis.findings.forEach((finding) => {
    const card = document.createElement("article");
    card.className = "finding-card";
    const title = document.createElement("strong");
    title.textContent = finding.title;
    const desc = document.createElement("p");
    desc.textContent = finding.description;
    const meta = document.createElement("div");
    meta.className = "finding-meta";
    [finding.category, finding.severity, finding.target].forEach((item) => {
      const badge = document.createElement("span");
      badge.className = `badge ${String(item).toLowerCase()}`;
      badge.textContent = item;
      meta.append(badge);
    });
    const mitigation = document.createElement("p");
    mitigation.textContent = finding.mitigation;
    card.append(title, desc, mitigation, meta);
    els.findingList.append(card);
  });
}

function renderFlowMap() {
  els.flowMap.replaceChildren();
  els.flowCount.textContent = `${project.flows.length} flows`;
  if (project.flows.some((flow) => flow.trustBoundary)) {
    const boundary = document.createElement("div");
    boundary.className = "boundary";
    els.flowMap.append(boundary);
  }

  const names = [...new Set(project.flows.flatMap((flow) => [flow.source, flow.destination]).filter(Boolean))];
  const positions = new Map();
  names.forEach((name, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    positions.set(name, { x: 42 + col * 210, y: 42 + row * 92 });
  });

  project.flows.forEach((flow) => {
    const start = positions.get(flow.source);
    const end = positions.get(flow.destination);
    if (!start || !end) return;
    const x1 = start.x + 122;
    const y1 = start.y + 29;
    const x2 = end.x;
    const y2 = end.y + 29;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const line = document.createElement("span");
    line.className = "flow-line";
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.width = `${Math.max(30, length - 8)}px`;
    line.style.transform = `rotate(${angle}deg)`;
    els.flowMap.append(line);
  });

  positions.forEach((pos, name) => {
    const node = document.createElement("div");
    node.className = "node";
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.textContent = name;
    els.flowMap.append(node);
  });
}

function removeAction(label, onClick) {
  const row = document.createElement("div");
  row.className = "item-actions";
  const button = document.createElement("button");
  button.className = "remove-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  row.append(button);
  return row;
}

function emptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  return empty;
}

function render() {
  syncProjectFromProfile();
  const analysis = ThreatEngine.analyzeProject(project);
  const labelClass = analysis.label.toLowerCase();
  els.riskBadge.className = `badge ${labelClass}`;
  els.riskBadge.textContent = analysis.label;
  els.riskScore.textContent = analysis.score;
  els.riskSummary.textContent = analysis.summary;
  els.scoreRing.style.setProperty("--risk-angle", `${analysis.score * 3.6}deg`);
  els.scoreRing.style.setProperty("--needle-angle", `${analysis.score * 1.8 - 90}deg`);
  renderFlowMap();
  renderAssets();
  renderFlows();
  renderFindings(analysis);
  renderMitigations();
}

document.querySelectorAll("#projectName, #projectSummary, #deployment, #authModel, #dataSensitivity")
  .forEach((input) => input.addEventListener("input", render));

document.querySelector("#addAsset").addEventListener("click", () => {
  project.assets.push({ id: uid("asset"), name: "New asset", type: "service", criticality: "medium", controls: [] });
  render();
});

document.querySelector("#addFlow").addEventListener("click", () => {
  project.flows.push({ id: uid("flow"), name: "New data flow", source: "Source", destination: "Destination", protocol: "HTTPS", trustBoundary: true, dataClass: "internal", controls: ["TLS"] });
  render();
});

document.querySelector("#addMitigation").addEventListener("click", () => {
  project.mitigations.push({ id: uid("mit"), title: "New mitigation", owner: "Security", status: "planned" });
  render();
});

document.querySelector("#loadSample").addEventListener("click", () => {
  project = structuredClone(sampleProject);
  syncProfileToForm();
  render();
});

document.querySelector("#exportMarkdown").addEventListener("click", () => {
  syncProjectFromProfile();
  const analysis = ThreatEngine.analyzeProject(project);
  els.markdownOutput.value = ThreatEngine.toMarkdown(project, analysis);
  els.exportDialog.showModal();
});

syncProfileToForm();
render();
