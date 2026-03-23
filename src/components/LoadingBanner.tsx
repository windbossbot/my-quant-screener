import type { FC } from "react";
import { LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import type { ConditionMeta } from "../conditions";
import type { LoadingState } from "../types";

export const LoadingBanner: FC<{
  loadingState: LoadingState;
  selectedCondition: ConditionMeta;
  hasData: boolean;
}> = ({ loadingState, selectedCondition, hasData }) => {
  if (loadingState === "idle") {
    return null;
  }

  const isRefreshing = loadingState === "refreshing";
  const title = isRefreshing
    ? `${selectedCondition.title} 다시 계산 중`
    : `${selectedCondition.title} 불러오는 중`;
  const description = hasData
    ? "현재 결과는 유지한 채 새 후보를 다시 계산하고 있습니다."
    : "빗썸 데이터를 받아 조건에 맞는 후보를 계산하고 있습니다.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative overflow-hidden rounded-[28px] border border-[#141414]/10 bg-[#141414] px-5 py-5 text-[#F8F2E8] shadow-[0_24px_80px_rgba(20,20,20,0.16)]"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C65A2E] via-[#D68D45] to-[#295A52]" />
      <div className="flex items-start gap-4">
        <div className="mt-0.5 rounded-2xl bg-white/10 p-2">
          <LoaderCircle className="h-5 w-5 animate-spin" />
        </div>
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em]">{title}</div>
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-white/72">{description}</div>
        </div>
      </div>
    </motion.div>
  );
};
