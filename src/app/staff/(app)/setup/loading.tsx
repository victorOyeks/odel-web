import { SkeletonLine } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading the setup checklist</span>
      <SkeletonLine className="h-6 w-56" />
      <SkeletonLine className="w-full max-w-xl" />
      <div className="skeleton h-[74px] rounded-lg border border-line bg-surface" />
      <div className="flex flex-col rounded-lg border border-line bg-surface">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-line px-6 py-4 first:border-0">
            <div className="skeleton size-8 rounded-full bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonLine className="w-48" />
              <SkeletonLine className="h-2.5 w-64" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
