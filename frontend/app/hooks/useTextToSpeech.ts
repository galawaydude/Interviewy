// app/hooks/useTextToSpeech.ts
"use client";

import { useState, useRef, useCallback, RefObject } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

// Prop for the audio element
interface UseTextToSpeechProps {
  audioElementRef: RefObject<HTMLAudioElement | null>;
}

export function useTextToSpeech({ audioElementRef }: UseTextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  // Refs for Audio Analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Function to initialize the AudioContext AND analysis graph
  const initAudioSystem = useCallback(() => {
    // Only run once
    if (!audioContextRef.current) {
      const audioEl = audioElementRef.current;
      if (!audioEl) {
        console.error("[TTS-Hook] Audio element not ready for init.");
        setTtsError("Audio element not ready.");
        return;
      }

      try {
        const context = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        audioContextRef.current = context;

        analyserRef.current = context.createAnalyser();
        analyserRef.current.fftSize = 64;

        dataArrayRef.current = new Uint8Array(
          analyserRef.current.frequencyBinCount
        );

        sourceNodeRef.current = context.createMediaElementSource(audioEl);
        sourceNodeRef.current.connect(analyserRef.current);
        analyserRef.current.connect(context.destination);

        console.log("[TTS-Hook] AudioContext and analysis graph initialized.");
      } catch (e) {
        console.error("Failed to initialize AudioContext:", e);
        setTtsError("Could not initialize audio system.");
      }
    }
  }, [audioElementRef]);

  // Function to start audio analysis loop
  const startAnalysis = useCallback(() => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!analyser || !dataArray || !audioContextRef.current) {
      return;
    }

    const loop = () => {
      if (audioContextRef.current?.state === "running") {
        // Your fix for the type error
        analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalizedAmplitude = Math.pow(avg / 128, 2);
        setAmplitude(normalizedAmplitude);

        animationFrameRef.current = requestAnimationFrame(loop);
      } else {
        setAmplitude(0);
      }
    };
    loop();
  }, []);

  // Function to stop audio analysis loop
  const stopAnalysis = useCallback(() => {
    cancelAnimationFrame(animationFrameRef.current);
    setAmplitude(0);
    console.log("[TTS-Hook] Analysis stopped.");
  }, []);

  // Function to stop any currently playing audio
  const stop = useCallback(() => {
    const audioEl = audioElementRef.current;
    if (audioEl) {
      console.warn("[TTS-Hook] Stopping previous audio.");
      audioEl.pause();
      audioEl.src = "";
      audioEl.onended = null;
      audioEl.onerror = null;
      setIsSpeaking(false);
      stopAnalysis();
    }
  }, [audioElementRef, stopAnalysis]);

  // Main function to speak new text
  const speak = useCallback(
    async (text: string) => {
      stop();

      if (
        !text ||
        text.trim() === "" ||
        text.startsWith("Error:") ||
        text.startsWith("An error occurred") ||
        text.startsWith("Sorry,")
      ) {
        console.log("[TTS-Hook] Skipping non-speakable text.");
        setIsSpeaking(false);
        return;
      }

      const audioEl = audioElementRef.current;
      if (!audioEl) {
        console.error("[TTS-Hook] Audio element ref is null. Cannot speak.");
        setTtsError("Audio element not available.");
        return;
      }

      // --- ✅ AUDIO BUG FIX ---
      // If context was suspended (common), resume it before playing
      if (audioContextRef.current?.state === "suspended") {
        console.warn("[TTS-Hook] AudioContext is suspended. Attempting to resume...");
        await audioContextRef.current.resume();
      }
      // --- END OF FIX ---

      setIsSpeaking(true);
      setTtsError(null);
      let audioUrl: string | null = null;
      console.log(`[TTS-Hook] Requesting for: "${text.substring(0, 60)}..."`);

      try {
        const response = await fetch(`${BACKEND_URL}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          const d = await response
            .json()
            .catch(() => ({ error: `Server error ${response.status}` }));
          throw new Error(`Audio Error: ${d.error || response.statusText}`);
        }

        const blob = await response.blob();
        if (blob.size < 100 || !blob.type.startsWith("audio/")) {
          throw new Error("Audio Error: Invalid data received.");
        }

        audioUrl = URL.createObjectURL(blob);
        audioEl.src = audioUrl;

        await new Promise<void>((resolve, reject) => {
          audioEl.onended = () => {
            console.log("[TTS-Hook] Playback finished.");
            stopAnalysis();
            resolve();
          };
          audioEl.onerror = (e) => {
            console.error("[TTS-Hook] HTMLAudioElement error:", e);
            stopAnalysis();
            reject(new Error("Audio playback failed"));
          };

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(reject);
          }

          if (audioContextRef.current?.state === "running") {
            startAnalysis();
          } else {
            console.warn(
              "[TTS-Hook] Skipping analysis (AudioContext not running)."
            );
          }
        });
      } catch (error: any) { // --- ✅ 1. ADD 'any' TYPE TO 'error' ---

        // --- ✅ 2. THIS IS THE FIX ---
        // We check the error's 'name' property. If it's 'AbortError',
        // it's just a harmless interruption, so we log it and return.
        if (error.name === "AbortError") {
          console.log("[TTS-Hook] Audio playback aborted. This is normal.");
        } else {
          // This is a *real* error that we should log and show.
          console.error("[TTS-Hook] Error:", error);
          setTtsError(
            error instanceof Error ? error.message : "Unknown audio error."
          );
        }
        // --- END OF FIX ---

      } finally {
        console.log("[TTS-Hook] Cleaning up state.");
        setIsSpeaking(false);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        if (audioEl) {
          audioEl.onended = null;
          audioEl.onerror = null;
        }
      }
    },
    [stop, audioElementRef, startAnalysis, stopAnalysis]
  );

  // Cleanup function
  const cleanup = useCallback(() => {
    stop();
    audioContextRef.current?.close().catch(console.error);
    audioContextRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    cancelAnimationFrame(animationFrameRef.current);
    console.log("[TTS-Hook] AudioContext cleaned up.");
  }, [stop]);

  return {
    speak,
    stop,
    isSpeaking,
    ttsError,
    cleanup,
    amplitude,
    initAudioSystem,
  };
}