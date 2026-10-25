// Web server: REST API + live alerts (Server-Sent Events) + serves the web page.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpError, addWallet, bus, getWallet, handleEvent, listNotifications, listWallets,
  markAllRead, markRead, removeWallet, summarize, toCsv, toJson, unreadCount, updateFilter,
  updateWalletLabel, // NEW (you must export this from index.ts, see below)
  type ChainEvent,
} from "./index.ts";


const PORT = Number(process.env.PORT ?? 3000);
const DEV = process.env.DEV === "1";
const PAGE = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "index.html");

// ----- live alerts: every open browser tab is kept in this set -----
const clients = new Set<ServerResponse>();
bus.on("notification", n => {
  const msg = `event: notification\ndata: ${JSON.stringify(n)}\n\n`;
  for (const c of clients) c.write(msg);
});
setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 25_000);

function send(res: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8", extra: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(body);
}
const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data));

async function readBody(req: IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, "Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = req.method ?? "GET", p = url.pathname;
  const wallet = url.searchParams.get("wallet") ?? undefined;

  if (m === "GET" && p === "/") return send(res, 200, readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");

  if (m === "GET" && p === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Watchlist
  if (p === "/api/wallets" && m === "GET") return json(res, 200, listWallets());
  if (p === "/api/wallets" && m === "POST") {
    const b = await readBody(req);
    return json(res, 201, addWallet(b.address, b.label, b.filter));
  }

  // CHANGED: regex now also accepts /label
  const wm = p.match(/^\/api\/wallets\/(0x[0-9a-fA-F]{40})(\/filter|\/label)?$/);
  if (wm && m === "GET"    && !wm[2]) { const w = getWallet(wm[1]); return w ? json(res, 200, w) : json(res, 404, { error: "Wallet not found" }); }
  if (wm && m === "DELETE" && !wm[2]) { removeWallet(wm[1]); return json(res, 200, { ok: true }); }
  if (wm && m === "PUT"    && wm[2] === "/filter") return json(res, 200, updateFilter(wm[1], await readBody(req)));

  // NEW: update a wallet's custom label/name
  if (wm && m === "PUT" && wm[2] === "/label") {
    const b = await readBody(req);
    if (typeof b.label !== "string" || !b.label.trim()) {
      throw new HttpError(400, "Valid label string is required");
    }
    return json(res, 200, { success: true, wallet: updateWalletLabel(wm[1], b.label.trim()) });
  }

  // Notifications
  if (p === "/api/notifications" && m === "GET")
    return json(res, 200, {
      items: listNotifications({ unreadOnly: url.searchParams.get("unread") === "1", wallet, limit: Number(url.searchParams.get("limit") ?? 100) }),
      unread: unreadCount(),
    });
  if (p === "/api/notifications/read" && m === "POST") { markRead(String((await readBody(req)).id)); return json(res, 200, { unread: unreadCount() }); }
  if (p === "/api/notifications/read-all" && m === "POST") { markAllRead(); return json(res, 200, { unread: 0 }); }

  // Export
  if (p === "/api/summary" && m === "GET") return json(res, 200, summarize(wallet));
  if (p === "/api/export.csv" && m === "GET") return send(res, 200, toCsv(wallet), "text/csv; charset=utf-8", { "Content-Disposition": 'attachment; filename="wallet-activity.csv"' });
  if (p === "/api/export.json" && m === "GET") return send(res, 200, toJson(wallet), "application/json", { "Content-Disposition": 'attachment; filename="wallet-activity.json"' });

  // Testing helper: pushes one event through the same pipeline as real blockchain events
  if (DEV && p === "/api/dev/simulate" && m === "POST") {
    const e = (await readBody(req)) as ChainEvent;
    e.timestamp ??= Date.now();
    return json(res, 200, { created: handleEvent(e).length });
  }

  throw new HttpError(404, "Not found");
}

createServer(async (req, res) => {
  try { await route(req, res); }
  catch (err) {
    if (res.headersSent) return;
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    if (err instanceof SyntaxError) return json(res, 400, { error: "Request body is not valid JSON" });
    console.error(err);
    json(res, 500, { error: "Something went wrong on the server" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Open http://localhost:${PORT}`));

// ----- start watching the blockchain if a node address is configured -----
if (process.env.RPC_URL) {
  const { startWatcher } = await import("./modules/detection/index.ts");
  startWatcher({
    rpcUrl: process.env.RPC_URL,
    getWatched: () => listWallets().map(w => w.address),
    onEvent: handleEvent,
    pollMs: Number(process.env.POLL_MS ?? 4000),
    nativeSymbol: process.env.NATIVE_SYMBOL || "ETH",
    coingeckoPlatform: process.env.COINGECKO_PLATFORM || "ethereum",
    coingeckoNativeId: process.env.COINGECKO_NATIVE_ID || "ethereum",
    coingeckoKey: process.env.COINGECKO_API_KEY || undefined,
  }).catch(err => console.error("[chain] could not start:", err.message));
} else {
  console.log("RPC_URL is not set, so live blockchain watching is off. Add it to .env to turn it on.");
}