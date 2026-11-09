// MODULE: Real-Time Event Detection
// Real-time event detection: reads new blocks from a blockchain node and turns activity
// of watched wallets into ChainEvent objects (transfer, swap, pool_interaction).
import type { ChainEvent } from "../../types.ts";

export interface WatcherOptions {
  rpcUrl: string;
  getWatched: () => string[];          // current list of watched addresses
  onEvent: (e: ChainEvent) => void;
  pollMs?: number;
  nativeSymbol?: string;               // "ETH", "BNB", ...
  coingeckoPlatform?: string;          // "ethereum", "base", "polygon-pos", ...
  coingeckoNativeId?: string;          // "ethereum", "binancecoin", ...
  coingeckoKey?: string;
}

const STABLES = new Set(["USDC", "USDT", "DAI", "USDC.E", "FDUSD", "BUSD"]);
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];

export async function startWatcher(opts: WatcherOptions) {
  const { JsonRpcProvider, Contract, id, zeroPadValue, formatUnits, formatEther } = await import("ethers");

  const native = opts.nativeSymbol ?? "ETH";
  const platform = opts.coingeckoPlatform ?? "ethereum";
  const nativeId = opts.coingeckoNativeId ?? "ethereum";
  const provider = new JsonRpcProvider(opts.rpcUrl);

  // FIX 0: Verify connectivity immediately so a wrong RPC_URL is caught at startup.
  try {
    const network = await provider.getNetwork();
    console.log(`[chain] connected to "${network.name}" (chainId ${network.chainId})`);
  } catch (err) {
    throw new Error(`[chain] Cannot reach RPC — check RPC_URL in .env: ${(err as Error).message}`);
  }

  // Event signatures are turned into "topics" (fingerprints) that appear in transaction logs.
  const T = {
    transfer: id("Transfer(address,address,uint256)"),
    v2Swap: id("Swap(address,uint256,uint256,uint256,uint256,address)"),
    v3Swap: id("Swap(address,address,int256,int256,uint160,uint128,int24)"),
    v2Mint: id("Mint(address,uint256,uint256)"),
    v2Burn: id("Burn(address,uint256,uint256,address)"),
    v3Mint: id("Mint(address,address,int24,int24,uint128,uint256,uint256)"),
    v3Burn: id("Burn(address,int24,int24,uint128,uint256,uint256)"),
  };

  // ----- prices (CoinGecko, cached for 60 seconds) -----
  const priceCache = new Map<string, { usd: number; at: number }>();
  async function price(key: string, url: string, pick: (j: any) => number | undefined): Promise<number> {
    const hit = priceCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.usd;
    try {
      const r = await fetch(url, { headers: opts.coingeckoKey ? { "x-cg-demo-api-key": opts.coingeckoKey } : {} });
      const usd = pick(await r.json()) ?? 0;
      priceCache.set(key, { usd, at: Date.now() });
      return usd;
    } catch { return hit?.usd ?? 0; }
  }
  const nativePrice = () => price("native", `https://api.coingecko.com/api/v3/simple/price?ids=${nativeId}&vs_currencies=usd`, j => j?.[nativeId]?.usd);

  // ----- token info (symbol + decimals, cached forever) -----
  const tokenCache = new Map<string, { symbol: string; decimals: number }>();
  async function tokenInfo(addr: string) {
    const key = addr.toLowerCase();
    const hit = tokenCache.get(key);
    if (hit) return hit;
    let info = { symbol: key.slice(0, 8), decimals: 18 };
    try {
      const c = new Contract(addr, ERC20_ABI, provider);
      info = { symbol: String(await c.symbol()), decimals: Number(await c.decimals()) };
    } catch { /* unusual token: keep the fallback */ }
    tokenCache.set(key, info);
    return info;
  }

  async function tokenValue(addr: string, raw: bigint): Promise<{ symbol: string; usd: number }> {
    const t = await tokenInfo(addr);
    const amount = Number(formatUnits(raw, t.decimals));
    const sym = t.symbol.toUpperCase();
    let p = 0;
    if (STABLES.has(sym)) p = 1;
    else if (sym === "W" + native) p = await nativePrice();
    else p = await price(addr.toLowerCase(), `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addr.toLowerCase()}&vs_currencies=usd`, j => j?.[addr.toLowerCase()]?.usd);
    return { symbol: t.symbol, usd: amount * p };
  }

  const addrFromTopic = (topic: string) => "0x" + topic.slice(26).toLowerCase();

  // ----- the biggest token movement into/out of a wallet inside one transaction -----
  async function biggestFlow(logs: readonly any[], wallet: string, nativeValue: bigint) {
    let best = { symbol: native, usd: 0 };
    if (nativeValue > 0n) best = { symbol: native, usd: Number(formatEther(nativeValue)) * (await nativePrice()) };
    for (const l of logs) {
      if (l.topics[0] !== T.transfer || l.topics.length !== 3 || l.data === "0x") continue;
      if (addrFromTopic(l.topics[1]) !== wallet && addrFromTopic(l.topics[2]) !== wallet) continue;
      const v = await tokenValue(l.address, BigInt(l.data));
      if (v.usd > best.usd || best.usd === 0) best = v;
    }
    return best;
  }

  // ----- look at one block -----
  async function processBlock(n: number) {
    const watched = new Set(opts.getWatched().map(a => a.toLowerCase()));
    if (watched.size === 0) return;

    // FIX 1: per-block try/catch so one bad block never crashes the whole poll loop.
    let block: Awaited<ReturnType<typeof provider.getBlock>>;
    try {
      block = await provider.getBlock(n, true); // true = also fetch full tx objects
    } catch (err) {
      console.warn(`[chain] could not fetch block ${n}:`, (err as Error).message);
      return;
    }
    // FIX 2: block is null when the node doesn't have it yet — skip and retry next poll.
    if (!block) { console.warn(`[chain] block ${n} returned null — skipping`); return; }
    const time = block.timestamp * 1000;
    const claimed = new Set<string>(); // "txHash:wallet" already reported as a swap/pool event
    const emit = (e: Omit<ChainEvent, "timestamp">) => { try { opts.onEvent({ ...e, timestamp: time }); } catch (err) { console.error("[chain] onEvent failed:", err); } };

    // FIX 3: prefetchedTransactions only exists if we passed true to getBlock.
    // Use ?? [] so a rare RPC that returns only hashes doesn't throw here.
    const txs = block.prefetchedTransactions ?? [];

    // 1) Swaps and liquidity changes: transactions SENT by a watched wallet
    for (const tx of txs) {
      const from = tx.from.toLowerCase();
      if (!watched.has(from) || tx.data === "0x") continue;
      // FIX 4a: individual receipt fetches can fail under rate-limits; skip that tx.
      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(tx.hash);
      } catch (err) {
        console.warn(`[chain] receipt fetch failed for ${tx.hash}:`, (err as Error).message);
        continue;
      }
      if (!receipt || receipt.status !== 1) continue;
      const seen = new Set(receipt.logs.map(l => l.topics[0]));
      const isSwap = seen.has(T.v2Swap) || seen.has(T.v3Swap);
      const isAdd = seen.has(T.v2Mint) || seen.has(T.v3Mint);
      const isRemove = seen.has(T.v2Burn) || seen.has(T.v3Burn);
      if (!isSwap && !isAdd && !isRemove) continue;
      const flow = await biggestFlow(receipt.logs, from, tx.value);
      const base = { txHash: tx.hash, from, to: (tx.to ?? "").toLowerCase(), token: flow.symbol, amountUsd: flow.usd };
      if (isSwap) emit({ ...base, id: `${tx.hash}:swap`, type: "swap" });
      if (isAdd) emit({ ...base, id: `${tx.hash}:pool:add`, type: "pool_interaction", poolAction: "add" });
      if (isRemove) emit({ ...base, id: `${tx.hash}:pool:remove`, type: "pool_interaction", poolAction: "remove" });
      claimed.add(`${tx.hash}:${from}`);
    }

    // 2) Token transfers to or from a watched wallet (asks the node only for matching logs)
    const padded = [...watched].map(a => zeroPadValue(a, 32));
    let sent: any[] = [], received: any[] = [];
    try {
      // FIX 4b: getLogs can time-out on congested nodes; don't crash the block loop.
      [sent, received] = await Promise.all([
        provider.getLogs({ fromBlock: n, toBlock: n, topics: [T.transfer, padded] }),
        provider.getLogs({ fromBlock: n, toBlock: n, topics: [T.transfer, null, padded] }),
      ]);
    } catch (err) {
      console.warn(`[chain] getLogs failed for block ${n}:`, (err as Error).message);
    }
    const done = new Set<string>();
    for (const log of [...sent, ...received]) {
      const key = `${log.transactionHash}:${log.index}`;
      if (done.has(key) || log.topics.length !== 3 || log.data === "0x") continue; // skips NFTs
      done.add(key);
      const from = addrFromTopic(log.topics[1]), to = addrFromTopic(log.topics[2]);
      if (claimed.has(`${log.transactionHash}:${from}`) || claimed.has(`${log.transactionHash}:${to}`)) continue;
      const v = await tokenValue(log.address, BigInt(log.data));
      emit({ id: key, type: "transfer", txHash: log.transactionHash, from, to, token: v.symbol, amountUsd: v.usd });
    }

    // 3) Plain coin transfers (ETH, BNB, ...)
    for (const tx of txs) {
      const from = tx.from.toLowerCase(), to = (tx.to ?? "").toLowerCase();
      if (tx.value > 0n && tx.data === "0x" && (watched.has(from) || watched.has(to))) {
        emit({ id: `${tx.hash}:native`, type: "transfer", txHash: tx.hash, from, to, token: native, amountUsd: Number(formatEther(tx.value)) * (await nativePrice()) });
      }
    }
    console.log(`[chain] block ${n} done — ${txs.length} txs, ${watched.size} wallet(s) watched`);
  }

  // ----- main loop: check for new blocks every few seconds -----
  let last = await provider.getBlockNumber();
  console.log(`[chain] polling from block ${last} every ${opts.pollMs ?? 4000}ms`);
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const head = await provider.getBlockNumber();
      if (head - last > 50) { console.warn(`[chain] fell ${head - last} blocks behind, skipping ahead`); last = head - 50; }
      for (let b = last + 1; b <= head; b++) { await processBlock(b); last = b; }
    } catch (err) {
      console.error("[chain] error:", (err as Error).message);
    } finally { busy = false; }
  }, opts.pollMs ?? 4000);
}
