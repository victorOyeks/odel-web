"use client";

import { Button } from "@/components/ui/button";

export function RetryButton({ label = "Try again", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <Button variant={variant} size={variant === "primary" ? "lg" : "md"} leadingIcon="refresh" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
