const sampleTransactions = `2026-05-01 Payroll +6500
2026-05-02 Rent -2200
2026-05-03 Grocery Market -184.21
2026-05-04 Credit card payment -450
2026-05-05 Coffee -18.45
2026-05-06 Internet -82
2026-05-07 Restaurant -96.30
2026-05-09 Gas -54.88
2026-05-10 Emergency fund transfer -600
2026-05-11 Pharmacy -42.19
2026-05-13 Streaming subscriptions -51
2026-05-16 Grocery Market -163.44
2026-05-18 Student loan -325
2026-05-20 Restaurant -118.70
2026-05-22 Utilities -216.33
2026-05-24 Brokerage transfer -350`;

const emptyPlan = {
  income: 6500,
  essentials: 3100,
  lifestyle: 1250,
  savings: 14500,
  debt: 8200,
  apr: 18.9,
  goal: 30000,
  horizon: 12,
  riskStyle: "steady",
  priority: "balanced",
  transactions: sampleTransactions
};

const fields = {
  income: document.querySelector("#income"),
  essentials: document.querySelector("#essentials"),
  lifestyle: document.querySelector("#lifestyle"),
  savings: document.querySelector("#savings"),
  debt: document.querySelector("#debt"),
  apr: document.querySelector("#apr"),
  goal: document.querySelector("#goal"),
  horizon: document.querySelector("#horizon"),
  riskStyle: document.querySelector("#riskStyle"),
  priority: document.querySelector("#priority"),
  transactions: document.querySelector("#transactions")
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

let lastAnalysis = null;

function readProfile() {
  return {
    income: numberValue(fields.income),
    essentials: numberValue(fields.essentials),
    lifestyle: numberValue(fields.lifestyle),
    savings: numberValue(fields.savings),
    debt: numberValue(fields.debt),
    apr: numberValue(fields.apr),
    goal: numberValue(fields.goal),
    horizon: Number(fields.horizon.value),
    riskStyle: fields.riskStyle.value,
    priority: fields.priority.value,
    transactions: fields.transactions.value.trim()
  };
}

function numberValue(input) {
  return Math.max(0, Number(input.value) || 0);
}

function writeProfile(profile) {
  Object.entries(profile).forEach(([key, value]) => {
    if (fields[key]) {
      fields[key].value = value;
    }
  });
}

function parseTransactions(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const amountMatch = line.match(/[-+]?\$?\d[\d,]*(?:\.\d{1,2})?$/);
      const amount = amountMatch ? Number(amountMatch[0].replace(/[$,]/g, "")) : 0;
      const withoutAmount = amountMatch ? line.slice(0, amountMatch.index).trim() : line;
      const dateMatch = withoutAmount.match(/^\d{4}-\d{2}-\d{2}/);
      const date = dateMatch ? dateMatch[0] : "";
      const description = date ? withoutAmount.slice(date.length).trim() : withoutAmount;
      return {
        date,
        description: description || "Unlabeled transaction",
        amount,
        category: categorize(description, amount)
      };
    });
}

function categorize(description, amount) {
  const value = description.toLowerCase();
  if (amount > 0) return "Income";
  if (/rent|mortgage|utility|utilities|internet|insurance|phone/.test(value)) return "Essentials";
  if (/grocery|market|pharmacy|medical|gas|fuel/.test(value)) return "Core living";
  if (/restaurant|coffee|streaming|subscription|travel|shop/.test(value)) return "Lifestyle";
  if (/loan|credit|debt|card/.test(value)) return "Debt";
  if (/saving|brokerage|invest|transfer|emergency/.test(value)) return "Saving";
  return "Other";
}

