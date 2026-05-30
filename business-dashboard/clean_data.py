from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RAW_FILE = DATA_DIR / "superstore_raw.csv"
CLEAN_FILE = DATA_DIR / "superstore_clean.csv"
JSON_FILE = DATA_DIR / "superstore_clean.json"
SUMMARY_FILE = DATA_DIR / "dashboard_summary.json"


def money(value):
    return round(float(value), 2)


def main():
    df = pd.read_csv(RAW_FILE, encoding="utf-8-sig")

    df.columns = [
        c.strip()
        .replace("\ufeff", "")
        .replace(" ", "_")
        .replace("-", "_")
        .lower()
        for c in df.columns
    ]

    df = df.drop_duplicates()
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
    df["ship_date"] = pd.to_datetime(df["ship_date"], errors="coerce")

    numeric_cols = ["sales", "quantity", "discount", "profit", "postal_code"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    required_cols = ["order_id", "order_date", "ship_date", "sales", "profit", "quantity"]
    df = df.dropna(subset=required_cols)

    text_cols = [
        "ship_mode",
        "customer_id",
        "customer_name",
        "segment",
        "country",
        "city",
        "state",
        "region",
        "product_id",
        "category",
        "sub_category",
        "product_name",
    ]
    for col in text_cols:
        df[col] = df[col].astype(str).str.strip()

    df["postal_code"] = df["postal_code"].fillna(0).astype(int).astype(str).replace("0", "")
    df["quantity"] = df["quantity"].astype(int)
    df["ship_days"] = (df["ship_date"] - df["order_date"]).dt.days
    df["margin"] = (df["profit"] / df["sales"]).where(df["sales"] != 0, 0)
    df["year"] = df["order_date"].dt.year
    df["month"] = df["order_date"].dt.month
    df["month_name"] = df["order_date"].dt.strftime("%b")
    df["year_month"] = df["order_date"].dt.strftime("%Y-%m")
    df["order_date"] = df["order_date"].dt.strftime("%Y-%m-%d")
    df["ship_date"] = df["ship_date"].dt.strftime("%Y-%m-%d")

    df = df.sort_values(["order_date", "order_id", "row_id"]).reset_index(drop=True)

    summary = {
        "rows": int(len(df)),
        "orders": int(df["order_id"].nunique()),
        "customers": int(df["customer_id"].nunique()),
        "date_min": str(df["order_date"].min()),
        "date_max": str(df["order_date"].max()),
        "sales": money(df["sales"].sum()),
        "profit": money(df["profit"].sum()),
        "quantity": int(df["quantity"].sum()),
        "avg_discount": round(float(df["discount"].mean()), 4),
        "margin": round(float(df["profit"].sum() / df["sales"].sum()), 4),
        "source": "Sample Superstore retail sales dataset",
        "cleaning": [
            "Standardized column names for BI compatibility.",
            "Parsed order and ship dates.",
            "Converted sales, profit, discount, quantity, and postal code fields.",
            "Dropped duplicate rows and records missing required KPI fields.",
            "Added ship_days, margin, year, month, and year_month fields.",
        ],
    }

    CLEAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(CLEAN_FILE, index=False)
    df.to_json(JSON_FILE, orient="records")
    SUMMARY_FILE.write_text(pd.Series(summary).to_json(indent=2), encoding="utf-8")

    print(f"Clean rows: {summary['rows']}")
    print(f"Sales: ${summary['sales']:,.2f}")
    print(f"Profit: ${summary['profit']:,.2f}")
    print(f"Date range: {summary['date_min']} to {summary['date_max']}")


if __name__ == "__main__":
    main()
