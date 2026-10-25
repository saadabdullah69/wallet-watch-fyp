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

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
