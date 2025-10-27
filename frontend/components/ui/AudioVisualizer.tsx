// components/ui/AudioVisualizer.tsx
"use client";

import { cn } from "@/lib/utils";
import { useSpring, animated } from "@react-spring/web";

interface AudioVisualizerProps {
  isActive: boolean;
  variant?: "Jeet" | "user";
  amplitude: number; // A value from 0 to 1+
}

/**
 * A "breathing" orb component with gradients and spring animations.
 */
export default function AudioVisualizer({
  isActive,
  variant = "user",
  amplitude,
}: AudioVisualizerProps) {
  const isJeetSpeaking = isActive && variant === "Jeet";
  const isUserRecording = isActive && variant === "user";

  // --- Spring for User Recording (Breathing) ---
  const breathingSpring = useSpring({
    loop: { reverse: true },
    from: { scale: 1, opacity: 0.6 },
    to: { scale: 1.15, opacity: 0.2 },
    config: { duration: 1500 },
    pause: !isUserRecording,
  });

  // --- Spring for Jeet Speaking (Reactive) ---
  const reactiveAmplitude = Math.min(amplitude * 1.5, 1.2);
  const reactiveSpring = useSpring({
    scale: 1 + reactiveAmplitude,
    opacity: 0.3 + reactiveAmplitude * 0.7, // More subtle opacity
    config: { tension: 180, friction: 22 },
  });
  
  // --- Spring for the Inner Orb ---
  const innerSpring = useSpring({
    scale: isJeetSpeaking ? 1.0 + reactiveAmplitude * 0.2 : isUserRecording ? 1.05 : 1.0,
    config: { tension: 180, friction: 22 },
  });

  // Determine which spring to use for the outer orbs
  const springProps = isUserRecording ? breathingSpring : reactiveSpring;

  // --- ✅ NEW GRADIENT STYLES ---
  const JeetGradient = "radial-gradient(circle, rgba(96,165,250,0.5) 0%, rgba(37,99,235,0.0) 70%)";
  const userGradient = "radial-gradient(circle, rgba(74,222,128,0.5) 0%, rgba(22,163,74,0.0) 70%)";
  
  const innerJeetCore = "radial-gradient(circle, rgba(147,197,253,1) 0%, rgba(59,130,246,1) 100%)";
  const innerUserCore = "radial-gradient(circle, rgba(134,239,172,1) 0%, rgba(34,197,94,1) 100%)";
  const innerIdleCore = "radial-gradient(circle, rgba(156,163,175,1) 0%, rgba(107,114,128,1) 100%)";
  
  const gradientStyle = {
    background: variant === 'Jeet' ? JeetGradient : userGradient,
  };
  
  const innerCoreStyle = {
    background: isActive 
      ? (variant === 'Jeet' ? innerJeetCore : innerUserCore) 
      : innerIdleCore,
  };
  // --- END NEW STYLES ---

  return (
    <div className="relative h-48 w-48 flex items-center justify-center">
      {/* Inner Orb */}
      <animated.div
        className="h-16 w-16 rounded-full"
        style={{
          ...innerCoreStyle,
          scale: innerSpring.scale,
        }}
      />

      {/* Pulsating Outer Orbs (all spring-driven) */}
      <animated.div
        className="absolute rounded-full h-32 w-32"
        style={{
          ...gradientStyle,
          scale: springProps.scale,
          opacity: isActive ? springProps.opacity : 0,
        }}
      />
      <animated.div
        className="absolute rounded-full h-48 w-48"
        style={{
          ...gradientStyle,
          scale: springProps.scale,
          opacity: isActive ? springProps.opacity : 0,
        }}
      />
    </div>
  );
}