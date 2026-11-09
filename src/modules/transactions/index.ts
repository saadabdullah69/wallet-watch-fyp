// MODULE: Tracked Transactions and Parsed Transfer Events
// Saves and queries parsed Ethereum blockchain transactions and ERC20 transfer events.
import { db } from "../../db.ts";
import type {
  TrackedTransaction,
  TransferEvent,
  TransactionQueryFilter,
  TransferQueryFilter,
} from "../../types.ts";

const lc = (s: string) => s.toLowerCase();

const toTransaction = (r: any): TrackedTransaction => ({
  txHash: r.tx_hash,
  from: r.from_addr,
  to: r.to_addr,
  type: r.type,
  token: r.token,
  amountUsd: Number(r.amount_usd),
  blockTime: Number(r.block_time),
  createdAt: Number(r.created_at),
});

const toTransfer = (r: any): TransferEvent => ({
  id: r.id,
  txHash: r.tx_hash,
  from: r.from_addr,
  to: r.to_addr,
  token: r.token,
  amountUsd: Number(r.amount_usd),
  timestamp: Number(r.timestamp),
  createdAt: Number(r.created_at),
});

export function recordTransaction(tx: Omit<TrackedTransaction, "createdAt">): TrackedTransaction {
  db.prepare(`
    insert into transactions (tx_hash, from_addr, to_addr, type, token, amount_usd, block_time, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(tx_hash) do update set
      amount_usd = max(transactions.amount_usd, excluded.amount_usd),
      from_addr = case when transactions.from_addr = '' then excluded.from_addr else transactions.from_addr end,
      to_addr = case when transactions.to_addr = '' then excluded.to_addr else transactions.to_addr end
  `).run(
    tx.txHash,
    lc(tx.from),
    lc(tx.to || ""),
    tx.type,
    tx.token.toUpperCase(),
    tx.amountUsd,
    tx.blockTime,
    Date.now()
  );
  return getTransactionByHash(tx.txHash)!;
}

export function recordTransferEvent(ev: Omit<TransferEvent, "createdAt">): TransferEvent {
  db.prepare(`
    insert into transfer_events (id, tx_hash, from_addr, to_addr, token, amount_usd, timestamp, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      amount_usd = excluded.amount_usd
  `).run(
    ev.id,
    ev.txHash,
    lc(ev.from),
    lc(ev.to || ""),
    ev.token.toUpperCase(),
    ev.amountUsd,
    ev.timestamp,
    Date.now()
  );
  return getTransferEventById(ev.id)!;
}

export function getTransactionByHash(txHash: string): TrackedTransaction | undefined {
  const row = db.prepare("select * from transactions where tx_hash = ?").get(txHash);
  return row ? toTransaction(row) : undefined;
}

export function getTransferEventById(id: string): TransferEvent | undefined {
  const row = db.prepare("select * from transfer_events where id = ?").get(id);
  return row ? toTransfer(row) : undefined;
}

export function listTransactions(opts: TransactionQueryFilter = {}): {
  items: TrackedTransaction[];
  total: number;
  limit: number;
  offset: number;
} {
  const where: string[] = [];
  const args: any[] = [];

  if (opts.wallet) {
    where.push("(from_addr = ? or to_addr = ?)");
    args.push(lc(opts.wallet), lc(opts.wallet));
  }
  if (opts.from) {
    where.push("from_addr = ?");
    args.push(lc(opts.from));
  }
  if (opts.to) {
    where.push("to_addr = ?");
    args.push(lc(opts.to));
  }
  if (opts.token) {
    where.push("upper(token) = ?");
    args.push(opts.token.toUpperCase());
  }
  if (opts.type) {
    where.push("type = ?");
    args.push(opts.type);
  }
  if (opts.minUsd !== undefined && Number.isFinite(opts.minUsd)) {
    where.push("amount_usd >= ?");
    args.push(opts.minUsd);
  }
  if (opts.maxUsd !== undefined && Number.isFinite(opts.maxUsd)) {
    where.push("amount_usd <= ?");
    args.push(opts.maxUsd);
  }

  const whereClause = where.length ? "where " + where.join(" and ") : "";

  const countRow: any = db.prepare(`select count(*) as count from transactions ${whereClause}`).get(...args);
  const total = Number(countRow?.count ?? 0);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = db.prepare(
    `select * from transactions ${whereClause} order by block_time desc limit ? offset ?`
  ).all(...args, limit, offset);

  return {
    items: rows.map(toTransaction),
    total,
    limit,
    offset,
  };
}

export function listTransferEvents(opts: TransferQueryFilter = {}): {
  items: TransferEvent[];
  total: number;
  limit: number;
  offset: number;
} {
  const where: string[] = [];
  const args: any[] = [];

  if (opts.wallet) {
    where.push("(from_addr = ? or to_addr = ?)");
    args.push(lc(opts.wallet), lc(opts.wallet));
  }
  if (opts.from) {
    where.push("from_addr = ?");
    args.push(lc(opts.from));
  }
  if (opts.to) {
    where.push("to_addr = ?");
    args.push(lc(opts.to));
  }
  if (opts.token) {
    where.push("upper(token) = ?");
    args.push(opts.token.toUpperCase());
  }
  if (opts.minUsd !== undefined && Number.isFinite(opts.minUsd)) {
    where.push("amount_usd >= ?");
    args.push(opts.minUsd);
  }
  if (opts.maxUsd !== undefined && Number.isFinite(opts.maxUsd)) {
    where.push("amount_usd <= ?");
    args.push(opts.maxUsd);
  }

  const whereClause = where.length ? "where " + where.join(" and ") : "";

  const countRow: any = db.prepare(`select count(*) as count from transfer_events ${whereClause}`).get(...args);
  const total = Number(countRow?.count ?? 0);

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = db.prepare(
    `select * from transfer_events ${whereClause} order by timestamp desc limit ? offset ?`
  ).all(...args, limit, offset);

  return {
    items: rows.map(toTransfer),
    total,
    limit,
    offset,
  };
}

