// MODULE: Monitored Address Registry
// Saves, lists, updates and removes watched wallet addresses (stored in the database).
import { db } from "../../db.ts";
import { HttpError, type Wallet } from "../../types.ts";
import { cleanFilter } from "../filters/index.ts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const lc = (s: string) => s.toLowerCase();

const toWallet = (r: any): Wallet => ({
  address: r.address, label: r.label, filter: JSON.parse(r.filter), addedAt: Number(r.added_at),
});
export function updateWalletLabel(address: string, label: string) {
  const info = db.prepare("UPDATE wallets SET label = ? WHERE address = ?").run(label, address);
  if (info.changes === 0) throw new HttpError(404, "Wallet not found");
  return getWallet(address);
}

export function getWallet(address: string): Wallet | undefined {
  const r = db.prepare("select * from wallets where address = ?").get(lc(address));
  return r ? toWallet(r) : undefined;
}

export function listWallets(): Wallet[] {
  return db.prepare("select * from wallets order by added_at desc").all().map(toWallet);
}

export function addWallet(address: string, label = "", filter: unknown = {}): Wallet {
  if (typeof address !== "string" || !ADDRESS.test(address)) throw new HttpError(400, "That is not a valid wallet address (0x + 40 characters)");
  if (getWallet(address)) throw new HttpError(409, "You are already watching this wallet");
  const cleanLabel = String(label ?? "").trim().slice(0, 60) || lc(address).slice(0, 10);
  const f = cleanFilter(filter);
  db.prepare("insert into wallets (address, label, filter, added_at) values (?, ?, ?, ?)")
    .run(lc(address), cleanLabel, JSON.stringify(f), Date.now());
  return getWallet(address)!;
}

export function updateFilter(address: string, filter: unknown): Wallet {
  if (!getWallet(address)) throw new HttpError(404, "Wallet not found");
  db.prepare("update wallets set filter = ? where address = ?").run(JSON.stringify(cleanFilter(filter)), lc(address));
  return getWallet(address)!;
}

export function removeWallet(address: string): void {
  const res = db.prepare("delete from wallets where address = ?").run(lc(address));
  if (Number(res.changes) === 0) throw new HttpError(404, "Wallet not found");
}
