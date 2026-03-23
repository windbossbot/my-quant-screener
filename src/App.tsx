import { useEffect, useState, type FC } from "react";
import { Coins, Download, LoaderCircle, RefreshCw, Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CONDITIONS, type ConditionMeta } from "./conditions";

interface CryptoData {
  market: string;
  korean_name: string;
  english_name: string;
  price: number;
  change: number;
  volume: number;
}

type CachedConditionData = {
  data: CryptoData[];
  lastUpdated: string;
};

type SortDirection = "asc" | "desc";
type SortConfig = {
  key: keyof CryptoData | null;
  direction: SortDirection;
};
type LoadingState = "idle" | "loading" | "refreshing";

const FAVORITES_KEY = "quant-screener-favorites";
const SKELETON_ROWS = 6;
const inflightRequests = new Map<number, Promise<CachedConditionData | null>>();

const getCacheKey = (conditionId: number) => `quant-screener-condition-${conditionId}`;

function readSessionValue<T>(key: string) {
  const rawValue = sessionStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function writeSessionValue<T>(key: string, value: T) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function readCachedConditionData(conditionId: number) {
  return readSessionValue<CachedConditionData>(getCacheKey(conditionId));
}

function writeCachedConditionData(conditionId: number, data: CryptoData[], lastUpdated: string) {
  writeSessionValue(getCacheKey(conditionId), { data, lastUpdated });
}

function readFavorites() {
  const favorites = readSessionValue<string[]>(FAVORITES_KEY);
  return Array.isArray(favorites) ? favorites : [];
}

function writeFavorites(favorites: string[]) {
  writeSessionValue(FAVORITES_KEY, favorites);
}

async function requestConditionData(conditionId: number, forceRefresh = false) {
  if (!forceRefresh) {
    const cachedData = readCachedConditionData(conditionId);
    if (cachedData) {
      return cachedData;
    }

    const inflightRequest = inflightRequests.get(conditionId);
    if (inflightRequest) {
      return inflightRequest;
    }
  }

  const requestPromise = (async () => {
    try {
      const refreshQuery = forceRefresh ? "&refresh=1" : "";
      const response = await fetch(`/api/crypto?conditionId=${conditionId}${refreshQuery}`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error("API returned an unsuccessful response");
      }

      const updatedAt = new Date(result.generatedAt ?? Date.now()).toLocaleTimeString();
      const allData = result.allData as Record<string, CryptoData[]> | undefined;

      if (allData) {
        Object.entries(allData).forEach(([key, value]) => {
          writeCachedConditionData(Number(key), value, updatedAt);
        });
      } else {
        writeCachedConditionData(conditionId, result.data as CryptoData[], updatedAt);
      }

      return readCachedConditionData(conditionId) ?? {
        data: result.data as CryptoData[],
        lastUpdated: updatedAt,
      };
    } catch (error) {
      console.error("Failed to fetch condition data:", error);
      return null;
    } finally {
      if (!forceRefresh) {
        inflightRequests.delete(conditionId);
      }
    }
  })();

  if (!forceRefresh) {
    inflightRequests.set(conditionId, requestPromise);
  }

  return requestPromise;
}

function filterAndSortData(data: CryptoData[], searchTerm: string, sortConfig: SortConfig) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredData = data.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }

    return (
      item.korean_name.toLowerCase().includes(normalizedSearch) ||
      item.english_name.toLowerCase().includes(normalizedSearch) ||
      item.market.toLowerCase().includes(normalizedSearch)
    );
  });

  if (!sortConfig.key) {
    return filteredData;
  }

  return [...filteredData].sort((leftItem, rightItem) => {
    const leftValue = leftItem[sortConfig.key];
    const rightValue = rightItem[sortConfig.key];

    if (leftValue < rightValue) {
      return sortConfig.direction === "asc" ? -1 : 1;
    }

    if (leftValue > rightValue) {
      return sortConfig.direction === "asc" ? 1 : -1;
    }

    return 0;
  });
}

function formatVolume(volume: number) {
  return `₩${(volume / 100000000).toFixed(1)}B`;
}

const SortIcon: FC<{ column: keyof CryptoData; sortConfig: SortConfig }> = ({ column, sortConfig }) => {
  if (sortConfig.key !== column) {
    return <div className="inline-block h-3 w-3 opacity-20" />;
  }

  return sortConfig.direction === "asc"
    ? <TrendingUp className="inline-block h-3 w-3" />
    : <TrendingDown className="inline-block h-3 w-3" />;
};

