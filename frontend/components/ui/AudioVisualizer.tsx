// components/ui/AudioVisualizer.tsx
"use client";

import { cn } from "@/lib/utils"; // Assumes you have shadcn/tailwind merge setup

interface AudioVisualizerProps {
  isActive: boolean;
  variant?: "alex" | "user";
}

/**
 * A simple, CSS-only "breathing" orb component to visualize speaking or listening.
 * Relies on the 'breathing' keyframes in globals.css
 */
export default function AudioVisualizer({
  isActive,
  variant = "user",
}: AudioVisualizerProps) {
  const baseClasses =
    "absolute rounded-full transition-all duration-300 ease-in-out";

  // We use 'opacity-0' when inactive, and a visible opacity when active.
  // The 'animate-breathing' class is applied when active.
  const activeClasses = isActive
    ? "animate-breathing"
    : "opacity-0 scale-75";

  const variantClasses =
    variant === "alex"
      ? "bg-blue-400"
      : "bg-green-400";

  return (
    <div className="relative h-48 w-48 flex items-center justify-center">
      {/* Static Inner Orb (always visible, provides a base) */}
      <div
        className={cn(
          "h-16 w-16 rounded-full transition-all duration-300",
          isActive ? (variant === 'alex' ? 'bg-blue-500' : 'bg-green-500') : "bg-gray-600",
        )}
      />

      {/* Pulsating Outer Orbs */}
      <div
        className={cn(baseClasses, variantClasses, activeClasses, "h-32 w-32")}
        style={{ animationDelay: "0s" }}
      />
      <div
        className={cn(baseClasses, variantClasses, activeClasses, "h-48 w-48")}
        style={{ animationDelay: "0.5s" }}
      />
    </div>
  );
}