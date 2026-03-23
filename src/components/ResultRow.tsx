import type { FC } from "react";
import { Star, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { formatVolume } from "../lib/screenerClient";
import type { CryptoData } from "../types";

export const ResultRow: FC<{
  item: CryptoData;
  index: number;
  highlighted: boolean;
  isFavorite: boolean;
  onToggleFavorite: (market: string) => void;
}> = ({ item, index, highlighted, isFavorite, onToggleFavorite }) => {
  const ticker = item.market.split("/")[0];

  return (
    <motion.div
      key={item.market}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: index * 0.01 }}
      className={`grid grid-cols-12 gap-4 px-5 py-5 transition-colors ${
        highlighted ? "bg-[#141414]/[0.035]" : "bg-transparent"
      }`}
    >
      <div className="data-value col-span-1 flex items-center gap-2 text-[#141414]/55">
        <button
          type="button"
          onClick={() => onToggleFavorite(item.market)}
          className="cursor-pointer rounded-full p-1 transition-colors hover:bg-[#141414]/6"
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-[#C65A2E] text-[#C65A2E]" : "text-[#141414]/35"}`} />
        </button>
        <span>{(index + 1).toString().padStart(2, "0")}</span>
      </div>
      <div className="col-span-4 flex flex-col">
        <span className="text-lg font-semibold leading-tight tracking-[-0.02em]">{ticker}</span>
        <span className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#141414]/45">{item.korean_name}</span>
      </div>
      <div className="data-value col-span-2 text-right font-medium">
        {item.price.toLocaleString()}
      </div>
      <div className={`col-span-2 flex items-center justify-end gap-1 text-right font-mono text-xs ${
        item.change > 0 ? "text-emerald-700" : "text-rose-700"
      }`}
      >
        {item.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {(item.change * 100).toFixed(2)}%
      </div>
      <div className="data-value col-span-3 text-right text-[#141414]/72">
        {formatVolume(item.volume)}
      </div>
    </motion.div>
  );
};
