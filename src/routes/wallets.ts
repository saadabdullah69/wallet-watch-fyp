import { Router, type Request, type Response } from "express";
import {
  addWallet,
  getWallet,
  listWallets,
  removeWallet,
  updateFilter,
  updateWalletLabel,
} from "../modules/registry/index.ts";
import { listTransactions, listTransferEvents } from "../modules/transactions/index.ts";
import { validateAddressParam, validateEventQueryParams, isValidAddress } from "../middleware/validation.ts";
import { HttpError } from "../types.ts";

export const walletsRouter = Router();

// GET /api/wallets - List all watched wallets
// Default returns Wallet[] for compatibility with existing frontend; ?envelope=true returns { success, count, data }
walletsRouter.get("/wallets", (req: Request, res: Response) => {
  const wallets = listWallets();
  if (req.query.envelope === "true" || req.query.wrap === "true") {
    return res.json({ success: true, count: wallets.length, data: wallets });
  }
  return res.json(wallets);
});

// GET /api/watchlist - Explicit structured watchlist endpoint
walletsRouter.get("/watchlist", (req: Request, res: Response) => {
  const wallets = listWallets();
  return res.json({ success: true, count: wallets.length, data: wallets });
});

// POST /api/wallets - Add a new wallet to watch
walletsRouter.post("/wallets", (req: Request, res: Response) => {
  const { address, label, filter } = req.body ?? {};

  if (!address) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: 'address' is required in request body.",
    });
  }

  if (!isValidAddress(address)) {
    return res.status(400).json({
      success: false,
      error: `Invalid Ethereum wallet address format: '${address}'. Address must be a 42-character hex string starting with '0x'.`,
    });
  }

  try {
    const created = addWallet(address, label, filter);
    return res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
});

// GET /api/wallets/:address - Fetch a specific watched wallet
walletsRouter.get("/wallets/:address", validateAddressParam("address"), (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  const wallet = getWallet(address);
  if (!wallet) {
    return res.status(404).json({ success: false, error: `Wallet '${address}' not found in watchlist.` });
  }
  return res.json(wallet);
});

// DELETE /api/wallets/:address - Remove wallet from watchlist
walletsRouter.delete("/wallets/:address", validateAddressParam("address"), (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  try {
    removeWallet(address);
    return res.json({ ok: true, message: `Wallet '${address}' removed from watchlist.` });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
});

// PUT /api/wallets/:address/label - Update wallet label
walletsRouter.put("/wallets/:address/label", validateAddressParam("address"), (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  const { label } = req.body ?? {};

  if (typeof label !== "string" || !label.trim()) {
    return res.status(400).json({
      success: false,
      error: "A non-empty 'label' string is required in request body.",
    });
  }

  try {
    const updated = updateWalletLabel(address, label.trim());
    return res.json({ success: true, wallet: updated });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
});

// PUT /api/wallets/:address/filter - Update wallet filters
walletsRouter.put("/wallets/:address/filter", validateAddressParam("address"), (req: Request, res: Response) => {
  const address = String(req.params.address).toLowerCase();
  try {
    const updated = updateFilter(address, req.body);
    return res.json(updated);
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
});

// GET /api/wallets/:address/transactions - Get tracked transactions for a specific wallet
walletsRouter.get(
  "/wallets/:address/transactions",
  validateAddressParam("address"),
  validateEventQueryParams,
  (req: Request, res: Response) => {
    const address = String(req.params.address).toLowerCase();
    const result = listTransactions({
      wallet: address,
      token: req.query.token as string | undefined,
      type: req.query.type as any,
      minUsd: req.query.minUsd ? Number(req.query.minUsd) : undefined,
      maxUsd: req.query.maxUsd ? Number(req.query.maxUsd) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    return res.json({
      success: true,
      wallet: address,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      data: result.items,
    });
  }
);

// GET /api/wallets/:address/transfers - Get parsed transfer events for a specific wallet
walletsRouter.get(
  "/wallets/:address/transfers",
  validateAddressParam("address"),
  validateEventQueryParams,
  (req: Request, res: Response) => {
    const address = String(req.params.address).toLowerCase();
    const result = listTransferEvents({
      wallet: address,
      token: req.query.token as string | undefined,
      minUsd: req.query.minUsd ? Number(req.query.minUsd) : undefined,
      maxUsd: req.query.maxUsd ? Number(req.query.maxUsd) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    return res.json({
      success: true,
      wallet: address,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      data: result.items,
    });
  }
);
