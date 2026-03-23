export function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#141414]/10 bg-[#FBF8F2] shadow-[0_24px_80px_rgba(20,20,20,0.06)]">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={`skeleton-${index}`}
          className="grid animate-pulse grid-cols-12 gap-4 border-b border-[#141414]/8 px-5 py-5 last:border-b-0"
        >
          <div className="col-span-1 h-6 rounded-full bg-[#141414]/8" />
          <div className="col-span-4 space-y-2">
            <div className="h-5 w-28 rounded-full bg-[#141414]/8" />
            <div className="h-4 w-20 rounded-full bg-[#141414]/8" />
          </div>
          <div className="col-span-2 h-5 rounded-full bg-[#141414]/8" />
          <div className="col-span-2 h-5 rounded-full bg-[#141414]/8" />
          <div className="col-span-3 h-5 rounded-full bg-[#141414]/8" />
        </div>
      ))}
    </div>
  );
}
