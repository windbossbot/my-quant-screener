import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // ─────────────────────────────────────────────────────────────
  // Utils
  // ─────────────────────────────────────────────────────────────
  const PUBLIC_DIR = path.join(__dirname, "public");
  const SNAPSHOT_PATH = path.join(PUBLIC_DIR, "snapshot.json");
  const CSV_PATH = path.join(PUBLIC_DIR, "screener_result.csv");

  const ensurePublicDir = () => {
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
  };

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const calculateMA = (prices, period) => {
    if (!Array.isArray(prices) || prices.length < period) return null;
    const sum = prices.slice(0, period).reduce((acc, p) => acc + p, 0);
    return sum / period;
  };

  // RSI (Wilder) using closes array where prices[0] is the most recent close
  const calculateRSI = (prices, period = 14) => {
    if (!Array.isArray(prices) || prices.length < period + 1) return null;
    const closes = [...prices].reverse(); // oldest -> latest

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gainSum += change;
      else lossSum += -change;
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  const readSnapshot = () => {
    try {
      if (!fs.existsSync(SNAPSHOT_PATH)) return null;
      const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const writeSnapshot = (snapshot) => {
    ensurePublicDir();
    const tmp = SNAPSHOT_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, SNAPSHOT_PATH);
  };

  // Build snapshot ONCE: fetch candles, compute only needed indicators, store locally.
  const buildSnapshot = async () => {
    const tickerResponse = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
    const tickerData = await tickerResponse.json();

    if (tickerData.status !== "0000") {
      throw new Error("Bithumb API Error (ticker)");
    }

    const symbols = Object.keys(tickerData.data).filter(
      (s) => s !== "date" && !["USDC", "USDT", "USD1", "USDE"].includes(s)
    );

    // light prefilter by price only
    const preFilteredSymbols = symbols.filter((symbol) => {
      const price = safeNum(tickerData.data[symbol]?.closing_price);
      return price !== null && price >= 0.01;
    });

    const concurrency = 15;
    const queue = [...preFilteredSymbols];
    const rows = [];

    const workers = Array(concurrency)
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const symbol = queue.shift();
          if (!symbol) break;

          try {
            const candleRes = await fetch(
              `https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`
            );
            const candleData = await candleRes.json();
            if (candleData.status !== "0000") continue;

            const dailyCandles = candleData.data;
            const reversedDaily = [...dailyCandles].reverse();
            const dailyPrices = reversedDaily
              .map((c) => safeNum(c[2]))
              .filter((n) => n !== null);

            if (dailyPrices.length < 2) continue;

            // monthly proxy from daily closes (every 30 points)
            const monthlyPrices = [];
            for (let j = 0; j < dailyPrices.length; j += 30) {
              monthlyPrices.push(dailyPrices[j]);
            }

            const currentPrice = dailyPrices[0];

            const ma20 = calculateMA(dailyPrices, 20);
            const ma60 = calculateMA(dailyPrices, 60);
            const ma120 = calculateMA(dailyPrices, 120);
            const ma240 = calculateMA(dailyPrices, 240);

            // kept as-is (likely null unless monthlyPrices >= 120)
            const ma120Monthly = calculateMA(monthlyPrices, 120);

            const rsi14 = calculateRSI(dailyPrices, 14);

            const t = tickerData.data[symbol] || {};
            rows.push({
              symbol,
              market: `${symbol}/KRW`,
              price: currentPrice,
              change:
                safeNum(t.fluctate_rate_24H) !== null ? safeNum(t.fluctate_rate_24H) / 100 : null,
              volume: safeNum(t.acc_trade_value_24H),

              // indicators used by filters
              rsi14,
              ma20_d: ma20,
              ma60_d: ma60,
              ma120_d: ma120,
              ma240_d: ma240,
              ma120_m: ma120Monthly,
              candle_count_m: monthlyPrices.length,
            });
          } catch {
            // ignore single symbol errors
          }
        }
      });

    await Promise.all(workers);

    const snapshot = {
      updatedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    };

    writeSnapshot(snapshot);
    return snapshot;
  };

  // Apply your existing conditions on a snapshot row
  const passesCondition = (row, conditionId) => {
    const currentPrice = row.price;
    const ma20 = row.ma20_d;
    const ma60 = row.ma60_d;
    const ma120 = row.ma120_d;
    const ma240 = row.ma240_d;
    const ma120Monthly = row.ma120_m;

    let passed = true;

    // Condition 1: Near MA60 (Above)
    if (conditionId === 1) {
      if (ma60 !== null) {
        const upperLimit = ma60 * 1.05;
        if (!(currentPrice > ma60 && currentPrice <= upperLimit)) passed = false;
      } else {
        passed = false;
      }
    }
    // Condition 2: Near MA120 (Above)
    else if (conditionId === 2) {
      if (ma120 !== null) {
        const upperLimit = ma120 * 1.05;
        if (!(currentPrice > ma120 && currentPrice <= upperLimit)) passed = false;
      } else {
        passed = false;
      }
    }
    // Condition 3: Perfect Alignment (정배열)
    else if (conditionId === 3) {
      if (ma20 !== null && ma60 !== null) {
        if (ma120 !== null) {
          if (!(ma20 > ma60 && ma60 > ma120)) passed = false;
        } else {
          if (!(ma20 > ma60)) passed = false;
        }
      } else {
        passed = false;
      }
    }
    // Condition 4: Exclude Reverse Alignment
    else if (conditionId === 4) {
      if (ma120Monthly !== null && currentPrice <= ma120Monthly) passed = false;

      if (passed) {
        // If all daily MAs exist and price is >=5% below ALL of them, exclude
        if (
          ma20 !== null &&
          ma60 !== null &&
          ma120 !== null &&
          ma240 !== null &&
          currentPrice <= ma20 * 0.95 &&
          currentPrice <= ma60 * 0.95 &&
          currentPrice <= ma120 * 0.95 &&
          currentPrice <= ma240 * 0.95
        ) {
          passed = false;
        }

        // Daily: Exclude Reverse Alignment
        if (ma20 !== null && ma60 !== null && ma120 !== null) {
          if (ma240 !== null) {
            if (ma20 < ma60 && ma60 < ma120 && ma120 < ma240) passed = false;
          } else {
            if (ma20 < ma60 && ma60 < ma120) passed = false;
          }
        }
      }
    }

    return passed;
  };

  // ─────────────────────────────────────────────────────────────
  // Refresh snapshot (for your \"Refresh Data\" button)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/crypto/refresh", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const snapshot = await buildSnapshot();
      return res.json({ success: true, updatedAt: snapshot.updatedAt, count: snapshot.count });
    } catch (e) {
      console.error("Snapshot refresh failed:", e);
      return res.status(500).json({ success: false, error: "Snapshot refresh failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Filter from snapshot (fast, no market re-fetch)
  // First call will build snapshot if missing.
  //
  // Query:
  //  - conditionId=1|2|3|4
  //  - rsi=50 (default 50)
  //  - monthlyMin=0 (default 0; 0 means no monthly gate)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/crypto", async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    const conditionId = req.query.conditionId ? parseInt(String(req.query.conditionId), 10) : 1;
    const rsiThreshold = req.query.rsi !== undefined ? Number(req.query.rsi) : 50;
    const monthlyMin = req.query.monthlyMin ? parseInt(String(req.query.monthlyMin), 10) : 0;

    try {
      let snapshot = readSnapshot();
      if (!snapshot) snapshot = await buildSnapshot();

      const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];

      const filtered = rows
        .filter((row) => {
          // Monthly count gate (optional)
          if (monthlyMin && Number(row.candle_count_m) < monthlyMin) return false;

          // Global RSI gate (optional)
          if (Number.isFinite(rsiThreshold)) {
            if (row.rsi14 === null || row.rsi14 < rsiThreshold) return false;
          }

          return passesCondition(row, conditionId);
        })
        .map((row) => ({
          market: row.market,
          korean_name: row.symbol,
          english_name: row.symbol,
          price: row.price,
          change: row.change,
          volume: row.volume,
          rsi14: row.rsi14,
          ma20_d: row.ma20_d,
          ma60_d: row.ma60_d,
          ma120_d: row.ma120_d,
          ma240_d: row.ma240_d,
          ma120_m: row.ma120_m,
          candle_count_m: row.candle_count_m,
        }));

      // Save CSV for download
      ensurePublicDir();
      const csvHeader =
        "Market,Price,RSI14,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";
      const csvRows = filtered
        .map(
          (r) =>
            `${r.market},${r.price},${r.rsi14?.toFixed(2) || "N/A"},${r.ma20_d?.toFixed(0) || "N/A"},${
              r.ma60_d?.toFixed(0) || "N/A"
            },${r.ma120_d?.toFixed(0) || "N/A"},${r.ma240_d?.toFixed(0) || "N/A"},${
              r.ma120_m?.toFixed(0) || "N/A"
            },${r.candle_count_m}`
        )
        .join("\n");
      fs.writeFileSync(CSV_PATH, csvHeader + csvRows);

      return res.json({
        success: true,
        snapshotUpdatedAt: snapshot.updatedAt,
        count: filtered.length,
        data: filtered,
        downloadUrl: "/screener_result.csv",
      });
    } catch (e) {
      console.error("Filter failed:", e);
      return res.status(500).json({ success: false, error: "Failed to filter data" });
    }
  });

  // Serve static files from public
  app.use(express.static(PUBLIC_DIR));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
