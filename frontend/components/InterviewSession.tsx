// components/InterviewSession.tsx
"use client";

import AudioVisualizer from "@/components/ui/AudioVisualizer";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Mic, Square, X } from "lucide-react";
import { useInterviewLogic } from "@/app/hooks/useInterviewLogic";
import { useRef } from "react"; // <-- Import useRef

// Type Definition
interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
}

// Component
export default function InterviewSession(props: InterviewSessionProps) {
  // --- Create ref for the audio element ---
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Pass the ref to the logic hook
  const { state, refs, handlers, computed } = useInterviewLogic({
    ...props,
    audioElementRef: audioPlayerRef, // <-- Pass the ref
  });

  const {
    isLoading,
    isSpeaking,
    isRecording,
    isTranscribing,
    errorState,
    interviewStarted,
    amplitude,
  } = state;

  const { mainContainerRef } = refs; // Get main ref from hook
  const {
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
    goBack,
  } = handlers;
  const { statusText } = computed;

  // Mic is disabled if AI is thinking, speaking, or transcribing.
  // It is *NOT* disabled if the interview hasn't started.
  const isMicDisabled = isLoading || isSpeaking || isTranscribing;

  const isVisualizerActive = isSpeaking || isRecording;
  const visualizerVariant = isSpeaking ? "Jeet" : "user";
  const visualizerAmplitude = isSpeaking ? amplitude : 0;

  return (
    <div
      ref={mainContainerRef}
      className="fixed inset-0 z-50 h-screen w-screen bg-gray-900 text-white flex flex-col overflow-hidden"
    >
      {/* --- Hidden audio player --- */}
      <audio ref={audioPlayerRef} crossOrigin="anonymous" className="hidden" />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
        <div className="text-left">
          <h2 className="text-lg font-semibold">{props.userName}</h2>
          <p className="text-sm text-gray-400">{props.role}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          disabled={isRecording || isTranscribing}
          aria-label="Leave interview"
          className="text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* --- ✅ Main Content (Layout Fixed) --- */}
      <main className="flex-grow flex flex-col items-center justify-center text-center p-6 space-y-8">
        {/* 1. Visualizer */}
        <AudioVisualizer
          isActive={isVisualizerActive}
          variant={visualizerVariant}
          amplitude={visualizerAmplitude}
        />
        
        {/* 2. Status Text (Now separate with space) */}
        <div className="h-20 flex items-center justify-center"> {/* Container for text */}
          <p
            className={`text-lg text-gray-300 transition-opacity duration-300 ${
              isLoading || isTranscribing ? "animate-pulse" : ""
            }`}
          >
            {statusText}
          </p>
        </div>

        {/* 3. Error (if any) */}
        {errorState && (
          <Alert
            variant="destructive"
            className="max-w-md bg-red-900 border-red-700 text-red-100"
          >
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorState}</AlertDescription>
          </Alert>
        )}
      </main>
      {/* --- END OF LAYOUT FIX --- */}


      {/* Footer */}
      <footer className="w-full flex items-center justify-center p-6">
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="lg"
          className="h-16 w-16 rounded-full"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isMicDisabled}
          aria-label={isRecording ? "Stop recording" : "Start interview"}
        >
          {isRecording ? (
            <Square className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </footer>
    </div>
  );
}