function analyzeProfile() {
  const profile = readProfile();
  const txns = parseTransactions(profile.transactions);
  const transactionSpending = txns
    .filter((txn) => txn.amount < 0)
    .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
  const surplus = profile.income - profile.essentials - profile.lifestyle;
  const minimumEmergency = profile.essentials * 3;
  const runway = profile.essentials > 0 ? profile.savings / profile.essentials : 0;
  const debtPressure = profile.income > 0 ? (profile.debt * (profile.apr / 100 / 12)) / profile.income : 0;
  const savingsGap = Math.max(0, profile.goal - profile.savings);
  const requiredMonthly = profile.horizon > 0 ? savingsGap / profile.horizon : 0;
  const healthScore = scorePlan({ profile, surplus, runway, debtPressure, requiredMonthly });
  const allocation = allocateMoney(profile, surplus, minimumEmergency);
  const insights = buildInsights({ profile, surplus, runway, debtPressure, requiredMonthly, allocation, transactionSpending });
  const forecast = buildForecast(profile, allocation.save + allocation.invest, allocation.debt);
  const categories = summarizeCategories(txns);

  lastAnalysis = {
    profile,
    txns,
    surplus,
    runway,
    healthScore,
    allocation,
    insights,
    forecast,
    categories,
    requiredMonthly
  };

  renderAnalysis(lastAnalysis);
}

