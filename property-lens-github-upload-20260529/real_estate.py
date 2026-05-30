from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import joblib
import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "price_model.joblib"
LATEST_PATH = PROCESSED_DIR / "listings_latest.csv"

NUMERIC_FEATURES = [
    "sqft",
    "beds",
    "baths",
    "lot_sqft",
    "year_built",
    "parking_spaces",
    "hoa_monthly",
    "metro_minutes",
    "downtown_minutes",
    "school_rating",
    "days_on_market",
]
CATEGORICAL_FEATURES = ["zip_code", "property_type"]
MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def ensure_directories() -> None:
    for directory in (RAW_DIR, PROCESSED_DIR, MODEL_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def parse_number(value: Any) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return np.nan
    text = str(value).lower().replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return np.nan
    number = float(match.group())
    if "k" in text:
        number *= 1_000
    elif "m" in text:
        number *= 1_000_000
    return number


def extract_minutes(text: Any, destinations: tuple[str, ...]) -> float:
    description = str(text or "").lower()
    for destination in destinations:
        patterns = [
            rf"(\d+)\s*(?:min|mins|minute|minutes)\s+(?:to|from)\s+(?:the\s+)?{destination}",
            rf"{destination}\s*(?:is|:|-)?\s*(\d+)\s*(?:min|mins|minute|minutes)",
        ]
        for pattern in patterns:
            match = re.search(pattern, description)
            if match:
                return float(match.group(1))
    return np.nan


def parse_date(value: Any) -> pd.Timestamp:
    if value is None or not str(value).strip():
        return pd.NaT
    text = str(value).strip().lower()
    today = pd.Timestamp(date.today())
    if text in {"today", "listed today"}:
        return today
    match = re.search(r"(\d+)\s+days?\s+ago", text)
    if match:
        return today - pd.Timedelta(days=int(match.group(1)))
    return pd.to_datetime(value, errors="coerce")


def clean_listings(raw: pd.DataFrame) -> pd.DataFrame:
    listings = raw.copy()
    defaults = {
        "listing_id": "",
        "address": "",
        "price": np.nan,
        "beds": np.nan,
        "baths": np.nan,
        "sqft": np.nan,
        "lot_sqft": np.nan,
        "year_built": np.nan,
        "parking_spaces": np.nan,
        "hoa_monthly": np.nan,
        "school_rating": np.nan,
        "property_type": "Unknown",
        "description": "",
        "listed_date": pd.NaT,
        "scraped_at": pd.Timestamp.now("UTC"),
        "zip_code": "",
        "source": "unknown",
        "url": "",
    }
    for column, default in defaults.items():
        if column not in listings:
            listings[column] = default

    for column in [
        "price",
        "beds",
        "baths",
        "sqft",
        "lot_sqft",
        "year_built",
        "parking_spaces",
        "hoa_monthly",
        "school_rating",
    ]:
        listings[column] = listings[column].map(parse_number)

    listings["listed_date"] = listings["listed_date"].map(parse_date)
    listings["scraped_at"] = pd.to_datetime(listings["scraped_at"], errors="coerce", utc=True)
    listings["metro_minutes"] = listings["description"].map(
        lambda text: extract_minutes(text, ("metro", "subway", "train", "station"))
    )
    listings["downtown_minutes"] = listings["description"].map(
        lambda text: extract_minutes(text, ("downtown", "city center", "city centre"))
    )
    today = pd.Timestamp(date.today())
    listings["days_on_market"] = (today - listings["listed_date"]).dt.days.clip(lower=0)
    listings["property_type"] = listings["property_type"].fillna("Unknown").astype(str).str.strip()
    listings["zip_code"] = listings["zip_code"].astype(str).str.extract(r"(\d{5})", expand=False)
    listings["listing_id"] = listings.apply(_stable_listing_id, axis=1)
    listings = listings.dropna(subset=["price", "sqft", "zip_code"])
    listings = listings[listings["price"].between(20_000, 20_000_000)]
    listings = listings[listings["sqft"].between(150, 30_000)]
    listings = listings.drop_duplicates(subset=["source", "listing_id"], keep="last")
    return listings.reset_index(drop=True)


def _stable_listing_id(row: pd.Series) -> str:
    listing_id = str(row.get("listing_id", "")).strip()
    if listing_id and listing_id.lower() != "nan":
        return listing_id
    key = f"{row.get('source', '')}|{row.get('address', '')}|{row.get('zip_code', '')}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


@dataclass
class SourceConfig:
    name: str
    url_template: str
    card_selector: str
    fields: dict[str, dict[str, str]]
    enabled: bool = True


class ListingScraper:
    """Collect listing cards from pages the operator is authorized to access."""

    def __init__(self, delay_seconds: float = 2.0) -> None:
        self.delay_seconds = max(delay_seconds, 1.0)
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "RealEstateInvestmentFinder/1.0 (personal research; contact: local-user)"}
        )

    def scrape(self, source: SourceConfig, zip_codes: list[str]) -> pd.DataFrame:
        rows: list[dict[str, Any]] = []
        for zip_code in zip_codes:
            url = source.url_template.format(zip_code=zip_code)
            response = self.session.get(url, timeout=20)
            response.raise_for_status()
            rows.extend(self.parse_html(response.text, source, zip_code, url))
            time.sleep(self.delay_seconds)
        return pd.DataFrame(rows)

    @staticmethod
    def parse_html(html: str, source: SourceConfig, zip_code: str, page_url: str) -> list[dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        rows = []
        for card in soup.select(source.card_selector):
            row: dict[str, Any] = {
                "source": source.name,
                "zip_code": zip_code,
                "scraped_at": datetime.now().astimezone().isoformat(),
            }
            for name, field in source.fields.items():
                element = card.select_one(field["selector"])
                value = ""
                if element:
                    value = element.get(field["attribute"], "") if field.get("attribute") else element.get_text(" ", strip=True)
                row[name] = value
            if row.get("url"):
                row["url"] = urljoin(page_url, row["url"])
            rows.append(row)
        return rows


def load_config(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def collect_from_config(config_path: Path) -> pd.DataFrame:
    config = load_config(config_path)
    scraper = ListingScraper(float(config.get("request_delay_seconds", 2.0)))
    frames = []
    for item in config.get("sources", []):
        source = SourceConfig(**item)
        if source.enabled:
            frames.append(scraper.scrape(source, config["zip_codes"]))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def generate_demo_listings(count: int = 420, seed: int = 21) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    zip_codes = np.array(["20001", "20002", "20003", "20005", "20009", "22201"])
    zip_adjustment = {"20001": 60_000, "20002": 10_000, "20003": 95_000, "20005": 150_000, "20009": 120_000, "22201": 80_000}
    property_types = np.array(["Condo", "Townhouse", "Single Family"])
    rows = []
    for index in range(count):
        zip_code = str(rng.choice(zip_codes))
        property_type = str(rng.choice(property_types, p=[0.46, 0.29, 0.25]))
        beds = int(rng.integers(1, 6))
        baths = max(1.0, beds - 1 + rng.choice([0, 0.5, 1, 1.5]))
        sqft = int(rng.normal(550 + beds * 430, 190))
        metro = int(rng.integers(3, 30))
        downtown = int(rng.integers(7, 42))
        school = round(float(rng.uniform(4.5, 9.8)), 1)
        lot_sqft = int(rng.integers(900, 7000)) if property_type != "Condo" else np.nan
        hoa = int(rng.integers(180, 900)) if property_type == "Condo" else int(rng.integers(0, 220))
        type_adjustment = {"Condo": -35_000, "Townhouse": 30_000, "Single Family": 85_000}[property_type]
        price = (
            sqft * 365
            + beds * 16_000
            + baths * 12_000
            - metro * 2_900
            - downtown * 1_100
            + school * 12_000
            + zip_adjustment[zip_code]
            + type_adjustment
            + rng.normal(0, 45_000)
        )
        rows.append(
            {
                "listing_id": f"demo-{index:04d}",
                "address": f"{100 + index} Example Avenue",
                "price": round(max(price, 110_000), -3),
                "beds": beds,
                "baths": baths,
                "sqft": max(sqft, 450),
                "lot_sqft": lot_sqft,
                "year_built": int(rng.integers(1920, 2025)),
                "parking_spaces": int(rng.integers(0, 3)),
                "hoa_monthly": hoa,
                "school_rating": school,
                "property_type": property_type,
                "description": f"Bright home, {metro} mins to metro and {downtown} minutes to downtown.",
                "listed_date": date.today() - timedelta(days=int(rng.integers(0, 95))),
                "zip_code": zip_code,
                "source": "demo",
                "url": "",
                "scraped_at": datetime.now().astimezone().isoformat(),
            }
        )
    return pd.DataFrame(rows)


def save_snapshot(listings: pd.DataFrame) -> Path:
    ensure_directories()
    stamp = datetime.now().strftime("%Y-%m-%d")
    raw_path = RAW_DIR / f"listings_{stamp}.csv"
    cleaned = clean_listings(listings)
    cleaned.to_csv(raw_path, index=False)
    cleaned.to_csv(LATEST_PATH, index=False)
    return LATEST_PATH


def load_latest_or_demo() -> pd.DataFrame:
    ensure_directories()
    if LATEST_PATH.exists():
        return clean_listings(pd.read_csv(LATEST_PATH))
    demo = clean_listings(generate_demo_listings())
    save_snapshot(demo)
    return demo


def build_pipeline() -> Pipeline:
    numeric = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    categorical = Pipeline(
        [("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]
    )
    preprocess = ColumnTransformer([("numeric", numeric, NUMERIC_FEATURES), ("categorical", categorical, CATEGORICAL_FEATURES)])
    return Pipeline(
        [
            ("preprocess", preprocess),
            ("model", RandomForestRegressor(n_estimators=350, min_samples_leaf=2, random_state=42, n_jobs=-1)),
        ]
    )


def train_model(listings: pd.DataFrame, model_path: Path = MODEL_PATH) -> dict[str, float]:
    cleaned = clean_listings(listings)
    if len(cleaned) < 30:
        raise ValueError("At least 30 usable listings are required to train a valuation model.")
    x_train, x_test, y_train, y_test = train_test_split(
        cleaned[MODEL_FEATURES], cleaned["price"], test_size=0.2, random_state=42
    )
    pipeline = build_pipeline()
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    metrics = {
        "mae": float(mean_absolute_error(y_test, predictions)),
        "r2": float(r2_score(y_test, predictions)),
        "training_rows": float(len(x_train)),
        "test_rows": float(len(x_test)),
    }
    ensure_directories()
    joblib.dump({"pipeline": pipeline, "metrics": metrics, "trained_at": datetime.now().isoformat()}, model_path)
    return metrics


def load_or_train_model(listings: pd.DataFrame) -> dict[str, Any]:
    ensure_directories()
    if not MODEL_PATH.exists():
        train_model(listings)
    return joblib.load(MODEL_PATH)


def estimate_value(model_bundle: dict[str, Any], property_details: dict[str, Any]) -> float:
    frame = pd.DataFrame([property_details])
    return float(model_bundle["pipeline"].predict(frame[MODEL_FEATURES])[0])


def rank_investments(listings: pd.DataFrame, model_bundle: dict[str, Any], limit: int = 20) -> pd.DataFrame:
    ranked = clean_listings(listings)
    ranked["estimated_value"] = model_bundle["pipeline"].predict(ranked[MODEL_FEATURES])
    ranked["estimated_discount"] = ranked["estimated_value"] - ranked["price"]
    ranked["discount_pct"] = ranked["estimated_discount"] / ranked["estimated_value"] * 100
    ranked["price_per_sqft"] = ranked["price"] / ranked["sqft"]
    return ranked.sort_values("discount_pct", ascending=False).head(limit)
