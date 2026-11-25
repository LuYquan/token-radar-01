[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ull-n/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ull-n/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — token-radar-01

Every protocol DefiLlama tracks that still records no token — and is not a
wrapped, staked or bridged product of a token that already trades — ranked by
implied launch value, each with a costed farm plan.

## What it is

- **Board:** 198 rows — the full 40-protocol watchlist (TVL ≥ $50M, no token
  on record) plus 158 early protocols below the floor that pass the same
  launch-candidate rule. No top-N cut: the radar ranks the whole set it finds.
- **Model (radar-2):** `implied = TVL × comp multiple × growth × maturity × breadth`
  - The comp multiple is priced off the snapshot itself: each category's
    live-token protocols' median market-cap-to-TVL, shrunk toward the global
    median (0.214) with weight n/(n+8) and clamped to [0.05, 2.0]. Categories
    with no live comp use the global median.
  - Growth is the 7-day TVL change clamped to [-50%, +100%] at weight 0.5;
    maturity rises with the time the protocol has run with no token;
    breadth adds a small premium per chain.
  - No protocol name is special-cased: one function scores every row.
- **Farm verdicts:** FARM (17), THIN (72), SKIP (109) — from the row's own
  implied value and growth. Every plan has 7 steps with capital, gas and
  hold in dollars and days, and the gas bill as basis points of implied value.
- **Dashboard:** a static page (`dashboard/`) that renders the whole board
  with no network — board view, per-protocol detail drawer with the model
  breakdown (the page recomputes the row and checks it against `board.json`),
  filtered views (search, category, chain, watchlist-only, minimum implied
  value), a live-token view, a what-if sandbox and the comparables table.

## How the board is built

The sealed snapshot holds 758 protocols. The funnel to the board:

| Step | Count |
| --- | --- |
| Protocols in the snapshot | 758 |
| Record no token (no market cap, no CoinGecko id, no symbol) | 342 |
| Set aside by the launch-candidate rule | 144 |
| **Rows on the board** | **198** |
| Already trade (live-token view) | 416 |

Set aside: CEX 42, Liquid Staking 38, Bridge 28, Canonical Bridge 15,
versioned product names 11, wrapped/staked product names 5, Liquid
Restaking 3, Restaked BTC 2. A wrapped or staked product of a token that
already trades is not a launch: WBTC is Bitcoin on Ethereum, Binance staked
ETH is ETH in a staking product.

The top of the board on this snapshot: Steakhouse Financial ($710.0M implied,
$2.75B TVL), Sentora Curator ($675.7M), Gauntlet ($425.7M), USDD ($186.9M).
Total implied value $4.35B; median row $4.1M.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22 or later, standard library only. It reads the snapshot, writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to
the output directory. The program refuses a board that misses a watchlist
slug, breaks rank order, or carries a farm step outside 20–600 characters.

## Files

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the radar-2 model, the board builder, the farm plans, the snapshot parser.
- `vendor/makefun-board.ts` — the kit's dossier builder (unchanged from the kit).
- `dashboard/` — the static page (index.html, app.css, app.js).
- `screenshots/` — board, detail and filtered views of the dashboard.
- `board.json`, `dossier.json` — the outputs of the last local run, for reference.

## Limits, stated plainly

Implied value assumes the protocol's record stays as it is; it does not
predict whether or when a token launches. A protocol that records no token
may still have one its DefiLlama record does not carry. The calibration is
in-sample — the multiples come from the live-token protocols in this same
snapshot — so it is a pricing rule, not a backtest. Never pay to claim an
airdrop; a real claim costs gas only.

---
<sub>Entered on [make.fun](https://make.fun/?ref=eanz6bmt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
