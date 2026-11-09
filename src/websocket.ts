import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { bus } from "./modules/notifications/index.ts";
import { listWallets } from "./modules/registry/index.ts";
import type { ChainEvent, Notification, TrackedTransaction, TransferEvent } from "./types.ts";

interface ClientState {
  ws: WebSocket;
  isAlive: boolean;
  subscriptions: Set<string>; // lowercase addresses or empty set for ALL
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<WebSocket, ClientState>();

  // Heartbeat ping interval to clean up stale / severed connections
  const interval = setInterval(() => {
    for (const [ws, state] of clients.entries()) {
      if (!state.isAlive) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on("close", () => clearInterval(interval));

  wss.on("connection", (ws, req) => {
    const clientState: ClientState = {
      ws,
      isAlive: true,
      subscriptions: new Set<string>(), // Empty means receive all watched events
    };
    clients.set(ws, clientState);

    ws.on("pong", () => {
      clientState.isAlive = true;
    });

    // Send connection greeting with server info
    sendJson(ws, {
      type: "connected",
      message: "Connected to Wallet Watch live WebSocket stream.",
      activeWatchlistCount: listWallets().length,
      timestamp: Date.now(),
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(clientState, msg);
      } catch {
        sendJson(ws, { type: "error", error: "Message must be a valid JSON string." });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      console.warn("[ws] client error:", err.message);
      clients.delete(ws);
    });
  });

  function handleClientMessage(state: ClientState, msg: any) {
    const { ws } = state;
    switch (msg.type) {
      case "ping":
        return sendJson(ws, { type: "pong", timestamp: Date.now() });

      case "get_watchlist":
        return sendJson(ws, { type: "watchlist", data: listWallets() });

      case "get_status":
        return sendJson(ws, {
          type: "status",
          connectedClients: clients.size,
          watchedWallets: listWallets().length,
          timestamp: Date.now(),
        });

      case "subscribe": {
        const wallets = Array.isArray(msg.wallets) ? msg.wallets : msg.wallet ? [msg.wallet] : [];
        for (const w of wallets) {
          if (typeof w === "string" && /^0x[0-9a-fA-F]{40}$/.test(w)) {
            state.subscriptions.add(w.toLowerCase());
          }
        }
        return sendJson(ws, {
          type: "subscribed",
          subscriptions: Array.from(state.subscriptions),
        });
      }

      case "unsubscribe": {
        const wallets = Array.isArray(msg.wallets) ? msg.wallets : msg.wallet ? [msg.wallet] : [];
        for (const w of wallets) {
          if (typeof w === "string") {
            state.subscriptions.delete(w.toLowerCase());
          }
        }
        return sendJson(ws, {
          type: "unsubscribed",
          subscriptions: Array.from(state.subscriptions),
        });
      }

      default:
        return sendJson(ws, {
          type: "unknown_command",
          message: `Unrecognized command type: '${msg.type}'. Supported types: ping, subscribe, unsubscribe, get_watchlist, get_status.`,
        });
    }
  }

  function sendJson(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function broadcast(payload: { type: string; data: any }, relevantWallets?: string[]) {
    const jsonStr = JSON.stringify(payload);
    for (const [ws, state] of clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;

      // If client has specific subscriptions and relevant wallets are known, filter:
      if (state.subscriptions.size > 0 && relevantWallets && relevantWallets.length > 0) {
        const matches = relevantWallets.some((w) => state.subscriptions.has(w.toLowerCase()));
        if (!matches) continue;
      }

      ws.send(jsonStr);
    }
  }

  // Hook bus events to live WebSocket broadcast
  bus.on("notification", (n: Notification) => {
    broadcast({ type: "notification", data: n }, [n.wallet]);
  });

  bus.on("transaction", (tx: TrackedTransaction) => {
    broadcast({ type: "transaction", data: tx }, [tx.from, tx.to]);
  });

  bus.on("transfer", (tr: TransferEvent) => {
    broadcast({ type: "transfer", data: tr }, [tr.from, tr.to]);
  });

  bus.on("chain_event", (e: ChainEvent) => {
    broadcast({ type: "event", data: e }, [e.from, e.to]);
  });

  return wss;
}

