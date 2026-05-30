# Interactive Business Dashboard

This dashboard uses a public Sample Superstore corporate sales dataset with order-line data for sales, profit, discount, quantity, customers, regions, and product categories.

## Files

- `data/superstore_raw.csv` is the downloaded raw dataset.
- `data/superstore_clean.csv` is the cleaned BI-ready dataset for Power BI or Tableau.
- `data/superstore_clean.json` powers the local interactive dashboard.
- `data/superstore_clean.js` lets the dashboard run by opening `index.html` directly.
- `clean_data.py` reproduces the cleaning process.
- `index.html`, `dashboard.css`, and `dashboard.js` build the interactive dashboard.

## Dashboard KPIs

- Total sales
- Total profit
- Profit margin
- Order count
- Units sold
- Average discount
- Customer count
- Regional, category, monthly, product, and state performance

## Power BI or Tableau Import

Import `data/superstore_clean.csv`, then use:

- Measures: `SUM(sales)`, `SUM(profit)`, `SUM(quantity)`, `COUNTD(order_id)`, `COUNTD(customer_id)`, `SUM(profit) / SUM(sales)`.
- Filters: `year`, `region`, `segment`, `category`.
- Recommended visuals: KPI cards, monthly sales/profit trend, region bar chart, category comparison, discount-vs-profit scatter, top product table, and state leaderboard.
