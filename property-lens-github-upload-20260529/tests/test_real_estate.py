import pandas as pd

from real_estate import SourceConfig, ListingScraper, clean_listings, extract_minutes, parse_date, parse_number


def test_parse_number_handles_listing_text():
    assert parse_number("$725,000") == 725000
    assert parse_number("1.2M") == 1200000
    assert parse_number("850 sqft") == 850


def test_extract_minutes_turns_description_into_features():
    assert extract_minutes("Sunny condo, 5 mins to metro", ("metro",)) == 5
    assert extract_minutes("Downtown: 12 minutes", ("downtown",)) == 12


def test_parse_relative_date():
    assert parse_date("3 days ago").normalize() == (pd.Timestamp.today() - pd.Timedelta(days=3)).normalize()


def test_scraper_and_cleaner_handle_missing_values():
    html = """
    <div class="property-card" data-listing-id="abc">
      <span class="address">10 Main St</span><span class="price">$525,000</span>
      <span class="beds">2 beds</span><span class="sqft">950 sqft</span>
      <p class="description">8 mins to train</p><a href="/listing/abc">Details</a>
    </div>
    """
    source = SourceConfig(
        name="test",
        url_template="https://example.com/{zip_code}",
        card_selector=".property-card",
        fields={
            "listing_id": {"selector": "[data-listing-id]", "attribute": "data-listing-id"},
            "address": {"selector": ".address"},
            "price": {"selector": ".price"},
            "beds": {"selector": ".beds"},
            "sqft": {"selector": ".sqft"},
            "description": {"selector": ".description"},
            "url": {"selector": "a", "attribute": "href"},
        },
    )
    raw = ListingScraper.parse_html(html, source, "20001", "https://example.com/search")
    cleaned = clean_listings(pd.DataFrame(raw))
    assert cleaned.loc[0, "price"] == 525000
    assert cleaned.loc[0, "metro_minutes"] == 8
    assert cleaned.loc[0, "url"] == "https://example.com/listing/abc"

