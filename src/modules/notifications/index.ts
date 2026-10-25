// MODULE: Notification Center
// Stores alerts, tracks read/unread, and announces each new alert on `bus` so the server can push it live.
import { EventEmitter } from "node:events";
import { db } from "../../db.ts";
import type { ChainEvent, Notification, Wallet } from "../../types.ts";

// Every new alert is announced here; the web server forwards it to open browser pages.
export const bus = new EventEmitter();

const lc = (s: string) => s.toLowerCase();

const toNotification = (r: any): Notification => ({
  id: r.id, wallet: r.wallet, label: r.label, type: r.type, token: r.token,
  amountUsd: Number(r.amount_usd), txHash: r.tx_hash, message: r.message,
  eventTime: Number(r.event_time), createdAt: Number(r.created_at), read: Number(r.read) === 1,
});

function describe(label: string, e: ChainEvent): string {
  const usd = "$" + Math.round(e.amountUsd).toLocaleString("en-US");
  if (e.type === "swap") return `${label} swapped ${usd} of ${e.token}`;
  if (e.type === "transfer") return `${label} transferred ${usd} of ${e.token}`;
  return `${label} ${e.poolAction === "remove" ? "removed" : "added"} ${usd} of ${e.token} liquidity`;
}

export function dispatch(w: Wallet, e: ChainEvent): Notification | null {
  const id = `${w.address}:${e.id}`;
  const res = db.prepare(
    `insert or ignore into notifications
     (id, wallet, label, type, token, amount_usd, tx_hash, message, event_time, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, w.address, w.label, e.type, e.token, e.amountUsd, e.txHash, describe(w.label, e), e.timestamp, Date.now());
  if (Number(res.changes) === 0) return null; // already stored: duplicate event
  const n = toNotification(db.prepare("select * from notifications where id = ?").get(id));
  bus.emit("notification", n);
  return n;
}

export function listNotifications(opts: { unreadOnly?: boolean; wallet?: string; limit?: number } = {}): Notification[] {
  const where: string[] = []; const args: any[] = [];
  if (opts.unreadOnly) where.push("read = 0");
  if (opts.wallet) { where.push("wallet = ?"); args.push(lc(opts.wallet)); }
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const sql = `select * from notifications ${where.length ? "where " + where.join(" and ") : ""} order by event_time desc limit ${limit}`;
  return db.prepare(sql).all(...args).map(toNotification);
}

export const unreadCount = () => Number((db.prepare("select count(*) c from notifications where read = 0").get() as any).c);
export const markRead = (id: string) => void db.prepare("update notifications set read = 1 where id = ?").run(id);
export const markAllRead = () => void db.prepare("update notifications set read = 1").run();
