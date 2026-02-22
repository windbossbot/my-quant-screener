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

  // API Route: Fetch Crypto Data from Bithumb with Multi-Timeframe Analysis
  app.get("/api/crypto", async (req, res) => {
    const conditionId = req.query.conditionId ? parseInt(req.query.conditionId) : 1;
    
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const tickerResponse = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
      const tickerData = await tickerResponse.json();
      
      if (tickerData.status !== "0000") {
        return res.status(500).json({ success: false, error: "Bithumb API Error" });
      }

      const symbols = Object.keys(tickerData.data).filter(s => 
        s !== 'date' && !['USDC', 'USDT', 'USD1', 'USDE'].includes(s)
      );
      
      const preFilteredSymbols = symbols.filter(symbol => {
        const price = parseFloat(tickerData.data[symbol].closing_price);
        const volume = parseFloat(tickerData.data[symbol].acc_trade_value_24H);
        return price >= 0.01 && volume >= 50000000;
      });

      const results = [];
      const calculateMA = (prices, period) => {
        if (prices.length < period) return null;
        const sum = prices.slice(0, period).reduce((acc, p) => acc + p, 0);
        return sum / period;
      };

      const concurrency = 15;
      const queue = [...preFilteredSymbols];
      
      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
          const symbol = queue.shift();
          if (!symbol) break;

          try {
            const candleRes = await fetch(`https://api.bithumb.com/public/candlestick/${symbol}_KRW/24h`);
            const candleData = await candleRes.json();

            if (candleData.status === "0000") {
              const dailyCandles = candleData.data;
              const reversedDaily = [...dailyCandles].reverse();
              const dailyPrices = reversedDaily.map(c => parseFloat(c[2]));

              const monthlyPrices = [];
              for (let j = 0; j < dailyPrices.length; j += 30) {
                monthlyPrices.push(dailyPrices[j]);
              }

              if (monthlyPrices.length >= 5) {
                const currentPrice = dailyPrices[0];
                const ma120Monthly = calculateMA(monthlyPrices, 120);
                
                let passed = true;

                // Condition 1 Specific Logic: Near MA60 (Above)
                if (conditionId === 1) {
                  const ma60 = calculateMA(dailyPrices, 60);

                  if (ma60 !== null) {
                    const upperLimit = ma60 * 1.05;
                    if (!(currentPrice > ma60 && currentPrice <= upperLimit)) passed = false;
                  } else {
                    passed = false;
                  }
                }
                // Condition 2 Specific Logic: Near MA120 (Above)
                else if (conditionId === 2) {
                  const ma120 = calculateMA(dailyPrices, 120);

                  if (ma120 !== null) {
                    const upperLimit = ma120 * 1.05;
                    if (!(currentPrice > ma120 && currentPrice <= upperLimit)) passed = false;
                  } else {
                    passed = false;
                  }
                }
                // Condition 3 Specific Logic: Perfect Alignment (정배열)
                else if (conditionId === 3) {
                  const ma20 = calculateMA(dailyPrices, 20);
                  const ma60 = calculateMA(dailyPrices, 60);
                  const ma120 = calculateMA(dailyPrices, 120);

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
                // Condition 4 Specific Logic: Exclude Reverse Alignment
                else if (conditionId === 4) {
                  if (ma120Monthly !== null && currentPrice <= ma120Monthly) passed = false;

                  if (passed) {
                    const ma20 = calculateMA(dailyPrices, 20);
                    const ma60 = calculateMA(dailyPrices, 60);
                    const ma120 = calculateMA(dailyPrices, 120);
                    const ma240 = calculateMA(dailyPrices, 240);

                    // NEW: If all daily MAs exist and price is >=5% below ALL of them, exclude
                    if (
                      ma20 !== null && ma60 !== null && ma120 !== null && ma240 !== null &&
                      currentPrice <= ma20 * 0.95 &&
                      currentPrice <= ma60 * 0.95 &&
                      currentPrice <= ma120 * 0.95 &&
                      currentPrice <= ma240 * 0.95
                    ) {
                      passed = false;
                    }

                    if (ma20 !== null && ma60 !== null && ma120 !== null) {
                      if (ma240 !== null) {
                        if (ma20 < ma60 && ma60 < ma120 && ma120 < ma240) passed = false;
                      } else {
                        if (ma20 < ma60 && ma60 < ma120) passed = false;
                      }
                    }
                  }
                }

                if (passed) {
                  const ma20 = calculateMA(dailyPrices, 20);
                  const ma60 = calculateMA(dailyPrices, 60);
                  const ma120 = calculateMA(dailyPrices, 120);
                  const ma240 = calculateMA(dailyPrices, 240);

                  results.push({
                    market: `${symbol}/KRW`,
                    korean_name: symbol,
                    english_name: symbol,
                    price: currentPrice,
                    change: parseFloat(tickerData.data[symbol].fluctate_rate_24H) / 100,
                    volume: parseFloat(tickerData.data[symbol].acc_trade_value_24H),
                    ma20_d: ma20,
                    ma60_d: ma60,
                    ma120_d: ma120,
                    ma240_d: ma240,
                    ma120_m: ma120Monthly,
                    candle_count_m: monthlyPrices.length
                  });
                }
              }
            }
          } catch (err) {}
        }
      });

      await Promise.all(workers);

      const csvHeader = "Market,Price,MA20(D),MA60(D),MA120(D),MA240(D),MA120(M),MonthlyCandles\n";
      const csvRows = results.map(r => 
        `${r.market},${r.price},${r.ma20_d?.toFixed(0) || "N/A"},${r.ma60_d?.toFixed(0) || "N/A"},${r.ma120_d?.toFixed(0) || "N/A"},${r.ma240_d?.toFixed(0) || "N/A"},${r.ma120_m?.toFixed(0) || "N/A"},${r.candle_count_m}`
      ).join("\n");
      const csvContent = csvHeader + csvRows;

      const publicDir = path.join(__dirname, "public");
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
      fs.writeFileSync(path.join(publicDir, "screener_result.csv"), csvContent);

      return res.json({ 
        success: true, 
        count: results.length, 
        data: results,
        downloadUrl: "/screener_result.csv"
      });
    } catch (error) {
      console.error("Error fetching Bithumb data:", error);
      return res.status(500).json({ success: false, error: "Failed to fetch data" });
    }
  });

  app.use(express.static(path.join(__dirname, "public")));

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
