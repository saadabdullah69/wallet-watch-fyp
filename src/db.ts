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

  create table if not exists transactions (
    tx_hash     text primary key,
    from_addr   text not null,
    to_addr     text not null,
    type        text not null,
    token       text not null,
    amount_usd  real not null,
    block_time  integer not null,
    created_at  integer not null
  );
  create index if not exists idx_tx_from on transactions (from_addr);
  create index if not exists idx_tx_to on transactions (to_addr);
  create index if not exists idx_tx_time on transactions (block_time);

  create table if not exists transfer_events (
    id          text primary key,
    tx_hash     text not null,
    from_addr   text not null,
    to_addr     text not null,
    token       text not null,
    amount_usd  real not null,
    timestamp   integer not null,
    created_at  integer not null
  );
  create index if not exists idx_transfers_from on transfer_events (from_addr);
  create index if not exists idx_transfers_to on transfer_events (to_addr);
  create index if not exists idx_transfers_tx on transfer_events (tx_hash);
  create index if not exists idx_transfers_time on transfer_events (timestamp);

  -- Backfill existing events from notifications if available
  insert or ignore into transactions (tx_hash, from_addr, to_addr, type, token, amount_usd, block_time, created_at)
  select tx_hash, wallet, '', type, token, amount_usd, event_time, created_at from notifications;

  insert or ignore into transfer_events (id, tx_hash, from_addr, to_addr, token, amount_usd, timestamp, created_at)
  select id, tx_hash, wallet, '', token, amount_usd, event_time, created_at from notifications where type = 'transfer';
`);
