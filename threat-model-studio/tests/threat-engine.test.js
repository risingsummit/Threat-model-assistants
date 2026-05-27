const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const engineSource = fs.readFileSync(path.join(root, "src", "threat-engine.js"), "utf8");
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(engineSource, context);

const ThreatEngine = context.globalThis.ThreatEngine;
const sample = JSON.parse(fs.readFileSync(path.join(root, "data", "sample-project.json"), "utf8"));

const analysis = ThreatEngine.analyzeProject(sample);
assert.ok(analysis.score > 0, "sample project should produce a non-zero score");
assert.ok(analysis.findings.length >= 3, "sample project should produce several findings");
assert.ok(analysis.findings.some((finding) => finding.category === "Elevation of privilege"), "critical assets should produce authorization findings");

const markdown = ThreatEngine.toMarkdown(sample, analysis);
assert.match(markdown, /Threat Model: AtlasDocs/);
assert.match(markdown, /Mitigation Tracker/);

const hardened = structuredClone(sample);
hardened.assets = hardened.assets.map((asset) => ({
  ...asset,
  controls: [...asset.controls, "RBAC", "Audit logging"]
}));
hardened.flows = hardened.flows.map((flow) => ({
  ...flow,
  controls: [...flow.controls, "Request signing", "Rate limit"]
}));
hardened.mitigations = hardened.mitigations.map((item) => ({ ...item, status: "done" }));

const hardenedAnalysis = ThreatEngine.analyzeProject(hardened);
assert.ok(hardenedAnalysis.score < analysis.score, "adding controls should lower risk score");

console.log("Threat engine tests passed.");
