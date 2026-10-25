# Wallet Watch (FYP)

Watch public wallet addresses and get real-time in-app alerts for swaps, transfers and pool activity.

## Modules (one folder each)

| Module | Folder | Depends on |
|---|---|---|
| 1. Monitored Address Registry | `src/modules/registry/` | filters, database |
| 2. Real-Time Event Detection | `src/modules/detection/` | nothing (hands events to a callback) |
| 3. Parameterized Filters | `src/modules/filters/` | nothing |
| 4. Notification Center | `src/modules/notifications/` | database |
| 5. Activity Exporting | `src/modules/export/` | notifications |

Shared pieces: `src/types.ts` (data shapes), `src/db.ts` (database).
`src/index.ts` is the single entry point that joins the modules:
detection -> registry -> filters -> notifications -> export.
`src/server.ts` exposes everything as a web API and serves `public/index.html`.

To plug this into a bigger system, import from `src/index.ts` and call `handleEvent(event)` for every blockchain event.

## Run it (VS Code)

1. Install Node.js 22 or newer (nodejs.org, LTS). Check with `node --version`.
2. File > Open Folder > choose this folder.
3. Terminal > New Terminal, then run: `npm install`
4. Copy `.env.example` to `.env` (right-click > Copy, Paste, rename).
5. Put a node address in `.env` after `RPC_URL=` (free from alchemy.com or infura.io; pick the same chain as your wallets).
6. Run: `npm start` (or press F5 in VS Code to run with the debugger)
7. Open http://localhost:3000

No RPC_URL? The website still works; you just won't get live blockchain alerts.

## Test without waiting for the blockchain

1. Set `DEV=1` in `.env` and restart the server.
2. In a second terminal (the + button in VS Code's terminal panel) run:

       npm run simulate -- <watched address> 75000 transfer USDC

   Arguments: address, USD amount, type (swap, transfer, pool_interaction), token.

## Known limits (good to mention in your report)

- EVM chains only (Ethereum, Base, Arbitrum, Polygon, BNB...). One chain per run.
- Swaps and pool events are detected for Uniswap V2/V3-style pools (and forks), in transactions the watched wallet sends.
- USD value uses CoinGecko prices; unknown tokens get $0 and so fail "minimum USD" filters.
- Native coin received inside contract calls (internal transactions) is not counted.
- No login: the server only listens on your own computer (127.0.0.1).