const ConditionCard: FC<{
  condition: ConditionMeta;
  isActive: boolean;
  onSelect: (conditionId: number) => void;
}> = ({
  condition,
  isActive,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(condition.id)}
      className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
        isActive
          ? "border-[#141414] bg-[#141414] text-[#E4E3E0]"
          : "border-[#141414]/20 opacity-70 hover:opacity-100"
      }`}
    >
      <div className="mb-2 text-xs font-mono uppercase tracking-widest">
        {condition.id.toString().padStart(2, "0")}
      </div>
      <div className="text-base font-semibold tracking-tight">{condition.title}</div>
      <div className="mt-1 text-xs leading-relaxed opacity-70">{condition.description}</div>
    </button>
  );
};

const LoadingBanner: FC<{
  loadingState: LoadingState;
  selectedCondition: ConditionMeta;
  hasData: boolean;
}> = ({
  loadingState,
  selectedCondition,
  hasData,
}) => {
  if (loadingState === "idle") {
    return null;
  }

  const isRefreshing = loadingState === "refreshing";
  const title = isRefreshing
    ? `${selectedCondition.title} 다시 계산 중`
    : `${selectedCondition.title} 불러오는 중`;
  const description = hasData
    ? "기존 목록은 유지한 채 최신 후보를 다시 계산하고 있습니다."
    : "빗썸 공개 데이터를 조회해서 조건에 맞는 후보를 만들고 있습니다.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-6 rounded-2xl border border-[#141414]/15 bg-[#141414] px-4 py-4 text-[#E4E3E0]"
    >
      <div className="flex items-start gap-3">
        <LoaderCircle className="mt-0.5 h-5 w-5 animate-spin" />
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide">{title}</div>
          <div className="mt-1 text-sm leading-relaxed opacity-75">{description}</div>
        </div>
      </div>
    </motion.div>
  );
};

function LoadingSkeleton() {
  return (
    <div className="border-t border-[#141414]">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div
          key={`skeleton-${index}`}
          className="grid grid-cols-12 gap-4 border-b border-[#141414]/10 p-4 animate-pulse"
        >
          <div className="col-span-1 h-5 rounded bg-[#141414]/10" />
          <div className="col-span-4 space-y-2">
            <div className="h-5 w-24 rounded bg-[#141414]/10" />
            <div className="h-4 w-16 rounded bg-[#141414]/10" />
          </div>
          <div className="col-span-2 h-5 rounded bg-[#141414]/10" />
          <div className="col-span-2 h-5 rounded bg-[#141414]/10" />
          <div className="col-span-3 h-5 rounded bg-[#141414]/10" />
        </div>
      ))}
    </div>
  );
}

const ResultRow: FC<{
  item: CryptoData;
  index: number;
  highlighted: boolean;
  isFavorite: boolean;
  onToggleFavorite: (market: string) => void;
}> = ({
  item,
  index,
  highlighted,
  isFavorite,
  onToggleFavorite,
}) => {
  const ticker = item.market.split("/")[0];

  return (
    <motion.div
      key={item.market}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: index * 0.01 }}
      className={`grid grid-cols-12 gap-4 border-b border-[#141414]/10 p-4 transition-colors ${
        highlighted ? "bg-[#141414]/5" : ""
      }`}
    >
      <div className="data-value col-span-1 flex items-center gap-2 opacity-50">
        <button
          type="button"
          onClick={() => onToggleFavorite(item.market)}
          className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-[#141414] text-[#141414]" : "text-[#141414]/40"}`} />
        </button>
        <span>{(index + 1).toString().padStart(2, "0")}</span>
      </div>
      <div className="col-span-4 flex flex-col">
        <span className="text-lg font-semibold leading-tight tracking-normal">{ticker}</span>
        <span className="mt-1 text-xs font-medium leading-tight opacity-65">{item.korean_name}</span>
      </div>
      <div className="data-value col-span-2 text-right font-medium">
        {item.price.toLocaleString()}
      </div>
      <div className={`col-span-2 flex items-center justify-end gap-1 text-right font-mono text-xs ${
        item.change > 0 ? "text-emerald-600" : "text-rose-600"
      }`}
      >
        {item.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {(item.change * 100).toFixed(2)}%
      </div>
      <div className="data-value col-span-3 text-right opacity-70">
        {formatVolume(item.volume)}
      </div>
    </motion.div>
  );
};

