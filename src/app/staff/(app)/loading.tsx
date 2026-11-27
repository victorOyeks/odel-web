import { SkeletonLine } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <SkeletonLine className="h-6 w-56" />
      <SkeletonLine className="w-full max-w-xl" />
      <div className="flex flex-col rounded-lg border border-line bg-surface">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-line px-6 py-4 first:border-0">
            <SkeletonLine className="w-40" />
            <SkeletonLine className="w-64" />
          </div>
        ))}
      </div>
    </div>
  );
}
