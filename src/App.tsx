import { useState, useEffect } from "react";
import { Download, RefreshCw, TrendingUp, TrendingDown, Coins, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CryptoData {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
}

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondition, setSelectedCondition] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof CryptoData | null, direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'desc'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crypto?conditionId=${selectedCondition}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCondition]);

  const handleSort = (key: keyof CryptoData) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
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

  const SortIcon = ({ column }: { column: keyof CryptoData }) => {
    if (sortConfig.key !== column) return <div className="w-3 h-3 opacity-20 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? 
      <TrendingUp className="w-3 h-3 ml-1 inline-block rotate-0 transition-transform" /> : 
      <TrendingDown className="w-3 h-3 ml-1 inline-block rotate-0 transition-transform" />;
  };

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
          
          <div className="mt-8 flex items-center gap-4">
            <span className="text-[10px] font-mono uppercase opacity-40">Condition Slot:</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((id) => (
                <button
                  key={id}
                  onClick={() => setSelectedCondition(id)}
                  className={`px-4 py-1 text-xs font-mono border transition-all cursor-pointer ${
                    selectedCondition === id 
                      ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' 
                      : 'border-[#141414]/20 opacity-40 hover:opacity-100'
                  }`}
                >
                  {id.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
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
            {sortedData.map((item, index) => (
              <motion.div 
                key={item.market}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.01 }}
                className="grid grid-cols-12 gap-4 p-4 border-b border-[#141414]/10 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group cursor-pointer"
              >
                <div className="col-span-1 data-value opacity-50">{(index + 1).toString().padStart(2, '0')}</div>
                <div className="col-span-4 flex flex-col">
                  <span className="font-bold tracking-tight">{item.korean_name}</span>
                  <span className="text-[10px] font-mono opacity-50 group-hover:opacity-70">{item.market}</span>
                </div>
                <div className="col-span-2 text-right data-value font-medium">
                  {item.price.toLocaleString()}
                </div>
                <div className={`col-span-2 text-right flex items-center justify-end gap-1 font-mono text-xs ${item.change > 0 ? 'text-emerald-600 group-hover:text-emerald-400' : 'text-rose-600 group-hover:text-rose-400'}`}>
                  {item.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {(item.change * 100).toFixed(2)}%
                </div>
                <div className="col-span-3 text-right data-value opacity-70 group-hover:opacity-100">
                  ₩{(item.volume / 100000000).toFixed(1)}B
                </div>
              </motion.div>
            ))}
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

