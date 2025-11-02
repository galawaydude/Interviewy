// app/hooks/useInterviewLogic.ts
"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  RefObject,
} from "react";
import { useTextToSpeech } from "./useTextToSpeech";
import { useSpeechToText } from "./useSpeechToText";

// Type Definitions
type Message = {
  speaker: "alex" | "user";
  text: string;
};

// Props for the logic hook
interface UseInterviewLogicProps {
  mode: "resume" | "position";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
  audioElementRef: RefObject<HTMLAudioElement | null>;
  onEnd: () => void;
}

// Constants
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export function useInterviewLogic({
  mode,
  userName,
  role,
  skills,
  resumeText,
  audioElementRef,
  onEnd,
}: UseInterviewLogicProps) {
  // Main State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start as true
  const [errorState, setErrorState] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);

  // Refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const effectRan = useRef<boolean>(false);
  const intentionalExitRef = useRef<boolean>(false);

  // Child Hooks
  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    ttsError,
    cleanup: cleanupTts,
    amplitude,
    initAudioSystem,
  } = useTextToSpeech({ audioElementRef });

  const {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    cleanup: cleanupStt,
  } = useSpeechToText({
    // --- (onTranscript is unchanged) ---
    onTranscript: (transcript) => {
      console.log(`[Logic] onTranscript received: "${transcript}"`);
      if (!transcript || transcript.trim() === "") {
        console.warn("[Logic] Received empty or whitespace transcript, ignoring.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorState(null);
      const newUserMessage: Message = { speaker: "user", text: transcript.trim() };
      const updatedHistory = [...messages, newUserMessage];
      setMessages(updatedHistory);
      console.log(
        `[Logic] Calling sendToAI immediately. History length: ${updatedHistory.length}`
      );
      sendToAI(updatedHistory);
    },
    // --- (onError is unchanged) ---
    onError: (error) => {
      if (error) {
        console.error(`[Logic] STT Error: ${error}`);
        setErrorState(error);
      } else {
        setErrorState(null);
      }
      setIsLoading(false);
    },
  });

  // sendToAI function (unchanged)
  const sendToAI = useCallback(
    async (currentHistory: Message[]) => {
      console.log(
        `[Logic] sendToAI starting. History length: ${currentHistory.length}`
      );
      
      const requestBody = {
        history: currentHistory,
        mode,
        role,
        skills,
        resumeText,
        user_name: userName,
      };

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`[Logic] Backend response status: ${response.status}`);

        if (!response.ok) {
          let errorText = `Server error ${response.status}`;
          try {
            const errorData = await response.json();
            errorText = errorData.error || errorText;
            console.error("[Logic] Backend error response:", errorData);
          } catch (jsonError) {
            console.error(
              "[Logic] Failed to parse backend error response:",
              jsonError
            );
          }
          throw new Error(errorText);
        }

        const data = await response.json();
        console.log("[Logic] Backend response data:", data);

        if (!data.reply || data.reply.trim() === "") {
          console.warn("[Logic] Received empty reply from backend.");
          const noResponseMsg: Message = {
            speaker: "alex",
            text: "(No response generated.)",
          };
          setMessages((prev) => [...prev, noResponseMsg]);
        } else {
          const alexReplyText = data.reply.trim();
          const alexReply: Message = { speaker: "alex", text: alexReplyText };
          console.log(
            `[Logic] Adding Alex reply to state: "${alexReplyText.substring(
              0,
              50
            )}..."`
          );
          setMessages((prev) => [...prev, alexReply]);

          if (
            alexReplyText.startsWith("Error:") ||
            alexReplyText.startsWith("An error occurred") ||
            alexReplyText.startsWith("Sorry, an error occurred")
          ) {
            console.error(
              `[Logic] Received AI-side error message: ${alexReplyText}`
            );
            setErrorState(alexReplyText);
          } else if (alexReplyText === "(No response generated.)") {
            console.log("[Logic] Not speaking placeholder message.");
          } else {
            console.log("[Logic] Calling speak()...");
            speak(alexReplyText);
          }
        }
      } catch (error) {
        console.error("[Logic] Error during sendToAI fetch or processing:", error);
        const errorMsgText =
          error instanceof Error ? error.message : "Network or unknown error.";
        const errorMsg: Message = {
          speaker: "alex",
          text: `Sorry, an error occurred: ${errorMsgText}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setErrorState(`Failed to get response: ${errorMsgText}`);
      } finally {
        console.log("[Logic] sendToAI finished. Setting isLoading to false.");
        setIsLoading(false);
      }
    },
    [mode, role, skills, resumeText, userName, speak]
  );

  // --- Handlers (unchanged) ---
  const handleStartRecording = () => {
    stopSpeaking();
    startRecording();
  };
  const handleStopRecording = () => {
    stopRecording();
  };

  // `goBack` HANDLER (unchanged)
  // This is now only called by `handleConfirmExit`
  const goBack = useCallback(() => {
    intentionalExitRef.current = true;
    cleanupTts();
    cleanupStt();
    onEnd();
  }, [onEnd, cleanupTts, cleanupStt]);

  // FULLSCREEN CHANGE HANDLER (unchanged)
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && !intentionalExitRef.current) {
      console.log(
        "[Logic] Fullscreen exited unexpectedly (e.g., 'Esc' key)."
      );
      // --- ✅ 1. ADDED stopSpeaking/stopRecording ---
      // Stop audio/mic if 'Esc' is pressed
      stopSpeaking();
      stopRecording();
      setShowExitModal(true);
    }
    if (intentionalExitRef.current) {
      intentionalExitRef.current = false;
    }
  }, [stopSpeaking, stopRecording]); // --- ✅ 2. ADD DEPENDENCIES ---

  // MODAL HANDLERS (unchanged)
  const handleConfirmExit = useCallback(() => {
    setShowExitModal(false);
    goBack();
  }, [goBack]);

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false);
    mainContainerRef.current?.requestFullscreen().catch((err) => {
      console.error("[Logic] Failed to re-enter fullscreen:", err);
      setErrorState("Could not re-enter fullscreen. Please try again.");
    });
  }, [mainContainerRef]);

  // --- ✅ 3. ADD NEW HANDLER FOR THE 'X' BUTTON ---
  const handleRequestExit = useCallback(() => {
    // Stop any active audio/recording and show the modal
    stopSpeaking();
    stopRecording();
    setShowExitModal(true);
  }, [stopSpeaking, stopRecording]); // --- ✅ 4. ADD DEPENDENCIES ---

  // Initial Setup Effect (unchanged)
  useEffect(() => {
    if (effectRan.current === false) {
      effectRan.current = true;
      console.log("[Logic] Interview screen loaded. Initializing...");
      
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      
      initAudioSystem();
      console.log("[Logic] Initial setup: Calling sendToAI with empty history.");
      sendToAI([]); // Call AI for the first greeting
    }
    return () => {
      // Cleanup logic
      if (effectRan.current) {
        console.log("[Logic] InterviewSession Cleanup.");
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        cleanupTts();
        cleanupStt();
        effectRan.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Status Text (unchanged)
  const getStatusText = () => {
    if (showExitModal) return "Paused. Please make a selection.";
    if (isRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    if (errorState) return `Error: ${errorState}`;
    return "It's your turn. Press the mic to speak.";
  };

  // TTS Error Effect (unchanged)
  useEffect(() => {
    if (ttsError) {
      setErrorState(`TTS Error: ${ttsError}`);
    }
  }, [ttsError]);

  // --- ✅ 5. EXPORT THE NEW HANDLER ---
  return {
    state: {
      isLoading,
      isSpeaking,
      isRecording,
      isTranscribing,
      errorState,
      interviewStarted: true,
      messages,
      amplitude,
      showExitModal,
    },
    refs: { mainContainerRef },
    handlers: {
      startRecording: handleStartRecording,
      stopRecording: handleStopRecording,
      goBack,
      handleConfirmExit,
      handleCancelExit,
      handleRequestExit, // <-- EXPORT IT HERE
    },
    computed: { statusText: getStatusText() },
  };
}