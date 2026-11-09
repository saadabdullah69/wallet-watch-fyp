// Web server: Express REST API + WebSockets + live alerts (Server-Sent Events) + serves frontend.
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HttpError, bus, handleEvent, listWallets } from "./index.ts";
import { walletsRouter } from "./routes/wallets.ts";
import { transactionsRouter } from "./routes/transactions.ts";
import { transfersRouter } from "./routes/transfers.ts";
import { notificationsRouter } from "./routes/notifications.ts";
import { exportRouter } from "./routes/export.ts";
import { setupWebSocketServer } from "./websocket.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEV = process.env.DEV === "1";
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const app = express();

// ----- 1. CORS Configuration (Smooth local cross-origin development) -----
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow tools, server-to-server, or same-origin requests (no origin header)
    if (!origin) return callback(null, true);

    // Allow all localhost and 127.0.0.1 ports (Vite 5173, Next.js 3000/3001, React, etc.)
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin);
    if (isLocalhost) return callback(null, true);

    // In dev mode allow all origins for easy integration
    if (DEV || process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    const allowed = (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (allowed.includes(origin)) return callback(null, true);

    return callback(new Error(`Origin '${origin}' not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Disposition"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ----- 2. Body Parser Middleware -----
app.use(express.json({ limit: "1mb" }));

// Handle invalid JSON body syntax errors gracefully
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Request body contains invalid or malformed JSON.",
    });
  }
  next(err);
});

// ----- 3. Static Files & Root Route -----
app.use(express.static(publicDir));
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(join(publicDir, "index.html"));
});

// ----- 4. Live Alerts SSE Stream (/api/stream) for legacy frontend compatibility -----
const sseClients = new Set<Response>();
bus.on("notification", (n) => {
  const msg = `event: notification\ndata: ${JSON.stringify(n)}\n\n`;
  for (const c of sseClients) {
    c.write(msg);
  }
});
setInterval(() => {
  for (const c of sseClients) {
    c.write(": ping\n\n");
  }
}, 25_000);

app.get("/api/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ----- 5. REST API Routes -----
app.use("/api", walletsRouter);
app.use("/api", transactionsRouter);
app.use("/api", transfersRouter);
app.use("/api", notificationsRouter);
app.use("/api", exportRouter);

// ----- 6. Centralized 404 Handler for /api routes -----
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found",
  });
});

// ----- 7. Centralized Error Handling Middleware -----
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  console.error("[server] Unhandled error:", err);
  return res.status(500).json({ success: false, error: "Something went wrong on the server" });
});

// ----- 8. HTTP and WebSocket Server Initialization -----
const server = createServer(app);
setupWebSocketServer(server);

server.listen(PORT, HOST, () => {
  console.log(`[server] HTTP server running on http://localhost:${PORT}`);
  console.log(`[server] WebSocket stream available at ws://localhost:${PORT}/ws`);
});

// ----- 9. Start Watching Blockchain (if RPC_URL configured) -----
if (process.env.RPC_URL) {
  const { startWatcher } = await import("./modules/detection/index.ts");
  startWatcher({
    rpcUrl: process.env.RPC_URL,
    getWatched: () => listWallets().map((w) => w.address),
    onEvent: handleEvent,
    pollMs: Number(process.env.POLL_MS ?? 4000),
    nativeSymbol: process.env.NATIVE_SYMBOL || "ETH",
    coingeckoPlatform: process.env.COINGECKO_PLATFORM || "ethereum",
    coingeckoNativeId: process.env.COINGECKO_NATIVE_ID || "ethereum",
    coingeckoKey: process.env.COINGECKO_API_KEY || undefined,
  }).catch((err) => console.error("[chain] could not start:", err.message));
} else {
  console.log("[chain] RPC_URL is not set, so live blockchain watching is off. Add it to .env to turn it on.");
}

export { app, server };
