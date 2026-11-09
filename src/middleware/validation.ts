import type { Request, Response, NextFunction } from "express";
import { EVENT_TYPES } from "../types.ts";

export const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(address: unknown): address is string {
  return typeof address === "string" && ETH_ADDRESS_REGEX.test(address);
}

/**
 * Validates a route parameter (e.g. /api/wallets/:address)
 */
export function validateAddressParam(paramName = "address") {
  return (req: Request, res: Response, next: NextFunction) => {
    const addr = req.params[paramName];
    if (!addr) {
      return res.status(400).json({
        success: false,
        error: `Missing required route parameter: :${paramName}`,
      });
    }
    if (!isValidAddress(addr)) {
      return res.status(400).json({
        success: false,
        error: `Invalid Ethereum wallet address format: '${addr}'. Address must be a 42-character hex string starting with '0x'.`,
      });
    }
    next();
  };
}

/**
 * Validates query parameters for address filtering (wallet, from, to)
 * and amount / pagination filters (minUsd, maxUsd, limit, offset, type).
 */
export function validateEventQueryParams(req: Request, res: Response, next: NextFunction) {
  const { wallet, from, to, token, type, minUsd, maxUsd, limit, offset } = req.query;

  // Validate address fields if supplied
  for (const [key, val] of Object.entries({ wallet, from, to })) {
    if (val !== undefined && val !== null && val !== "") {
      if (!isValidAddress(val)) {
        return res.status(400).json({
          success: false,
          error: `Invalid '${key}' query parameter: '${val}'. Address must be a 42-character hex string starting with '0x'.`,
        });
      }
    }
  }

  // Validate type
  if (type !== undefined && type !== "") {
    if (typeof type !== "string" || !EVENT_TYPES.includes(type as any)) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'type' query parameter: '${type}'. Allowed values are: ${EVENT_TYPES.join(", ")}.`,
      });
    }
  }

  // Validate minUsd / maxUsd
  let parsedMin: number | undefined;
  let parsedMax: number | undefined;

  if (minUsd !== undefined && minUsd !== "") {
    parsedMin = Number(minUsd);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'minUsd' query parameter: '${minUsd}'. Must be a non-negative number.`,
      });
    }
  }

  if (maxUsd !== undefined && maxUsd !== "") {
    parsedMax = Number(maxUsd);
    if (!Number.isFinite(parsedMax) || parsedMax < 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'maxUsd' query parameter: '${maxUsd}'. Must be a non-negative number.`,
      });
    }
  }

  if (parsedMin !== undefined && parsedMax !== undefined && parsedMin > parsedMax) {
    return res.status(400).json({
      success: false,
      error: `Invalid amount range: 'minUsd' (${parsedMin}) cannot exceed 'maxUsd' (${parsedMax}).`,
    });
  }

  // Validate limit / offset
  if (limit !== undefined && limit !== "") {
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'limit' query parameter: '${limit}'. Must be a positive integer.`,
      });
    }
  }

  if (offset !== undefined && offset !== "") {
    const parsedOffset = Number(offset);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'offset' query parameter: '${offset}'. Must be an integer >= 0.`,
      });
    }
  }

  next();
}

