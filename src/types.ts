// Shared types used by every module.

export type EventType = "swap" | "transfer" | "pool_interaction";
export const EVENT_TYPES: EventType[] = ["swap", "transfer", "pool_interaction"];

export interface ChainEvent {
  id: string;                    // unique per event, e.g. "<txHash>:<logIndex>"
  type: EventType;
  timestamp: number;             // unix milliseconds
  txHash: string;
  from: string;
  to: string;
  token: string;                 // symbol, e.g. "USDC"
  amountUsd: number;
  poolAction?: "add" | "remove"; // only for pool_interaction
}

export interface Filter {
  minUsd?: number;
  maxUsd?: number;
  eventTypes?: EventType[];
  tokenAllow?: string[];
  tokenBlock?: string[];
}

export interface Wallet { address: string; label: string; filter: Filter; addedAt: number }

export interface Notification {
  id: string; wallet: string; label: string; type: EventType; token: string;
  amountUsd: number; txHash: string; message: string;
  eventTime: number; createdAt: number; read: boolean;
}

export interface TrackedTransaction {
  txHash: string;
  from: string;
  to: string;
  type: EventType;
  token: string;
  amountUsd: number;
  blockTime: number;
  createdAt: number;
}

export interface TransferEvent {
  id: string;
  txHash: string;
  from: string;
  to: string;
  token: string;
  amountUsd: number;
  timestamp: number;
  createdAt: number;
}

export interface TransactionQueryFilter {
  wallet?: string;
  from?: string;
  to?: string;
  token?: string;
  type?: EventType;
  minUsd?: number;
  maxUsd?: number;
  limit?: number;
  offset?: number;
}

export interface TransferQueryFilter {
  wallet?: string;
  from?: string;
  to?: string;
  token?: string;
  minUsd?: number;
  maxUsd?: number;
  limit?: number;
  offset?: number;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
