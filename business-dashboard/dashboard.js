const state = {
  rows: [],
  filtered: [],
};

const fields = {
  year: document.getElementById("yearFilter"),
  region: document.getElementById("regionFilter"),
  segment: document.getElementById("segmentFilter"),
  category: document.getElementById("categoryFilter"),
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-US");

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function groupBy(rows, key, reducer) {
  const groups = new Map();
  rows.forEach((row) => {
    const groupKey = typeof key === "function" ? key(row) : row[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  });
  return Array.from(groups, ([name, items]) => reducer(name, items));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key])).size;
}

function aggregate(name, rows) {
  const sales = sum(rows, "sales");
  const profit = sum(rows, "profit");
  return {
    name,
    sales,
    profit,
    quantity: sum(rows, "quantity"),
    orders: uniqueCount(rows, "order_id"),
    margin: sales ? profit / sales : 0,
    discount: rows.reduce((total, row) => total + Number(row.discount || 0), 0) / Math.max(rows.length, 1),
  };
}

function optionList(values) {
  return ["All", ...Array.from(new Set(values)).sort()];
}

function fillSelect(select, values) {
  select.innerHTML = optionList(values)
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");
}

function cleanRows(rows) {
  return rows.map((row) => ({
    ...row,
    sales: Number(row.sales),
    profit: Number(row.profit),
    quantity: Number(row.quantity),
    discount: Number(row.discount),
    margin: Number(row.margin),
    ship_days: Number(row.ship_days),
    year: String(row.year),
  }));
}

function applyFilters() {
  state.filtered = state.rows.filter((row) => {
    return (
      (fields.year.value === "All" || row.year === fields.year.value) &&
      (fields.region.value === "All" || row.region === fields.region.value) &&
      (fields.segment.value === "All" || row.segment === fields.segment.value) &&
      (fields.category.value === "All" || row.category === fields.category.value)
    );
  });
  render();
}

function setKpis(rows) {
  const sales = sum(rows, "sales");
  const profit = sum(rows, "profit");
  const orders = uniqueCount(rows, "order_id");
  const customers = uniqueCount(rows, "customer_id");
  const discount = rows.reduce((total, row) => total + row.discount, 0) / Math.max(rows.length, 1);

  document.getElementById("salesKpi").textContent = money.format(sales);
  document.getElementById("profitKpi").textContent = money.format(profit);
  document.getElementById("marginKpi").textContent = pct(sales ? profit / sales : 0);
  document.getElementById("ordersKpi").textContent = number.format(orders);
  document.getElementById("salesSpark").textContent = `${number.format(sum(rows, "quantity"))} units sold`;
  document.getElementById("profitSpark").textContent = `${profit < 0 ? "Loss" : "Profit"} across ${number.format(customers)} customers`;
  document.getElementById("discountSpark").textContent = `${pct(discount)} average discount`;
  document.getElementById("customersSpark").textContent = `${number.format(customers)} unique customers`;
}

function chartSize(container) {
  return {
    width: Math.max(container.clientWidth, 320),
    height: Math.max(container.clientHeight, 280),
  };
}

function scale(value, min, max, start, end) {
  if (max === min) return (start + end) / 2;
  return start + ((value - min) / (max - min)) * (end - start);
}

