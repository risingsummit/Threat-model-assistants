from __future__ import annotations

import argparse
from pathlib import Path

from real_estate import (
    collect_from_config,
    generate_demo_listings,
    load_latest_or_demo,
    save_snapshot,
    train_model,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect listings and train the valuation model.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    collect = subparsers.add_parser("collect", help="Collect a daily listing snapshot.")
    collect.add_argument("--config", type=Path, help="JSON config for approved listing pages.")
    collect.add_argument("--demo", action="store_true", help="Generate a local demo snapshot.")
    collect.add_argument("--count", type=int, default=420, help="Number of demo rows.")
    subparsers.add_parser("train", help="Train the Random Forest valuation model.")

    args = parser.parse_args()
    if args.command == "collect":
        if not args.demo and not args.config:
            parser.error("collect requires --demo or --config")
        listings = generate_demo_listings(args.count) if args.demo else collect_from_config(args.config)
        if listings.empty:
            raise SystemExit("No listings were collected. Check the enabled sources and selectors.")
        path = save_snapshot(listings)
        print(f"Saved {len(listings)} listings to {path}")
    elif args.command == "train":
        metrics = train_model(load_latest_or_demo())
        print(f"Model trained: MAE=${metrics['mae']:,.0f}, R2={metrics['r2']:.3f}")


if __name__ == "__main__":
    main()

