import { Router, type Request, type Response } from "express";
import { listTransactions, getTransactionByHash } from "../modules/transactions/index.ts";
import { validateEventQueryParams } from "../middleware/validation.ts";

export const transactionsRouter = Router();

const handleGetTransactions = (req: Request, res: Response) => {
  const result = listTransactions({
    wallet: req.query.wallet as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    token: req.query.token as string | undefined,
    type: req.query.type as any,
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

// GET /api/transactions & /api/tracked-transactions
transactionsRouter.get("/transactions", validateEventQueryParams, handleGetTransactions);
transactionsRouter.get("/tracked-transactions", validateEventQueryParams, handleGetTransactions);

// GET /api/transactions/:txHash
transactionsRouter.get("/transactions/:txHash", (req: Request, res: Response) => {
  const txHash = req.params.txHash as string;
  if (!txHash || !/^0x[0-9a-fA-F]+$/.test(txHash)) {
    return res.status(400).json({
      success: false,
      error: `Invalid transaction hash format: '${txHash}'. Must be a hex string beginning with '0x'.`,
    });
  }

  const tx = getTransactionByHash(txHash);
  if (!tx) {
    return res.status(404).json({
      success: false,
      error: `Tracked transaction not found for hash: '${txHash}'.`,
    });
  }

  return res.json({
    success: true,
    data: tx,
  });
});
