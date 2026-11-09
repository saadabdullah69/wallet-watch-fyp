// Sends one fake blockchain event to your running server (for testing without waiting for the chain).
// Usage: npm run simulate -- <wallet address> [usd amount] [type] [token]
// Needs DEV=1 in your .env file.
const [address, usd = "75000", type = "transfer", token = "USDC"] = process.argv.slice(2);
if (!address) {
  console.log("Usage: npm run simulate -- <wallet address> [usd amount] [swap|transfer|pool_interaction] [token]");
  process.exit(1);
}
const event = {
  id: "sim-" + Date.now(),
  type,
  txHash: "0x" + Date.now().toString(16),
  from: address,
  to: "0x000000000000000000000000000000000000dEaD",
  token,
  amountUsd: Number(usd),
  ...(type === "pool_interaction" ? { poolAction: "add" } : {}),
};
const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/dev/simulate`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) console.log("Failed:", out.error ?? res.status, "(is the server running, and is DEV=1 set in .env?)");
else console.log(out.created ? "Alert created. Check the page." : "No alert: your filters ignored this event (or it was a duplicate).");
