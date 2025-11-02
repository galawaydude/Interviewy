// components/InterviewSession.tsx
"use client";

import AudioVisualizer from "@/components/ui/AudioVisualizer";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Mic, Square, X } from "lucide-react";
import { useInterviewLogic } from "@/app/hooks/useInterviewLogic";
import { useRef } from "react";
import ExitFullscreenDialog from "@/components/ExitFullscreenDialog";

// Type Definition
interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
  onEnd: () => void;
}

// Component
export default function InterviewSession(props: InterviewSessionProps) {
  // --- Create ref for the audio element ---
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Pass the ref and props (including onEnd) to the logic hook
  const { state, refs, handlers, computed } = useInterviewLogic({
    ...props,
    audioElementRef: audioPlayerRef, // Pass the ref
  });

  const {
    isLoading,
    isSpeaking,
    isRecording,
    isTranscribing,
    errorState,
    amplitude,
    showExitModal,
  } = state;

  const { mainContainerRef } = refs; // Get main ref from hook
  const {
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
    // --- `goBack` is no longer used by the 'X' button ---
    // goBack, 
    handleConfirmExit,
    handleCancelExit,
    handleRequestExit, // --- ✅ 1. GET THE NEW HANDLER ---
  } = handlers;
  const { statusText } = computed;

  const isMicDisabled = isLoading || isSpeaking || isTranscribing || showExitModal;
  const isVisualizerActive = (isSpeaking || isRecording) && !showExitModal;
  const visualizerVariant = isSpeaking ? "Alex" : "user";
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
          onClick={handleRequestExit} // --- ✅ 2. ATTACH THE NEW HANDLER HERE ---
          disabled={isRecording || isTranscribing || showExitModal}
          aria-label="Leave interview"
          className="text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* --- MAIN CONTENT (unchanged) --- */}
      <main className="flex-grow flex flex-col items-center justify-center text-center p-6 space-y-8">
        {/* 1. Visualizer */}
        <AudioVisualizer
          isActive={isVisualizerActive}
          variant={visualizerVariant}
          amplitude={visualizerAmplitude}
        />
        
        {/* 2. Status Text */}
        <div className="h-20 flex items-center justify-center">
          <p
            className={`text-lg text-gray-300 transition-opacity duration-300 ${
              (isLoading || isTranscribing) && !showExitModal
                ? "animate-pulse"
                : ""
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
      {/* --- END OF MAIN --- */}


      {/* --- FOOTER (unchanged) --- */}
      <footer className="w-full flex items-center justify-center p-6">
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="lg"
          className="h-16 w-16 rounded-full"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isMicDisabled}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <Square className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </footer>
      {/* --- END OF FOOTER --- */}

      {/* --- (Dialog is unchanged) --- */}
      <ExitFullscreenDialog
        open={showExitModal}
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />
    </div>
  );
}