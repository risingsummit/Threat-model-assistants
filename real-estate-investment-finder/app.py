from __future__ import annotations

import pandas as pd
import streamlit as st

from real_estate import estimate_value, load_latest_or_demo, load_or_train_model, rank_investments, train_model

st.set_page_config(page_title="Property Lens", page_icon="🏠", layout="wide")
st.title("Property Lens")
st.caption("Dynamic real estate valuation and investment finder")


@st.cache_data
def load_listings() -> pd.DataFrame:
    return load_latest_or_demo()


@st.cache_resource
def load_model() -> dict:
    return load_or_train_model(load_listings())


listings = load_listings()
model_bundle = load_model()
metrics = model_bundle["metrics"]

with st.sidebar:
    st.header("Model snapshot")
    st.metric("Usable listings", f"{len(listings):,}")
    st.metric("Validation MAE", f"${metrics['mae']:,.0f}")
    st.metric("Validation R²", f"{metrics['r2']:.2f}")
    if st.button("Retrain from latest snapshot", use_container_width=True):
        with st.spinner("Training valuation model..."):
            train_model(listings)
            st.cache_resource.clear()
            st.success("Model retrained.")
            st.rerun()
    st.caption("Estimates are for research, not appraisals or lending decisions.")

valuation_tab, finder_tab, data_tab = st.tabs(["Live valuation", "Investment finder", "Listing data"])

with valuation_tab:
    st.subheader("Estimate a property's market value")
    left, middle, right = st.columns(3)
    with left:
        zip_code = st.selectbox("ZIP code", sorted(listings["zip_code"].dropna().astype(str).unique()))
        property_type = st.selectbox("Property type", ["Condo", "Townhouse", "Single Family", "Unknown"])
        sqft = st.number_input("Square footage", 150, 30000, 1400, step=50)
        beds = st.number_input("Bedrooms", 0, 15, 3)
    with middle:
        baths = st.number_input("Bathrooms", 0.0, 15.0, 2.0, step=0.5)
        lot_sqft = st.number_input("Lot square footage", 0, 100000, 1800, step=100)
        year_built = st.number_input("Year built", 1800, 2030, 1995)
        parking_spaces = st.number_input("Parking spaces", 0, 10, 1)
    with right:
        hoa_monthly = st.number_input("Monthly HOA", 0, 10000, 150, step=25)
        metro_minutes = st.number_input("Minutes to metro", 0, 180, 12)
        downtown_minutes = st.number_input("Minutes to downtown", 0, 240, 20)
        school_rating = st.number_input("Nearby school rating", 0.0, 10.0, 7.5, step=0.1)
        days_on_market = st.number_input("Days on market", 0, 1000, 14)

    details = {
        "zip_code": str(zip_code),
        "property_type": property_type,
        "sqft": sqft,
        "beds": beds,
        "baths": baths,
        "lot_sqft": lot_sqft,
        "year_built": year_built,
        "parking_spaces": parking_spaces,
        "hoa_monthly": hoa_monthly,
        "metro_minutes": metro_minutes,
        "downtown_minutes": downtown_minutes,
        "school_rating": school_rating,
        "days_on_market": days_on_market,
    }
    if st.button("Calculate live valuation", type="primary"):
        estimate = estimate_value(model_bundle, details)
        st.success(f"Estimated market value: ${estimate:,.0f}")
        st.caption(f"Estimated range: ${estimate * 0.92:,.0f} to ${estimate * 1.08:,.0f}")

with finder_tab:
    st.subheader("Potentially undervalued listings")
    st.caption("Ranked by the difference between listing price and model estimate. Review each property independently.")
    ranked = rank_investments(listings, model_bundle, limit=50)
    selected_zip = st.multiselect("Filter ZIP codes", sorted(ranked["zip_code"].unique()))
    if selected_zip:
        ranked = ranked[ranked["zip_code"].isin(selected_zip)]
    view = ranked[
        ["address", "zip_code", "property_type", "price", "estimated_value", "discount_pct", "sqft", "beds", "baths", "metro_minutes", "url"]
    ].copy()
    st.dataframe(
        view.style.format(
            {"price": "${:,.0f}", "estimated_value": "${:,.0f}", "discount_pct": "{:.1f}%", "sqft": "{:,.0f}"}
        ),
        hide_index=True,
        use_container_width=True,
    )

with data_tab:
    st.subheader("Latest normalized listing snapshot")
    st.dataframe(listings, hide_index=True, use_container_width=True)
    st.download_button("Download normalized CSV", listings.to_csv(index=False), "listings_latest.csv", "text/csv")

