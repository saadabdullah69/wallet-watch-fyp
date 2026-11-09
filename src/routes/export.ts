import { Router, type Request, type Response } from "express";
import { summarize, toCsv, toJson } from "../modules/export/index.ts";
import { handleEvent } from "../index.ts";
import { isValidAddress } from "../middleware/validation.ts";
import type { ChainEvent } from "../types.ts";

export const exportRouter = Router();

const DEV = process.env.DEV === "1";

// GET /api/summary
exportRouter.get("/summary", (req: Request, res: Response) => {
  const { wallet } = req.query;
  if (wallet !== undefined && wallet !== "") {
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'wallet' query parameter: '${wallet}'. Must be a 42-character hex address.`,
      });
    }
  }

  const summary = summarize(wallet as string | undefined);
  return res.json(summary);
});

// GET /api/export.csv
exportRouter.get("/export.csv", (req: Request, res: Response) => {
  const { wallet } = req.query;
  if (wallet !== undefined && wallet !== "") {
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'wallet' query parameter: '${wallet}'. Must be a 42-character hex address.`,
      });
    }
  }

  const csv = toCsv(wallet as string | undefined);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="wallet-activity.csv"');
  return res.send(csv);
});

// GET /api/export.json
exportRouter.get("/export.json", (req: Request, res: Response) => {
  const { wallet } = req.query;
  if (wallet !== undefined && wallet !== "") {
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'wallet' query parameter: '${wallet}'. Must be a 42-character hex address.`,
      });
    }
  }

  const json = toJson(wallet as string | undefined);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="wallet-activity.json"');
  return res.send(json);
});

// POST /api/dev/simulate (Testing helper)
exportRouter.post("/dev/simulate", (req: Request, res: Response) => {
  if (!DEV && process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      error: "Simulation endpoint is disabled. Set DEV=1 in .env to enable.",
    });
  }

  const e = req.body as ChainEvent;
  if (!e || typeof e !== "object") {
    return res.status(400).json({
      success: false,
      error: "Request body must be a valid ChainEvent object.",
    });
  }

  e.timestamp = e.timestamp || Date.now();
  const created = handleEvent(e);
  return res.json({
    success: true,
    created: created.length,
    notifications: created,
  });
});

