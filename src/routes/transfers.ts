import { Router, type Request, type Response } from "express";
import { listTransferEvents, getTransferEventById } from "../modules/transactions/index.ts";
import { validateEventQueryParams } from "../middleware/validation.ts";

export const transfersRouter = Router();

const handleGetTransfers = (req: Request, res: Response) => {
  const result = listTransferEvents({
    wallet: req.query.wallet as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    token: req.query.token as string | undefined,
    minUsd: req.query.minUsd ? Number(req.query.minUsd) : undefined,
    maxUsd: req.query.maxUsd ? Number(req.query.maxUsd) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });

  return res.json({
    success: true,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    data: result.items,
  });
};

// GET /api/transfers & /api/transfer-events
transfersRouter.get("/transfers", validateEventQueryParams, handleGetTransfers);
transfersRouter.get("/transfer-events", validateEventQueryParams, handleGetTransfers);

// GET /api/transfers/:id
transfersRouter.get("/transfers/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!id || !id.trim()) {
    return res.status(400).json({
      success: false,
      error: "Missing required transfer event id parameter.",
    });
  }

  const transfer = getTransferEventById(id);
  if (!transfer) {
    return res.status(404).json({
      success: false,
      error: `Parsed transfer event not found for id: '${id}'.`,
    });
  }

  return res.json({
    success: true,
    data: transfer,
  });
});
