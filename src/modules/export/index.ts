// MODULE: Activity Exporting
// Builds summaries and CSV/JSON files from the stored alerts.
import { db } from "../../db.ts";
import { listNotifications } from "../notifications/index.ts";

const lc = (s: string) => s.toLowerCase();

export function summarize(wallet?: string) {
  const where = wallet ? "where wallet = ?" : "";
  const args = wallet ? [lc(wallet)] : [];
  const total: any = db.prepare(
    `select count(*) c, coalesce(sum(amount_usd), 0) usd, min(event_time) first_ts, max(event_time) last_ts
     from notifications ${where}`).get(...args);
  const group = (col: string) => db.prepare(
    `select ${col} k, count(*) c, sum(amount_usd) usd from notifications ${where} group by ${col} order by usd desc`
  ).all(...args).map((r: any) => ({ name: r.k, count: Number(r.c), usd: Number(r.usd) }));
  return {
    wallet: wallet ? lc(wallet) : "all wallets",
    totalAlerts: Number(total.c), totalUsd: Number(total.usd),
    firstEvent: total.first_ts === null ? null : Number(total.first_ts),
    lastEvent: total.last_ts === null ? null : Number(total.last_ts),
    byType: group("type"), byToken: group("token"),
  };
}

// Spreadsheet programs run text starting with = + - @ as formulas, so we defuse those.
function csvCell(v: unknown): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(wallet?: string): string {
  const rows = listNotifications({ wallet, limit: 500 }).reverse();
  const head = "time,wallet,label,type,token,amount_usd,tx_hash";
  const lines = rows.map(n => [new Date(n.eventTime).toISOString(), n.wallet, n.label, n.type, n.token, n.amountUsd.toFixed(2), n.txHash].map(csvCell).join(","));
  return [head, ...lines].join("\n") + "\n";
}

export const toJson = (wallet?: string) => JSON.stringify(listNotifications({ wallet, limit: 500 }), null, 2);
