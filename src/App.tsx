import { useState, useEffect } from "react";
import { Download, RefreshCw, TrendingUp, TrendingDown, Coins, Search, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CryptoData {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
}

type CachedConditionData = { data: CryptoData[]; lastUpdated: string };

const CONDITIONS = [
  { id: 1, timeframe: "4시간봉", title: "20·120선 범위", description: "4시간봉 기준 현재가가 20선 대비 +5%~-1%, 120선 대비 +2%~-10% 범위이고 일봉 20선 대비 -3% 이상이며 상위 매수 10호가 누적금액이 1억 미만인 종목" },
  { id: 2, timeframe: "4시간봉", title: "정배열", description: "4시간봉 20선, 60선, 120선이 상승 정배열이며 상위 매수 10호가 누적금액이 1억 미만인 종목" },
  { id: 3, timeframe: "4시간봉", title: "30·120선 범위", description: "4시간봉 기준 현재가가 30선 대비 +5%~-1%, 120선 대비 +2%~-10% 범위이고 일봉 30선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목" },
  { id: 4, timeframe: "4시간봉", title: "30·120 + 일봉20", description: "4시간봉 기준 현재가가 30선 대비 +5%~-1%, 120선 대비 +2%~-10% 범위이고 일봉 20선 위에 있으며 상위 매수 10호가 누적금액이 1억 미만인 종목" },
  { id: 5, timeframe: "일봉", title: "정배열", description: "일봉 20일선, 60일선, 120일선이 상승 정배열인 종목" },
  { id: 6, timeframe: "일봉", title: "120선 근접", description: "일봉 120일선 대비 -1%~+5% 범위에 있는 종목" },
  { id: 7, timeframe: "주봉", title: "정배열", description: "주봉이 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목" },
  { id: 8, timeframe: "월봉", title: "정배열", description: "월봉이 정배열이고 현재가가 일봉 20일선 위아래 5% 이내인 종목" },
] as const;

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondition, setSelectedCondition] = useState(1);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof CryptoData | null, direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'desc'
  });

  const getCacheKey = (conditionId: number) => `quant-screener-condition-${conditionId}`;
  const getPendingKey = (conditionId: number) => `quant-screener-pending-${conditionId}`;
  const favoritesKey = "quant-screener-favorites";

  const readCachedData = (conditionId: number) => {
    const cached = sessionStorage.getItem(getCacheKey(conditionId));
    if (!cached) {
      return null;
    }

    try {
      return JSON.parse(cached) as CachedConditionData;
    } catch {
      sessionStorage.removeItem(getCacheKey(conditionId));
      return null;
    }
  };

  const writeCachedData = (conditionId: number, nextData: CryptoData[], updatedAt: string) => {
    sessionStorage.setItem(
      getCacheKey(conditionId),
      JSON.stringify({ data: nextData, lastUpdated: updatedAt }),
    );
  };

  const readFavorites = () => {
    const cached = sessionStorage.getItem(favoritesKey);
    if (!cached) {
      return [];
    }

    try {
      const parsed = JSON.parse(cached) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      sessionStorage.removeItem(favoritesKey);
      return [];
    }
  };

  const fetchConditionData = async (conditionId: number, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = readCachedData(conditionId);
      if (cached) {
        return cached;
      }
    }

    if (sessionStorage.getItem(getPendingKey(conditionId))) {
      return null;
    }

    sessionStorage.setItem(getPendingKey(conditionId), "true");
    try {
      const refreshQuery = forceRefresh ? "&refresh=1" : "";
      const response = await fetch(`/api/crypto?conditionId=${conditionId}${refreshQuery}`);
      const result = await response.json();
      if (!result.success) {
        return null;
      }

      const updatedAt = new Date().toLocaleTimeString();
      if (result.allData) {
        Object.entries(result.allData).forEach(([key, value]) => {
          writeCachedData(Number(key), value as CryptoData[], updatedAt);
        });
      } else {
        writeCachedData(conditionId, result.data, updatedAt);
      }

      return readCachedData(conditionId) ?? { data: result.data as CryptoData[], lastUpdated: updatedAt };
    } catch (error) {
      console.error("Failed to fetch data:", error);
      return null;
    } finally {
      sessionStorage.removeItem(getPendingKey(conditionId));
    }
  };

  const fetchData = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = readCachedData(selectedCondition);
      if (cached) {
        setData(cached.data);
        setLastUpdated(cached.lastUpdated);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await fetchConditionData(selectedCondition, forceRefresh);
      if (result) {
        setData(result.data);
        setLastUpdated(result.lastUpdated);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCondition]);

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const handleReload = () => {
    CONDITIONS.forEach((condition) => {
      sessionStorage.removeItem(getCacheKey(condition.id));
      sessionStorage.removeItem(getPendingKey(condition.id));
    });
    fetchData(true);
  };

  const handleSort = (key: keyof CryptoData) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const toggleFavorite = (market: string) => {
    const nextFavorites = favorites.includes(market)
      ? favorites.filter((favorite) => favorite !== market)
      : [...favorites, market];

    setFavorites(nextFavorites);
    sessionStorage.setItem(favoritesKey, JSON.stringify(nextFavorites));
  };

  const getSortedData = () => {
    const filtered = data.filter(item => 
      item.korean_name.includes(searchTerm) || 
      item.english_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.market.includes(searchTerm.toUpperCase())
    );

    if (sortConfig.key) {
      return [...filtered].sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return filtered;
  };

  const sortedData = getSortedData();
  const favoriteItems = sortedData.filter((item) => favorites.includes(item.market));
  const otherItems = sortedData.filter((item) => !favorites.includes(item.market));
  const selectedConditionMeta = CONDITIONS.find((condition) => condition.id === selectedCondition);

  const SortIcon = ({ column }: { column: keyof CryptoData }) => {
    if (sortConfig.key !== column) return <div className="w-3 h-3 opacity-20 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? 
      <TrendingUp className="w-3 h-3 ml-1 inline-block rotate-0 transition-transform" /> : 
      <TrendingDown className="w-3 h-3 ml-1 inline-block rotate-0 transition-transform" />;
  };

  const renderRow = (item: CryptoData, index: number, highlighted = false) => (
    <motion.div
      key={item.market}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.01 }}
      className={`grid grid-cols-12 gap-4 p-4 border-b border-[#141414]/10 transition-colors group ${highlighted ? "bg-[#141414]/5" : ""}`}
    >
      <div className="col-span-1 flex items-center gap-2 data-value opacity-50">
        <button
          type="button"
          onClick={() => toggleFavorite(item.market)}
          className="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
          aria-label={favorites.includes(item.market) ? "Remove favorite" : "Add favorite"}
        >
          <Star
            className={`w-4 h-4 ${favorites.includes(item.market) ? "fill-[#141414] text-[#141414]" : "text-[#141414]/40"}`}
          />
        </button>
        <span>{(index + 1).toString().padStart(2, '0')}</span>
      </div>
      <div className="col-span-4 flex flex-col">
        <span className="text-lg font-semibold tracking-normal leading-tight">{item.market.split("/")[0]}</span>
        <span className="mt-1 text-xs font-sans font-medium leading-tight opacity-65">{item.korean_name}</span>
      </div>
      <div className="col-span-2 text-right data-value font-medium">
        {item.price.toLocaleString()}
      </div>
      <div className={`col-span-2 text-right flex items-center justify-end gap-1 font-mono text-xs ${item.change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {item.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {(item.change * 100).toFixed(2)}%
      </div>
      <div className="col-span-3 text-right data-value opacity-70">
        ₩{(item.volume / 100000000).toFixed(1)}B
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-[#141414] rounded flex items-center justify-center">
              <Coins className="text-[#E4E3E0] w-5 h-5" />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest opacity-50">QuantScreener / v1.0</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif italic tracking-tighter leading-none">
            Quant <span className="not-italic font-sans font-bold">Screener</span>
          </h1>
          
          <div className="mt-8 space-y-3">
            <span className="block text-[10px] font-mono uppercase opacity-40">Condition Slot:</span>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {CONDITIONS.map((condition) => (
                <button
                  key={condition.id}
                  onClick={() => setSelectedCondition(condition.id)}
                  className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                    selectedCondition === condition.id
                      ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]'
                      : 'border-[#141414]/20 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="mb-2 text-xs font-mono uppercase tracking-widest">
                    {condition.id.toString().padStart(2, '0')}
                  </div>
                  <div className="text-base font-semibold tracking-tight">{condition.title}</div>
                  <div className="mt-1 text-xs leading-relaxed opacity-70">{condition.description}</div>
                </button>
              ))}
            </div>
            {selectedConditionMeta && (
              <div className="max-w-2xl text-sm leading-relaxed opacity-60">
                {selectedConditionMeta.timeframe} / {selectedConditionMeta.description}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleReload}
            className="flex items-center gap-2 px-6 py-3 border border-[#141414] rounded-full hover:bg-[#141414] hover:text-[#E4E3E0] transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="text-sm font-medium uppercase tracking-wider">Reload</span>
          </button>
          <a 
            href="/screener_result.csv" 
            download
            className="flex items-center gap-2 px-6 py-3 border border-[#141414] rounded-full hover:bg-[#141414] hover:text-[#E4E3E0] transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium uppercase tracking-wider">Export CSV</span>
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between border-b border-[#141414] pb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input 
              type="text" 
              placeholder="Search by name or ticker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent pl-10 pr-4 py-2 focus:outline-none text-sm"
            />
          </div>
          <div className="text-[11px] font-mono opacity-50 uppercase">
            {loading ? "Updating..." : `Last Sync: ${lastUpdated || "Never"}`}
          </div>
        </div>

        {favoriteItems.length > 0 && (
          <div className="mb-8 rounded-2xl border border-[#141414]/15 p-4">
            <div className="mb-3 text-[11px] font-mono uppercase tracking-widest opacity-50">
              Favorites In This Session
            </div>
            <div className="flex flex-wrap gap-2">
              {favoriteItems.map((item) => (
                <button
                  key={item.market}
                  type="button"
                  onClick={() => setSearchTerm(item.korean_name)}
                  className="rounded-full border border-[#141414]/20 px-3 py-1 text-xs hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors cursor-pointer"
                >
                  {item.korean_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 mb-4 px-4">
          <div className="col-span-1 col-header">#</div>
          <div className="col-span-4 col-header">Asset</div>
          <div 
            className="col-span-2 col-header text-right cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => handleSort('price')}
          >
            Price (KRW) <SortIcon column="price" />
          </div>
          <div 
            className="col-span-2 col-header text-right cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => handleSort('change')}
          >
            24h Change <SortIcon column="change" />
          </div>
          <div 
            className="col-span-3 col-header text-right cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => handleSort('volume')}
          >
            Volume (24h) <SortIcon column="volume" />
          </div>
        </div>

        <div className="border-t border-[#141414]">
          <AnimatePresence mode="popLayout">
            {favoriteItems.map((item, index) => renderRow(item, index, true))}
            {otherItems.map((item, index) => renderRow(item, favoriteItems.length + index))}
          </AnimatePresence>

          {sortedData.length === 0 && !loading && (
            <div className="py-20 text-center opacity-30 italic font-serif text-2xl">
              No assets found matching your criteria.
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .col-header {
          font-family: 'Georgia', serif;
          font-style: italic;
          font-size: 11px;
          opacity: 0.5;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .data-value {
          font-family: 'Courier New', Courier, monospace;
          letter-spacing: -0.02em;
        }
      `}} />
    </div>
  );
}

