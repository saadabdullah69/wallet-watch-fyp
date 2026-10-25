// Database setup. Uses the SQLite that is built into Node.js (no extra install needed).
import { DatabaseSync } from "node:sqlite";

export const db = new DatabaseSync(process.env.DB_FILE ?? "watch.db");

db.exec(`
  create table if not exists wallets (
    address  text primary key,          -- lowercase 0x address
    label    text not null,
    filter   text not null,             -- filter settings stored as JSON text
    added_at integer not null
  );
  create table if not exists notifications (
    id          text primary key,       -- "<wallet>:<event id>" (stops duplicates)
    wallet      text not null,
    label       text not null,
    type        text not null,
    token       text not null,
    amount_usd  real not null,
    tx_hash     text not null,
    message     text not null,
    event_time  integer not null,
    created_at  integer not null,
    read        integer not null default 0
  );
  create index if not exists idx_notif_wallet on notifications (wallet, event_time);
`);
