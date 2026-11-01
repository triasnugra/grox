import type { Candle } from "./types.ts";

const HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
];

const STABLES =
  /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|USD1|XUSD|PAXG|USDE|PYUSD|U|USDS|USDD|RLUSD|BFUSD|USDG)$/;

let hostIdx = 0;

export async function binance(path: string, signal?: AbortSignal): Promise<unknown> {
  let last: unknown;
  for (let t = 0; t < HOSTS.length; t++) {
    const h = HOSTS[(hostIdx + t) % HOSTS.length]!;
    try {
      const r = await fetch(`${h}/api/v3/${path}`, { signal });
      if (!r.ok) throw new Error(`${h} HTTP ${r.status}`);
      hostIdx = (hostIdx + t) % HOSTS.length;
      return await r.json();
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Binance tidak terjangkau");
}

export function mapDaily(a: unknown[]): Candle {
  return { t: +a[0]!, o: +a[1]!, h: +a[2]!, l: +a[3]!, c: +a[4]!, v: +a[5]! };
}

export async function klines(symbol: string, signal?: AbortSignal): Promise<Candle[]> {
  const rows = (await binance(`klines?symbol=${symbol}&interval=1d&limit=1000`, signal)) as unknown[];
  return rows.map((r) => mapDaily(r as unknown[]));
}

export async function topUsdt(n: number, signal?: AbortSignal): Promise<string[]> {
  const t = (await binance("ticker/24hr", signal)) as Array<{ symbol: string; quoteVolume: string }>;
  return t
    .filter((x) => x.symbol.endsWith("USDT") && !STABLES.test(x.symbol.slice(0, -4)))
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
    .slice(0, n)
    .map((x) => x.symbol.slice(0, -4));
}
