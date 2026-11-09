// Wallet Watchlist and Alert Module: the one entry point other code (or a bigger system) imports.
// It connects the five modules into a single pipeline:
//   detection -> registry (is it a watched wallet?) -> filters (does it match the rules?) -> notifications -> export
import type { ChainEvent, Notification, TrackedTransaction, TransferEvent } from "./types.ts";
import { getWallet } from "./modules/registry/index.ts";
import { passesFilter } from "./modules/filters/index.ts";
import { dispatch, bus } from "./modules/notifications/index.ts";
import { recordTransaction, recordTransferEvent } from "./modules/transactions/index.ts";

export * from "./types.ts";
export * from "./modules/registry/index.ts";
export * from "./modules/filters/index.ts";
export * from "./modules/notifications/index.ts";
export * from "./modules/export/index.ts";
export * from "./modules/transactions/index.ts";

const lc = (s: string) => s.toLowerCase();

export function handleEvent(e: ChainEvent): Notification[] {
  // 1. Record transaction in SQLite & emit live event
  const tx: Omit<TrackedTransaction, "createdAt"> = {
    txHash: e.txHash,
    from: e.from,
    to: e.to,
    type: e.type,
    token: e.token,
    amountUsd: e.amountUsd,
    blockTime: e.timestamp,
  };
  const savedTx = recordTransaction(tx);
  bus.emit("transaction", savedTx);

  // 2. If it is an ERC20 or native transfer event, record in transfer_events table
  if (e.type === "transfer") {
    const tr: Omit<TransferEvent, "createdAt"> = {
      id: e.id,
      txHash: e.txHash,
      from: e.from,
      to: e.to,
      token: e.token,
      amountUsd: e.amountUsd,
      timestamp: e.timestamp,
    };
    const savedTr = recordTransferEvent(tr);
    bus.emit("transfer", savedTr);
  }

  bus.emit("chain_event", e);

  // 3. Process watchlist filters and alerts
  const made: Notification[] = [];
  for (const addr of new Set([lc(e.from), lc(e.to)])) {
    const w = getWallet(addr);
    if (w && passesFilter(e, w.filter)) {
      const n = dispatch(w, e);
      if (n) made.push(n);
    }
  }
  return made;
}
