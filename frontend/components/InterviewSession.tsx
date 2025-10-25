// components/InterviewSession.tsx
"use client";

import AudioVisualizer from "@/components/ui/AudioVisualizer";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Mic, Square, X } from "lucide-react";
import { useInterviewLogic } from "@/app/hooks/useInterviewLogic";

// --- Type Definition ---
interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
}

// --- Component ---
export default function InterviewSession(props: InterviewSessionProps) {
  const { state, refs, handlers, computed } = useInterviewLogic(props);

  const {
    isLoading,
    isSpeaking,
    isRecording,
    isTranscribing,
    errorState,
    interviewStarted,
  } = state;

  const { mainContainerRef } = refs;
  const { startRecording, stopRecording, goBack } = handlers;
  const { statusText } = computed;

  // Determine mic button disable condition
  const isMicDisabled =
    isLoading || isSpeaking || isTranscribing || !interviewStarted || !!errorState;

  return (
    <div
      ref={mainContainerRef}
      className="fixed inset-0 z-50 h-screen w-screen bg-gray-900 text-white flex flex-col overflow-hidden"
    >
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

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center text-center p-6 space-y-6">
        <AudioVisualizer
          isActive={isSpeaking || isRecording}
          variant={isSpeaking ? "alex" : "user"}
        />

        <p
          className={`text-lg text-gray-300 transition-opacity duration-300 ${
            isLoading || isTranscribing ? "animate-pulse" : ""
          }`}
        >
          {statusText}
        </p>

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

      {/* Footer */}
      <footer className="w-full flex items-center justify-center p-6">
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="lg"
          className="h-16 w-16 rounded-full"
          onClick={isRecording ? stopRecording : startRecording}
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
    </div>
  );
}