function renderTrend(rows) {
  const container = document.getElementById("trendChart");
  const { width, height } = chartSize(container);
  const pad = { top: 24, right: 28, bottom: 42, left: 72 };
  const months = groupBy(rows, "year_month", aggregate).sort((a, b) => a.name.localeCompare(b.name));
  const maxSales = Math.max(...months.map((d) => d.sales), 1);
  const maxProfit = Math.max(...months.map((d) => Math.abs(d.profit)), 1);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const barW = innerW / Math.max(months.length, 1);

  const bars = months
    .map((d, i) => {
      const x = pad.left + i * barW + barW * 0.18;
      const h = scale(d.sales, 0, maxSales, 0, innerH);
      return `<rect x="${x}" y="${pad.top + innerH - h}" width="${Math.max(barW * 0.56, 3)}" height="${h}" rx="3" fill="var(--soft-sales)" />`;
    })
    .join("");

  const points = months.map((d, i) => {
    const x = pad.left + i * barW + barW / 2;
    const y = scale(d.profit, -maxProfit, maxProfit, pad.top + innerH, pad.top);
    return `${x},${y}`;
  });

  const labels = months
    .filter((_, i) => i % Math.ceil(months.length / 8 || 1) === 0)
    .map((d) => {
      const i = months.indexOf(d);
      const x = pad.left + i * barW + barW / 2;
      return `<text class="axis-label" x="${x}" y="${height - 12}" text-anchor="middle">${d.name}</text>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" stroke="var(--line)" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerH}" stroke="var(--line)" />
      ${bars}
      <polyline points="${points.join(" ")}" fill="none" stroke="var(--profit)" stroke-width="3" vector-effect="non-scaling-stroke" />
      ${points.map((point) => `<circle cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="3.6" fill="var(--profit)" />`).join("")}
      <text class="axis-label" x="10" y="${pad.top + 12}">${money.format(maxSales)}</text>
      ${labels}
    </svg>`;
}

function renderHorizontalBars(containerId, rows, key, limit = 8) {
  const container = document.getElementById(containerId);
  const { width, height } = chartSize(container);
  const data = groupBy(rows, key, aggregate)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
  const pad = { top: 8, right: 24, bottom: 12, left: 108 };
  const valueW = 96;
  const rowH = (height - pad.top - pad.bottom) / Math.max(data.length, 1);
  const maxSales = Math.max(...data.map((d) => d.sales), 1);
  const maxBarW = Math.max(width - pad.left - pad.right - valueW, 12);

  const bars = data
    .map((d, i) => {
      const y = pad.top + i * rowH + rowH * 0.22;
      const w = scale(d.sales, 0, maxSales, 0, maxBarW);
      const fill = d.profit < 0 ? "var(--loss)" : "var(--sales)";
      return `
        <text class="chart-label" x="${pad.left - 10}" y="${y + rowH * 0.34}" text-anchor="end">${d.name}</text>
        <rect x="${pad.left}" y="${y}" width="${w}" height="${Math.max(rowH * 0.46, 12)}" rx="4" fill="${fill}" />
        <text class="chart-label" x="${width - pad.right}" y="${y + rowH * 0.34}" text-anchor="end">${money.format(d.sales)}</text>`;
    })
    .join("");

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>`;
}

function renderScatter(rows) {
  const container = document.getElementById("scatterChart");
  const { width, height } = chartSize(container);
  const data = groupBy(rows, "sub_category", aggregate);
  const pad = { top: 18, right: 24, bottom: 42, left: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxDiscount = Math.max(...data.map((d) => d.discount), 0.1);
  const profits = data.map((d) => d.profit);
  const minProfit = Math.min(...profits, 0);
  const maxProfit = Math.max(...profits, 1);

  const dots = data
    .map((d) => {
      const x = scale(d.discount, 0, maxDiscount, pad.left, pad.left + innerW);
      const y = scale(d.profit, minProfit, maxProfit, pad.top + innerH, pad.top);
      const r = scale(d.sales, 0, Math.max(...data.map((item) => item.sales), 1), 4, 13);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${d.profit < 0 ? "var(--loss)" : "var(--profit)"}" opacity="0.78"><title>${d.name}: ${money.format(d.profit)} profit, ${pct(d.discount)} discount</title></circle>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${pad.left + innerW}" y2="${pad.top + innerH}" stroke="var(--line)" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerH}" stroke="var(--line)" />
      ${dots}
      <text class="axis-label" x="${pad.left}" y="${height - 12}">0% discount</text>
      <text class="axis-label" x="${width - pad.right}" y="${height - 12}" text-anchor="end">${pct(maxDiscount)} discount</text>
      <text class="axis-label" x="8" y="${pad.top + 10}">${money.format(maxProfit)}</text>
    </svg>`;
}

function renderProducts(rows) {
  const products = groupBy(rows, "product_name", aggregate)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);
  const maxSales = Math.max(...products.map((d) => d.sales), 1);
  document.getElementById("topProducts").innerHTML = products
    .map(
      (product) => `
      <div class="rank-item">
        <div class="rank-row">
          <span class="rank-name" title="${product.name}">${product.name}</span>
          <span class="rank-value">${money.format(product.sales)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width: ${(product.sales / maxSales) * 100}%"></div></div>
      </div>`
    )
    .join("");
}

function renderStateTable(rows) {
  const states = groupBy(rows, "state", aggregate)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 12);
  document.getElementById("stateTable").innerHTML = states
    .map(
      (stateRow) => `
      <tr>
        <td>${stateRow.name}</td>
        <td>${money.format(stateRow.sales)}</td>
        <td class="${stateRow.profit < 0 ? "negative" : ""}">${money.format(stateRow.profit)}</td>
        <td class="${stateRow.margin < 0 ? "negative" : ""}">${pct(stateRow.margin)}</td>
        <td>${number.format(stateRow.orders)}</td>
      </tr>`
    )
    .join("");
}

function render() {
  const rows = state.filtered;
  setKpis(rows);
  renderTrend(rows);
  renderHorizontalBars("regionChart", rows, "region", 4);
  renderHorizontalBars("categoryChart", rows, "category", 3);
  renderScatter(rows);
  renderProducts(rows);
  renderStateTable(rows);
}

async function init() {
  let rows = window.SUPERSTORE_DATA;
  if (!rows) {
    const response = await fetch("data/superstore_clean.json");
    rows = await response.json();
  }
  state.rows = cleanRows(rows);
  fillSelect(fields.year, state.rows.map((row) => row.year));
  fillSelect(fields.region, state.rows.map((row) => row.region));
  fillSelect(fields.segment, state.rows.map((row) => row.segment));
  fillSelect(fields.category, state.rows.map((row) => row.category));

  Object.values(fields).forEach((select) => select.addEventListener("change", applyFilters));
  document.getElementById("resetFilters").addEventListener("click", () => {
    Object.values(fields).forEach((select) => {
      select.value = "All";
    });
    applyFilters();
  });
  window.addEventListener("resize", render);

  applyFilters();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="dashboard-shell"><h1>Dashboard data could not load</h1><p class="subtitle">${error.message}</p></main>`;
});
