import type { FC } from "react";
import type { ConditionMeta } from "../conditions";

function getTimeframeAccent(timeframe: string) {
  switch (timeframe) {
    case "4시간봉":
      return {
        badge: "bg-[#C65A2E] text-white",
        border: "border-[#C65A2E]/30",
        glow: "shadow-[0_20px_60px_rgba(198,90,46,0.18)]",
      };
    case "일봉":
      return {
        badge: "bg-[#295A52] text-white",
        border: "border-[#295A52]/30",
        glow: "shadow-[0_20px_60px_rgba(41,90,82,0.16)]",
      };
    case "주봉":
      return {
        badge: "bg-[#4F4A8A] text-white",
        border: "border-[#4F4A8A]/30",
        glow: "shadow-[0_20px_60px_rgba(79,74,138,0.16)]",
      };
    default:
      return {
        badge: "bg-[#7D5A2F] text-white",
        border: "border-[#7D5A2F]/30",
        glow: "shadow-[0_20px_60px_rgba(125,90,47,0.16)]",
      };
  }
}

export const ConditionCard: FC<{
  condition: ConditionMeta;
  isActive: boolean;
  onSelect: (conditionId: number) => void;
}> = ({ condition, isActive, onSelect }) => {
  const accent = getTimeframeAccent(condition.timeframe);

  return (
    <button
      type="button"
      onClick={() => onSelect(condition.id)}
      className={`relative overflow-hidden rounded-[28px] border p-5 text-left transition-all duration-300 cursor-pointer ${
        isActive
          ? `-translate-y-1 border-[#141414] bg-[#141414] text-[#F8F2E8] ${accent.glow}`
          : `border-[#141414]/12 bg-[#F6F0E5]/85 text-[#141414] hover:-translate-y-1 hover:border-[#141414]/30 hover:bg-[#FBF8F2]`
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-60" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${isActive ? "bg-white/12 text-white" : accent.badge}`}>
          {condition.timeframe}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono tracking-[0.2em] ${isActive ? "border-white/15 text-white/70" : `${accent.border} text-[#141414]/55`}`}>
          {condition.id.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="max-w-[22rem] text-lg font-semibold leading-tight tracking-[-0.03em]">
        {condition.title}
      </div>
      <div className={`mt-3 text-sm leading-relaxed ${isActive ? "text-white/72" : "text-[#141414]/62"}`}>
        {condition.description}
      </div>
    </button>
  );
};
