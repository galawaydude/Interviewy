"use client";

import AudioVisualizer from "./ui/AudioVisualizer";
import { Button } from "./ui/button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Terminal, Mic, Square, X, Captions, CaptionsOff, Clock } from "lucide-react";
import { useInterviewLogic } from "../app/hooks/useInterviewLogic";
import { useRef, useState } from "react";
import ExitFullscreenDialog from "./ExitFullscreenDialog";
import AltTabWarningDialog from "./AltTabWarningDialog";
import { Video } from 'lucide-react';

interface InterviewSessionProps {
  mode: "resume" | "position" | "evaluation";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
  evaluationKey?: string;
  durationMinutes?: number;
  onEnd: () => void;
}

export default function InterviewSession(props: InterviewSessionProps) {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [showCaptions, setShowCaptions] = useState(false);

  const { state, refs, handlers, computed } = useInterviewLogic({
    ...props,
    audioElementRef: audioPlayerRef,
  });

  const {
    isLoading,
    isSpeaking,
    isRecording,
    isTranscribing,
    errorState,
    amplitude,
    showExitModal,
    messages,
    showAltTabModal,
    timeLeft
  } = state;

  const { mainContainerRef } = refs;
  const {
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
    handleConfirmExit,
    handleCancelExit,
    handleRequestExit,
    handleReturnFromAltTab, 
  } = handlers;
  const { statusText } = computed;

  const isMicDisabled = isLoading || isSpeaking || isTranscribing || showExitModal;
  const isVisualizerActive = (isSpeaking || isRecording) && !showExitModal;
  const visualizerVariant = isSpeaking ? "Alex" : "user";
  const visualizerAmplitude = isSpeaking ? amplitude : 0;

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const activeCaptionText = lastMessage?.speaker === "alex" ? lastMessage.text : null;

  // Format Timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={mainContainerRef}
      className="fixed inset-0 z-50 h-screen w-screen bg-gray-900 text-white flex flex-col overflow-hidden"
    >
      <audio ref={audioPlayerRef} crossOrigin="anonymous" className="hidden" />

      <header className="flex-none p-6 flex justify-between items-center z-20">
        <div className="text-left">
          <h2 className="text-xl font-bold tracking-tight">{props.userName}</h2>
          <p className="text-sm text-blue-400 font-medium uppercase tracking-wider">
            {props.role || "Interview"}
          </p>
        </div>
        {props.mode === "evaluation" && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-950 border border-red-800 text-red-500 text-xs font-bold uppercase tracking-widest animate-pulse">
               <div className="h-2 w-2 rounded-full bg-red-500" />
               REC
            </div>
         )}

        <div className="flex items-center gap-4">
          {/* TIMER DISPLAY */}
          {props.mode === "evaluation" && timeLeft !== null && (
            <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
               <Clock className="h-5 w-5"/>
               {formatTime(timeLeft)}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCaptions(!showCaptions)}
            className={`rounded-full transition-all duration-200 ${
              showCaptions ? "bg-white/10 text-blue-400" : "text-gray-400"
            }`}
          >
            {showCaptions ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRequestExit}
            disabled={isRecording || isTranscribing || showExitModal}
            className="rounded-full text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-5xl mx-auto px-4 relative">
        {errorState && (
          <div className="absolute top-0 left-0 right-0 flex justify-center z-30 p-4">
            <Alert variant="destructive" className="max-w-md bg-red-950/90 border-red-800 text-red-100 backdrop-blur-md">
              <Terminal className="h-4 w-4" />
              <AlertTitle>System Error</AlertTitle>
              <AlertDescription>{errorState}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center w-full min-h-[250px]">
          <AudioVisualizer
            isActive={isVisualizerActive}
            variant={visualizerVariant}
            amplitude={visualizerAmplitude}
          />
        </div>

        <div className="flex-none w-full flex flex-col items-center gap-6 pb-4">
          <div className="w-full flex justify-center min-h-[100px]">
            {showCaptions && activeCaptionText && (
              <div className="max-w-3xl w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <p className="text-lg md:text-xl text-center text-gray-50 leading-relaxed font-medium">
                  "{activeCaptionText}"
                </p>
              </div>
            )}
          </div>

          <p className={`text-sm font-medium uppercase tracking-widest ${(isLoading || isTranscribing) && !showExitModal ? "text-blue-400 animate-pulse" : "text-gray-500"}`}>
            {statusText}
          </p>
        </div>
      </main>

      <footer className="flex-none p-8 flex items-center justify-center z-20">
        <Button
          variant={isRecording ? "destructive" : "secondary"}
          size="lg"
          className={`h-20 w-20 rounded-full border-4 transition-all duration-300 ease-out ${isRecording ? "border-red-900 bg-red-600 scale-110" : "border-gray-700 bg-white hover:scale-105"}`}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isMicDisabled}
        >
          {isRecording ? <Square className="h-8 w-8 fill-current text-white" /> : <Mic className="h-8 w-8 text-gray-900" />}
        </Button>
      </footer>

      <ExitFullscreenDialog open={showExitModal} onConfirm={handleConfirmExit} onCancel={handleCancelExit} />
      <AltTabWarningDialog open={state.showAltTabModal} onReturn={handlers.handleReturnFromAltTab} />
    </div>
  );
}