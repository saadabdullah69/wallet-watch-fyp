// Wallet Watchlist and Alert Module: the one entry point other code (or a bigger system) imports.
// It connects the five modules into a single pipeline:
//   detection -> registry (is it a watched wallet?) -> filters (does it match the rules?) -> notifications -> export
import type { ChainEvent, Notification } from "./types.ts";
import { getWallet } from "./modules/registry/index.ts";
import { passesFilter } from "./modules/filters/index.ts";
import { dispatch } from "./modules/notifications/index.ts";

export * from "./types.ts";
export * from "./modules/registry/index.ts";
export * from "./modules/filters/index.ts";
export * from "./modules/notifications/index.ts";
export * from "./modules/export/index.ts";

const lc = (s: string) => s.toLowerCase();

export function handleEvent(e: ChainEvent): Notification[] {
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