function scorePlan({ profile, surplus, runway, debtPressure, requiredMonthly }) {
  let score = 50;
  score += Math.min(20, Math.max(-25, (surplus / Math.max(profile.income, 1)) * 100));
  score += Math.min(18, runway * 4);
  score -= Math.min(18, debtPressure * 180);
  if (requiredMonthly > surplus && profile.goal > profile.savings) score -= 12;
  if (profile.apr > 15 && profile.debt > 0) score -= 8;
  if (profile.priority === "debt" && profile.debt > 0) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function allocateMoney(profile, surplus, minimumEmergency) {
  const available = Math.max(0, surplus);
  const emergencyShortfall = Math.max(0, minimumEmergency - profile.savings);
  let save = 0;
  let debt = 0;
  let invest = 0;
  let flex = 0;

  if (available === 0) {
    return { save, debt, invest, flex };
  }

  if (profile.priority === "debt") {
    debt = available * 0.55;
    save = available * 0.25;
    invest = available * 0.1;
  } else if (profile.priority === "savings" || emergencyShortfall > 0) {
    save = available * 0.55;
    debt = available * 0.25;
    invest = available * 0.1;
  } else if (profile.priority === "goal") {
    save = available * 0.45;
    invest = available * 0.3;
    debt = available * 0.15;
  } else {
    save = available * 0.35;
    debt = available * 0.3;
    invest = available * 0.2;
  }

  if (profile.riskStyle === "defensive") {
    save += invest * 0.45;
    invest *= 0.55;
  }

  if (profile.riskStyle === "growth" && profile.debt === 0 && emergencyShortfall === 0) {
    invest += save * 0.3;
    save *= 0.7;
  }

  flex = Math.max(0, available - save - debt - invest);
  return {
    save: Math.round(save),
    debt: Math.round(debt),
    invest: Math.round(invest),
    flex: Math.round(flex)
  };
}

function buildInsights(data) {
  const { profile, surplus, runway, debtPressure, requiredMonthly, allocation, transactionSpending } = data;
  const insights = [];

  if (surplus < 0) {
    insights.push({
      title: "Cash flow is negative",
      detail: `Reduce monthly spending by ${money.format(Math.abs(surplus))} or add income before assigning money to goals.`,
      impact: "High priority",
      tone: "risk"
    });
  } else {
    insights.push({
      title: "Positive monthly margin",
      detail: `${money.format(surplus)} is available after essentials and lifestyle spending. The plan assigns it across savings, debt, investing, and flexibility.`,
      impact: "Good signal",
      tone: "good"
    });
  }

  if (runway < 3) {
    insights.push({
      title: "Emergency fund needs attention",
      detail: `Current savings cover ${runway.toFixed(1)} months of essentials. Build toward 3 months before taking extra risk.`,
      impact: "Stability",
      tone: "warn"
    });
  }

  if (profile.debt > 0 && profile.apr >= 12) {
    insights.push({
      title: "High-interest debt drag",
      detail: `At ${profile.apr.toFixed(1)}% APR, extra payments of ${money.format(allocation.debt)} per month can lower interest pressure.`,
      impact: "Interest savings",
      tone: "risk"
    });
  }

  if (requiredMonthly > 0) {
    const tone = requiredMonthly <= surplus ? "good" : "warn";
    insights.push({
      title: "Goal pace check",
      detail: `Reaching ${money.format(profile.goal)} in ${profile.horizon} months needs about ${money.format(requiredMonthly)} per month.`,
      impact: tone === "good" ? "On pace" : "Needs adjustment",
      tone
    });
  }

  if (transactionSpending > profile.essentials + profile.lifestyle) {
    insights.push({
      title: "Transactions exceed planned spend",
      detail: `Recent outflows total ${money.format(transactionSpending)}, above the planned monthly spend baseline.`,
      impact: "Review",
      tone: "warn"
    });
  }

  if (debtPressure < 0.02 && runway >= 3 && surplus > 0) {
    insights.push({
      title: "Room for long-term compounding",
      detail: `With debt pressure controlled and runway above 3 months, ${money.format(allocation.invest)} can go toward long-term investing.`,
      impact: "Opportunity",
      tone: "good"
    });
  }

  return insights;
}

function buildForecast(profile, monthlyGrowth, debtPayment) {
  const months = profile.horizon;
  let balance = profile.savings;
  let debt = profile.debt;
  const points = [];
  const monthlyRate = profile.riskStyle === "growth" ? 0.0045 : profile.riskStyle === "defensive" ? 0.0015 : 0.0028;
  const debtRate = profile.apr / 100 / 12;

  for (let month = 0; month <= months; month += 1) {
    points.push({
      month,
      savings: Math.round(balance),
      debt: Math.round(debt)
    });
    balance = balance * (1 + monthlyRate) + monthlyGrowth;
    debt = Math.max(0, debt * (1 + debtRate) - debtPayment);
  }

  return points;
}

function summarizeCategories(txns) {
  const grouped = new Map();
  txns.forEach((txn) => {
    if (!grouped.has(txn.category)) {
      grouped.set(txn.category, { count: 0, total: 0 });
    }
    const item = grouped.get(txn.category);
    item.count += 1;
    item.total += txn.amount;
  });
  return Array.from(grouped, ([category, value]) => ({
    category,
    count: value.count,
    total: value.total
  })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function renderAnalysis(analysis) {
  const { profile, surplus, runway, healthScore, allocation, insights, forecast, categories, txns, requiredMonthly } = analysis;
  document.querySelector("#monthlySurplus").textContent = money.format(surplus);
  document.querySelector("#runwayMonths").textContent = runway.toFixed(1);
  document.querySelector("#planScore").textContent = healthScore;
  document.querySelector("#healthScore").textContent = healthScore;
  document.querySelector("#scoreFill").style.width = `${healthScore}%`;
  document.querySelector("#profileBadge").textContent = `${profile.horizon}-month plan`;
  document.querySelector("#forecastBadge").textContent = `${profile.horizon} months`;
  document.querySelector("#transactionCount").textContent = `${txns.length} rows`;

  const badge = document.querySelector("#healthBadge");
  badge.className = "verdict";
  if (healthScore >= 78) {
    badge.classList.add("strong");
    badge.textContent = "Strong";
  } else if (healthScore >= 60) {
    badge.classList.add("watch");
    badge.textContent = "Watch";
  } else if (healthScore >= 40) {
    badge.classList.add("tight");
    badge.textContent = "Tight";
  } else {
    badge.classList.add("risk");
    badge.textContent = "At risk";
  }

  const nextAction = insights[0]?.title || "Keep monitoring cash flow";
  document.querySelector("#briefBox").textContent =
    `${nextAction}. Surplus is ${money.format(surplus)}, emergency runway is ${runway.toFixed(1)} months, and the goal pace requires ${money.format(requiredMonthly)} per month.`;

  renderAllocation(allocation);
  renderInsights(insights);
  renderCategories(categories);
  drawForecast(forecast, profile.goal);
}

function renderAllocation(allocation) {
  const rows = [
    ["Emergency savings", "Build liquidity and protect against income shocks.", allocation.save, "good"],
    ["Debt payoff", "Apply extra principal to the most expensive balance first.", allocation.debt, "risk"],
    ["Long-term investing", "Keep this aligned with your risk style and time horizon.", allocation.invest, "good"],
    ["Flexible buffer", "Leave room for irregular bills and small surprises.", allocation.flex, "warn"]
  ];
  const list = document.querySelector("#allocationList");
  const template = document.querySelector("#allocationTemplate");
  list.innerHTML = "";
  rows.forEach(([title, detail, amount, tone]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.tone = tone;
    node.querySelector("strong").textContent = title;
    node.querySelector("span").textContent = detail;
    node.querySelector("small").textContent = money.format(amount);
    list.appendChild(node);
  });
  const total = Object.values(allocation).reduce((sum, value) => sum + value, 0);
  document.querySelector("#allocationTotal").textContent = `${money.format(total)} assigned`;
}

function renderInsights(insights) {
  const stack = document.querySelector("#insightStack");
  const template = document.querySelector("#insightTemplate");
  stack.innerHTML = "";
  insights.forEach((insight) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.tone = insight.tone;
    node.querySelector("strong").textContent = insight.title;
    node.querySelector("span").textContent = insight.detail;
    node.querySelector("small").textContent = insight.impact;
    stack.appendChild(node);
  });
  document.querySelector("#insightCount").textContent = `${insights.length} insights`;
}

function renderCategories(categories) {
  const list = document.querySelector("#categoryList");
  list.innerHTML = "";
  if (!categories.length) {
    list.innerHTML = '<div class="empty-state">Transaction categories will appear here.</div>';
    return;
  }
  categories.forEach((item) => {
    const node = document.createElement("article");
    const tone = item.total > 0 ? "good" : Math.abs(item.total) > 800 ? "warn" : "";
    node.className = "category-card";
    if (tone) node.dataset.tone = tone;
    node.innerHTML = `
      <div>
        <strong>${item.category}</strong>
        <span>${item.count} transaction${item.count === 1 ? "" : "s"}</span>
      </div>
      <small>${preciseMoney.format(item.total)}</small>
    `;
    list.appendChild(node);
  });
}

function drawForecast(points, goal) {
  const canvas = document.querySelector("#forecastCanvas");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * scale);
  canvas.height = Math.max(280, rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const width = rect.width;
  const height = Math.max(280, rect.height);
  const pad = 34;
  const values = points.flatMap((point) => [point.savings, point.debt, goal]);
  const max = Math.max(...values, 1000);
  const x = (index) => pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - (value / max) * (height - pad * 2);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f7f9f5";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d9e2d5";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const lineY = pad + i * ((height - pad * 2) / 4);
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(width - pad, lineY);
    ctx.stroke();
  }

  drawLine(ctx, points.map((point, index) => [x(index), y(point.savings)]), "#1f6b4f", 3);
  drawLine(ctx, points.map((point, index) => [x(index), y(point.debt)]), "#ad3947", 3);

  ctx.setLineDash([6, 5]);
  drawLine(ctx, [[pad, y(goal)], [width - pad, y(goal)]], "#a56c16", 2);
  ctx.setLineDash([]);

  ctx.fillStyle = "#18201b";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillText("Savings", pad, 18);
  ctx.fillStyle = "#ad3947";
  ctx.fillText("Debt", pad + 72, 18);
  ctx.fillStyle = "#a56c16";
  ctx.fillText("Goal", pad + 120, 18);
}

function drawLine(ctx, points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawSpark() {
  const canvas = document.querySelector("#sparkCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const points = [188, 170, 176, 138, 144, 118, 124, 94, 106, 78, 86, 58, 68, 40];
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#edf3ec";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 7; i += 1) {
    ctx.strokeStyle = "rgba(40, 111, 145, 0.12)";
    ctx.beginPath();
    ctx.moveTo(28 + i * 50, 22);
    ctx.lineTo(28 + i * 50, height - 22);
    ctx.stroke();
  }

  ctx.strokeStyle = "#1f6b4f";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((value, index) => {
    const x = 28 + index * ((width - 56) / (points.length - 1));
    const y = value;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#a56c16";
  ctx.beginPath();
  ctx.arc(width - 28, points[points.length - 1], 10, 0, Math.PI * 2);
  ctx.fill();
}

function addScenario() {
  const profile = readProfile();
  const cut = Math.round(profile.lifestyle * 0.12);
  fields.lifestyle.value = Math.max(0, profile.lifestyle - cut);
  fields.transactions.value = `${profile.transactions}\n2026-05-25 Scenario: lifestyle trim +${cut}`;
  analyzeProfile();
}

function exportPlan() {
  if (!lastAnalysis) {
    analyzeProfile();
  }
  const { profile, surplus, runway, healthScore, allocation, insights, categories } = lastAnalysis;
  const lines = [
    "# AI Financial Copilot Plan",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "## Snapshot",
    "",
    `- Monthly income: ${money.format(profile.income)}`,
    `- Monthly surplus: ${money.format(surplus)}`,
    `- Emergency runway: ${runway.toFixed(1)} months`,
    `- Financial health score: ${healthScore}/100`,
    "",
    "## Recommended Monthly Allocation",
    "",
    `- Emergency savings: ${money.format(allocation.save)}`,
    `- Debt payoff: ${money.format(allocation.debt)}`,
    `- Long-term investing: ${money.format(allocation.invest)}`,
    `- Flexible buffer: ${money.format(allocation.flex)}`,
    "",
    "## Copilot Insights",
    "",
    ...insights.map((insight) => `- ${insight.title}: ${insight.detail}`),
    "",
    "## Transaction Categories",
    "",
    ...categories.map((item) => `- ${item.category}: ${preciseMoney.format(item.total)} across ${item.count} transaction(s)`),
    "",
    "Educational planning output only. Review decisions with a qualified financial professional when needed."
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "financial-copilot-plan.md";
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#analyzePlan").addEventListener("click", analyzeProfile);
document.querySelector("#loadSample").addEventListener("click", () => {
  writeProfile(emptyPlan);
  analyzeProfile();
});
document.querySelector("#resetPlan").addEventListener("click", () => {
  writeProfile({ ...emptyPlan, transactions: "" });
  lastAnalysis = null;
  document.querySelector("#insightStack").innerHTML = '<div class="empty-state">Recommendations will appear here.</div>';
  document.querySelector("#categoryList").innerHTML = "";
  document.querySelector("#briefBox").textContent = "Run the copilot to see budget pressure, next best action, and a monthly allocation plan.";
  document.querySelector("#monthlySurplus").textContent = "$0";
  document.querySelector("#runwayMonths").textContent = "0.0";
  document.querySelector("#planScore").textContent = "0";
  document.querySelector("#healthScore").textContent = "0";
  document.querySelector("#scoreFill").style.width = "0";
  drawForecast([{ month: 0, savings: 0, debt: 0 }], 0);
});
document.querySelector("#clearTransactions").addEventListener("click", () => {
  fields.transactions.value = "";
  analyzeProfile();
});
document.querySelector("#addScenario").addEventListener("click", addScenario);
document.querySelector("#exportPlan").addEventListener("click", exportPlan);
window.addEventListener("resize", () => {
  if (lastAnalysis) drawForecast(lastAnalysis.forecast, lastAnalysis.profile.goal);
});

writeProfile(emptyPlan);
drawSpark();
analyzeProfile();
