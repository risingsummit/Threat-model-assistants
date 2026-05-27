(function initThreatEngine(root) {
  const STRIDE = {
    spoofing: "Spoofing",
    tampering: "Tampering",
    repudiation: "Repudiation",
    informationDisclosure: "Information disclosure",
    denialOfService: "Denial of service",
    elevationOfPrivilege: "Elevation of privilege"
  };

  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
  const statusRank = { open: 0, planned: 1, "in-progress": 2, done: 3 };

  function normalizeList(value) {
    if (Array.isArray(value)) {
      return value.map(String).map((item) => item.trim()).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function hasControl(subject, expected) {
    const controls = normalizeList(subject.controls).map((control) => control.toLowerCase());
    return expected.some((item) => controls.some((control) => control.includes(item)));
  }

  function scoreFinding(finding) {
    const severity = severityRank[finding.severity] || 1;
    const likelihood = finding.likelihood || 1;
    const exposureBonus = finding.exposed ? 2 : 0;
    return severity * 8 + likelihood * 5 + exposureBonus;
  }

  function riskLabel(score) {
    if (score >= 80) return "Critical";
    if (score >= 55) return "High";
    if (score >= 30) return "Medium";
    if (score > 0) return "Low";
    return "Ready";
  }

  function buildFinding({ id, category, title, description, severity, likelihood, target, evidence, mitigation, exposed }) {
    return {
      id,
      category,
      title,
      description,
      severity,
      likelihood,
      target,
      evidence,
      mitigation,
      exposed: Boolean(exposed),
      score: scoreFinding({ severity, likelihood, exposed })
    };
  }

  function analyzeProject(project) {
    const assets = Array.isArray(project.assets) ? project.assets : [];
    const flows = Array.isArray(project.flows) ? project.flows : [];
    const mitigations = Array.isArray(project.mitigations) ? project.mitigations : [];
    const findings = [];
    const internetFacing = project.deployment === "internet-facing";
    const sensitive = ["confidential", "regulated"].includes(project.dataSensitivity);

    flows.forEach((flow, index) => {
      const flowId = flow.id || `flow-${index + 1}`;
      const boundary = Boolean(flow.trustBoundary);
      const flowSensitive = ["confidential", "regulated"].includes(flow.dataClass);

      if (boundary && !hasControl(flow, ["mfa", "token", "oauth", "mutual tls", "certificate"])) {
        findings.push(buildFinding({
          id: `${flowId}-spoofing`,
          category: STRIDE.spoofing,
          title: "Identity can be spoofed across a trust boundary",
          description: "This flow crosses a trust boundary without a strong identity control listed.",
          severity: internetFacing ? "high" : "medium",
          likelihood: internetFacing ? 4 : 3,
          target: flow.name,
          evidence: `${flow.source} to ${flow.destination}`,
          mitigation: "Require phishing-resistant MFA, signed tokens, mutual TLS, or workload identity for this path.",
          exposed: internetFacing
        }));
      }

      if (!hasControl(flow, ["tls", "signature", "integrity", "checksum", "hmac"])) {
        findings.push(buildFinding({
          id: `${flowId}-tampering`,
          category: STRIDE.tampering,
          title: "Flow lacks an explicit integrity control",
          description: "Data in transit or messages on this path could be modified without detection.",
          severity: boundary ? "high" : "medium",
          likelihood: boundary ? 3 : 2,
          target: flow.name,
          evidence: `${flow.protocol || "Unknown protocol"} with controls: ${normalizeList(flow.controls).join(", ") || "none"}`,
          mitigation: "Use TLS, request signing, schema validation, and server-side integrity checks.",
          exposed: boundary
        }));
      }

      if (flowSensitive && !hasControl(flow, ["encryption", "tls", "tokenization", "masking"])) {
        findings.push(buildFinding({
          id: `${flowId}-disclosure`,
          category: STRIDE.informationDisclosure,
          title: "Sensitive data may be exposed",
          description: "Sensitive data is handled without a clearly documented confidentiality control.",
          severity: project.dataSensitivity === "regulated" ? "critical" : "high",
          likelihood: boundary ? 4 : 3,
          target: flow.name,
          evidence: `${flow.dataClass} data from ${flow.source} to ${flow.destination}`,
          mitigation: "Encrypt data in transit and at rest, minimize payloads, and mask secrets in logs.",
          exposed: boundary
        }));
      }

      if (boundary && !hasControl(flow, ["rate limit", "quota", "waf", "circuit breaker", "throttle"])) {
        findings.push(buildFinding({
          id: `${flowId}-dos`,
          category: STRIDE.denialOfService,
          title: "Boundary flow needs abuse throttling",
          description: "Internet or cross-zone traffic can be abused to exhaust application resources.",
          severity: "medium",
          likelihood: internetFacing ? 4 : 2,
          target: flow.name,
          evidence: `${flow.source} can reach ${flow.destination}`,
          mitigation: "Add rate limits, quotas, request size limits, WAF rules, and graceful degradation.",
          exposed: internetFacing
        }));
      }
    });

    assets.forEach((asset, index) => {
      const assetId = asset.id || `asset-${index + 1}`;
      const critical = ["high", "critical"].includes(asset.criticality);

      if (critical && !hasControl(asset, ["authorization", "rbac", "abac", "least privilege"])) {
        findings.push(buildFinding({
          id: `${assetId}-privilege`,
          category: STRIDE.elevationOfPrivilege,
          title: "Critical asset needs explicit authorization controls",
          description: "Critical assets should document how access is constrained and reviewed.",
          severity: asset.criticality === "critical" ? "critical" : "high",
          likelihood: 3,
          target: asset.name,
          evidence: `${asset.type} asset marked ${asset.criticality}`,
          mitigation: "Add object-level authorization, least-privilege roles, and access review evidence.",
          exposed: internetFacing
        }));
      }

      if (!hasControl(asset, ["log", "audit", "monitor", "alert"])) {
        findings.push(buildFinding({
          id: `${assetId}-repudiation`,
          category: STRIDE.repudiation,
          title: "Actions may not be attributable",
          description: "The asset does not list audit or monitoring controls for user or service actions.",
          severity: critical ? "medium" : "low",
          likelihood: 2,
          target: asset.name,
          evidence: `Controls: ${normalizeList(asset.controls).join(", ") || "none"}`,
          mitigation: "Log security-relevant actions with actor, target, result, timestamp, and correlation ID.",
          exposed: false
        }));
      }
    });

    if (sensitive && project.authModel === "password-only") {
      findings.push(buildFinding({
        id: "profile-auth-mfa",
        category: STRIDE.spoofing,
        title: "Sensitive product uses password-only authentication",
        description: "Sensitive or regulated products should require stronger account protection.",
        severity: "high",
        likelihood: 4,
        target: project.name,
        evidence: `Authentication model: ${project.authModel}`,
        mitigation: "Require MFA and add risk-based session controls.",
        exposed: internetFacing
      }));
    }

    const totalRaw = findings.reduce((sum, finding) => sum + finding.score, 0);
    const mitigationCredit = mitigations.reduce((sum, mitigation) => {
      return sum + (statusRank[mitigation.status] || 0) * 2;
    }, 0);
    const score = Math.max(0, Math.min(100, Math.round(totalRaw / Math.max(1, findings.length) + findings.length * 4 - mitigationCredit)));

    return {
      score,
      label: riskLabel(score),
      findings: findings.sort((a, b) => b.score - a.score),
      counts: findings.reduce((acc, finding) => {
        acc[finding.category] = (acc[finding.category] || 0) + 1;
        return acc;
      }, {}),
      summary: summarize(project, findings, score)
    };
  }

  function summarize(project, findings, score) {
    if (!findings.length) {
      return `${project.name || "This project"} has no open findings from the built-in STRIDE rules. Keep validating assumptions as architecture changes.`;
    }
    const top = findings[0];
    return `${project.name || "This project"} has a ${riskLabel(score).toLowerCase()} residual risk profile. The top concern is ${top.category.toLowerCase()}: ${top.title.toLowerCase()}.`;
  }

  function toMarkdown(project, analysis) {
    const lines = [
      `# Threat Model: ${project.name || "Untitled project"}`,
      "",
      project.summary || "No summary provided.",
      "",
      "## Profile",
      "",
      `- Deployment: ${project.deployment || "unknown"}`,
      `- Authentication: ${project.authModel || "unknown"}`,
      `- Data sensitivity: ${project.dataSensitivity || "unknown"}`,
      `- Risk score: ${analysis.score} (${analysis.label})`,
      "",
      "## Findings",
      ""
    ];

    if (!analysis.findings.length) {
      lines.push("No findings generated by the current rule set.", "");
    } else {
      analysis.findings.forEach((finding, index) => {
        lines.push(`${index + 1}. **${finding.category}: ${finding.title}**`);
        lines.push(`   - Target: ${finding.target}`);
        lines.push(`   - Severity: ${finding.severity}`);
        lines.push(`   - Evidence: ${finding.evidence}`);
        lines.push(`   - Mitigation: ${finding.mitigation}`);
      });
      lines.push("");
    }

    lines.push("## Mitigation Tracker", "");
    const mitigations = Array.isArray(project.mitigations) ? project.mitigations : [];
    if (!mitigations.length) {
      lines.push("- No mitigations recorded yet.");
    } else {
      mitigations.forEach((item) => {
        lines.push(`- [${item.status === "done" ? "x" : " "}] ${item.title} (${item.owner || "unassigned"}, ${item.status || "open"})`);
      });
    }

    return lines.join("\n");
  }

  root.ThreatEngine = { analyzeProject, toMarkdown, normalizeList, hasControl };
})(typeof window !== "undefined" ? window : globalThis);
