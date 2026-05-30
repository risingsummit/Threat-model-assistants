# Property Lens

Property Lens is a local Streamlit app for daily listing snapshots, feature engineering, price prediction, and investment research. It uses Beautiful Soup to parse permitted listing pages and trains a Random Forest regressor from normalized listing data.

## What it includes

- Configurable ZIP-code collection from approved HTML listing pages
- Rate-limited requests and daily CSV snapshots
- Missing-value handling and date parsing
- Numerical features extracted from descriptions such as `5 mins to metro`
- Random Forest price model using size, beds, baths, ZIP code, property type, and nearby amenities
- Streamlit live valuation form and potentially undervalued listing table
- Demo data so the project runs without network access

## Start the app

```powershell
cd real-estate-investment-finder
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe cli.py collect --demo
.\.venv\Scripts\python.exe cli.py train
.\.venv\Scripts\python.exe -m streamlit run app.py
```

The app opens at `http://localhost:8501`.

## Publish with Streamlit Community Cloud

After pushing this folder to GitHub:

1. Sign in at [share.streamlit.io](https://share.streamlit.io).
2. Choose **Create app**.
3. Select your GitHub repository and branch.
4. Set the main file path to `real-estate-investment-finder/app.py`.
5. Deploy the app.

The hosted app starts with demo data when no snapshot exists. Keep `config.json`, raw snapshots, and trained models private. For a production live-data deployment, use an approved API and a hosted scheduled job or database; the Windows Task Scheduler refresh only updates your local computer.

## Configure a permitted listing source

Copy `config.example.json` to `config.json`, add your ZIP codes, and fill in selectors for a page or feed you are authorized to collect. Then run:

```powershell
.\refresh-daily.ps1
```

Use Windows Task Scheduler or another scheduler to run `refresh-daily.ps1` daily. The script collects the configured ZIP codes and retrains the model from the newest snapshot.

## Notes on Zillow and Redfin

Zillow, Redfin, and other listing services may restrict automated scraping in their terms or technical controls. This project intentionally does not bypass access controls, CAPTCHAs, or robots rules. Prefer an approved API, licensed MLS feed, brokerage export, or a listing page whose owner has permitted automated collection. The collector is isolated in `real_estate.py` so a permitted source can be added without changing the model or UI.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```