export default function App() {
  const [data, setData] = useState<CryptoData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondition, setSelectedCondition] = useState(CONDITIONS[0].id);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "desc",
  });

  const selectedConditionMeta = CONDITIONS.find((condition) => condition.id === selectedCondition) ?? CONDITIONS[0];
  const isLoading = loadingState !== "idle";

  const fetchData = async (forceRefresh = false) => {
    setErrorMessage(null);

    if (!forceRefresh) {
      const cachedData = readCachedConditionData(selectedCondition);
      if (cachedData) {
        setData(cachedData.data);
        setLastUpdated(cachedData.lastUpdated);
        return;
      }
    }

    setLoadingState(forceRefresh ? "refreshing" : "loading");

    try {
      const result = await requestConditionData(selectedCondition, forceRefresh);
      if (!result) {
        setErrorMessage("조건 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setData(result.data);
      setLastUpdated(result.lastUpdated);
    } finally {
      setLoadingState("idle");
    }
  };

  useEffect(() => {
    void fetchData();
  }, [selectedCondition]);

  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const handleReload = () => {
    CONDITIONS.forEach((condition) => {
      sessionStorage.removeItem(getCacheKey(condition.id));
    });
    void fetchData(true);
  };

  const handleSort = (key: keyof CryptoData) => {
    const nextDirection: SortDirection =
      sortConfig.key === key && sortConfig.direction === "desc" ? "asc" : "desc";
    setSortConfig({ key, direction: nextDirection });
  };

  const toggleFavorite = (market: string) => {
    const nextFavorites = favorites.includes(market)
      ? favorites.filter((favorite) => favorite !== market)
      : [...favorites, market];

    setFavorites(nextFavorites);
    writeFavorites(nextFavorites);
  };

  const sortedData = filterAndSortData(data, searchTerm, sortConfig);
  const favoriteItems = sortedData.filter((item) => favorites.includes(item.market));
  const otherItems = sortedData.filter((item) => !favorites.includes(item.market));

  return (
    <div className="min-h-screen bg-[#E4E3E0] p-4 font-sans text-[#141414] md:p-8">
      <header className="mx-auto mb-12 flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#141414]">
              <Coins className="h-5 w-5 text-[#E4E3E0]" />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest opacity-50">QuantScreener / v1.0</span>
          </div>
          <h1 className="text-5xl leading-none tracking-tighter md:text-7xl">
            Quant <span className="font-bold">Screener</span>
          </h1>

          <div className="mt-8 space-y-3">
            <span className="block text-[10px] font-mono uppercase opacity-40">Condition Slot:</span>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {CONDITIONS.map((condition) => (
                <ConditionCard
                  key={condition.id}
                  condition={condition}
                  isActive={selectedCondition === condition.id}
                  onSelect={setSelectedCondition}
                />
              ))}
            </div>
            <div className="max-w-3xl text-sm leading-relaxed opacity-60">
              선택 조건 / {selectedConditionMeta.title} / {selectedConditionMeta.description}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReload}
            disabled={isLoading}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-[#141414] px-6 py-3 transition-all hover:bg-[#141414] hover:text-[#E4E3E0] disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="text-sm font-medium uppercase tracking-wider">Reload</span>
          </button>
          <a
            href="/screener_result.csv"
            download
            className="flex cursor-pointer items-center gap-2 rounded-full border border-[#141414] px-6 py-3 transition-all hover:bg-[#141414] hover:text-[#E4E3E0]"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm font-medium uppercase tracking-wider">Export CSV</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl">
        <AnimatePresence mode="wait">
          <LoadingBanner
            key={loadingState}
            loadingState={loadingState}
            selectedCondition={selectedConditionMeta}
            hasData={data.length > 0}
          />
        </AnimatePresence>

        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <div className="mb-8 flex items-center justify-between border-b border-[#141414] pb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              placeholder="Search by name or ticker..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full bg-transparent py-2 pl-10 pr-4 text-sm focus:outline-none"
            />
          </div>
          <div className="text-right text-[11px] font-mono uppercase opacity-50">
            <div>{isLoading ? "Syncing..." : `Last Sync: ${lastUpdated || "Never"}`}</div>
            <div className="mt-1">{sortedData.length} results</div>
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
                  className="cursor-pointer rounded-full border border-[#141414]/20 px-3 py-1 text-xs transition-colors hover:bg-[#141414] hover:text-[#E4E3E0]"
                >
                  {item.korean_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-4 mb-4 px-4">
          <div className="col-header col-span-1">#</div>
          <div className="col-header col-span-4">Asset</div>
          <button
            type="button"
            onClick={() => handleSort("price")}
            className="col-header col-span-2 cursor-pointer text-right transition-opacity hover:opacity-100"
          >
            Price (KRW) <SortIcon column="price" sortConfig={sortConfig} />
          </button>
          <button
            type="button"
            onClick={() => handleSort("change")}
            className="col-header col-span-2 cursor-pointer text-right transition-opacity hover:opacity-100"
          >
            24h Change <SortIcon column="change" sortConfig={sortConfig} />
          </button>
          <button
            type="button"
            onClick={() => handleSort("volume")}
            className="col-header col-span-3 cursor-pointer text-right transition-opacity hover:opacity-100"
          >
            Volume (24h) <SortIcon column="volume" sortConfig={sortConfig} />
          </button>
        </div>

        {isLoading && data.length === 0 ? (
          <LoadingSkeleton />
        ) : (
          <div className="border-t border-[#141414]">
            <AnimatePresence mode="popLayout">
              {favoriteItems.map((item, index) => (
                <ResultRow
                  key={item.market}
                  item={item}
                  index={index}
                  highlighted
                  isFavorite={favorites.includes(item.market)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
              {otherItems.map((item, index) => (
                <ResultRow
                  key={item.market}
                  item={item}
                  index={favoriteItems.length + index}
                  highlighted={false}
                  isFavorite={favorites.includes(item.market)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </AnimatePresence>

            {sortedData.length === 0 && !isLoading && (
              <div className="py-20 text-center font-serif text-2xl italic opacity-30">
                No assets found matching your criteria.
              </div>
            )}
          </div>
        )}
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
      ` }}
      />
    </div>
  );
}
