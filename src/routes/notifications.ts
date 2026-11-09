import { Router, type Request, type Response } from "express";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "../modules/notifications/index.ts";
import { isValidAddress } from "../middleware/validation.ts";

export const notificationsRouter = Router();

// GET /api/notifications
notificationsRouter.get("/notifications", (req: Request, res: Response) => {
  const { wallet, unread, limit } = req.query;

  if (wallet !== undefined && wallet !== "") {
    if (!isValidAddress(wallet)) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'wallet' query parameter: '${wallet}'. Must be a 42-character hex address.`,
      });
    }
  }

  let parsedLimit: number | undefined;
  if (limit !== undefined && limit !== "") {
    parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        success: false,
        error: `Invalid 'limit' query parameter: '${limit}'. Must be a positive integer.`,
      });
    }
  }

  const items = listNotifications({
    unreadOnly: unread === "1" || unread === "true",
    wallet: wallet as string | undefined,
    limit: parsedLimit ?? 100,
  });

  return res.json({
    items,
    unread: unreadCount(),
  });
});

// POST /api/notifications/read - Mark one notification as read
notificationsRouter.post("/notifications/read", (req: Request, res: Response) => {
  const { id } = req.body ?? {};
  if (!id) {
    return res.status(400).json({
      success: false,
      error: "Missing notification 'id' in request body.",
    });
  }
  markRead(String(id));
  return res.json({ unread: unreadCount() });
});

// POST /api/notifications/read-all - Mark all notifications as read
notificationsRouter.post("/notifications/read-all", (_req: Request, res: Response) => {
  markAllRead();
  return res.json({ unread: 0 });
});

