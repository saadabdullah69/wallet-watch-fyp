// MODULE: Parameterized Filters
// Checks and applies alert rules (trade size, event types, tokens). Depends on nothing else.
import { EVENT_TYPES, HttpError, type ChainEvent, type Filter } from "../../types.ts";

export function cleanFilter(f: any): Filter {
  const out: Filter = {};
  if (!f || typeof f !== "object") return out;
  for (const k of ["minUsd", "maxUsd"] as const) {
    if (f[k] === undefined || f[k] === null || f[k] === "") continue;
    const n = Number(f[k]);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${k} must be a number of 0 or more`);
    out[k] = n;
  }
  if (out.minUsd !== undefined && out.maxUsd !== undefined && out.minUsd > out.maxUsd)
    throw new HttpError(400, "minUsd cannot be larger than maxUsd");
  if (Array.isArray(f.eventTypes) && f.eventTypes.length) {
    if (f.eventTypes.some((t: any) => !EVENT_TYPES.includes(t)))
      throw new HttpError(400, "eventTypes can only contain swap, transfer, pool_interaction");
    out.eventTypes = f.eventTypes;
  }
  for (const k of ["tokenAllow", "tokenBlock"] as const) {
    if (Array.isArray(f[k]) && f[k].length)
      out[k] = f[k].map((t: any) => String(t).trim().toUpperCase()).filter(Boolean);
  }
  return out;
}

export function passesFilter(e: ChainEvent, f: Filter): boolean {
  if (f.minUsd !== undefined && e.amountUsd < f.minUsd) return false;
  if (f.maxUsd !== undefined && e.amountUsd > f.maxUsd) return false;
  if (f.eventTypes?.length && !f.eventTypes.includes(e.type)) return false;
  const tok = e.token.toUpperCase();
  if (f.tokenAllow?.length && !f.tokenAllow.includes(tok)) return false;
  if (f.tokenBlock?.length && f.tokenBlock.includes(tok)) return false;
  return true;
}
