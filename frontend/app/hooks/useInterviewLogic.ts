// app/hooks/useInterviewLogic.ts
"use client";

import { useRouter } from "next/navigation";
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
  audioElementRef: RefObject<HTMLAudioElement | null>; // Get the ref
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
  audioElementRef, // Destructure the ref
}: UseInterviewLogicProps) {
  const router = useRouter();

  // Main State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start as true
  const [errorState, setErrorState] = useState<string | null>(null);

  // Refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const effectRan = useRef<boolean>(false);

  // Child Hooks
  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    ttsError,
    cleanup: cleanupTts,
    amplitude,
    initAudioSystem,
  } = useTextToSpeech({ audioElementRef }); // Pass the ref down

  const {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    cleanup: cleanupStt,
  } = useSpeechToText({
    onTranscript: (transcript) => {
      console.log("[Logic] Received transcript, sending to AI...");
      const newUserMessage: Message = { speaker: "user", text: transcript };
      setMessages((prev) => [...prev, newUserMessage]);
      sendToAI([...messages, newUserMessage]);
    },
    onError: (error) => {
      if (error) {
        console.error(`[Logic] STT Error: ${error}`);
        setErrorState(error);
      } else {
        setErrorState(null);
      }
    },
  });

  // Core Functions

  // Send message to AI
  const sendToAI = useCallback(
    async (historyWithUserMessage: Message[]) => {
      setIsLoading(true);
      setErrorState(null);

      const requestBody = {
        history: historyWithUserMessage,
        mode,
        role,
        skills,
        resumeText,
        user_name: userName,
      };
      console.log(">>> [Logic] Calling sendToAI");

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          let eD = `Server error ${response.status}`;
          try {
            const d = await response.json();
            eD = d.error || eD;
          } catch {}
          throw new Error(eD);
        }
        const data = await response.json();

        if (!data.reply || data.reply.trim() === "") {
          console.warn("[Logic] Received empty reply.");
          const noResponseMsg = {
            speaker: "alex" as const,
            text: "(No response generated. You can continue or ask differently.)",
          };
          setMessages((prev) => [...prev, noResponseMsg]);
        } else {
          const alexReplyText = data.reply;
          const alexReply: Message = { speaker: "alex", text: alexReplyText };
          setMessages((prev) => [...prev, alexReply]);

          if (
            alexReplyText.startsWith("Error:") ||
            alexReplyText.startsWith("An error occurred") ||
            alexReplyText.startsWith("Sorry, an error occurred")
          ) {
            console.error(`[Logic] Received AI-side error: ${alexReplyText}`);
            setErrorState(alexReplyText);
          } else {
            speak(alexReplyText);
          }
        }
      } catch (error) {
        console.error("[Logic] Error in sendToAI fetch/process:", error);
        const errorMsgText =
          error instanceof Error ? error.message : "Failed to get response.";
        const errorMsg = {
          speaker: "alex" as const,
          text: `Sorry, an error occurred: ${errorMsgText}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setErrorState(`Error getting AI response: ${errorMsgText}`);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, role, skills, resumeText, userName, speak]
  );

  // --- Handlers for the UI (Simplified) ---
  const handleStartRecording = () => {
    stopSpeaking();
    setErrorState(null);
    startRecording(); // Just start recording
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  // --- Page Lifecycle and Navigation (Simplified) ---
  useEffect(() => {
    // This effect now auto-starts the interview
    if (effectRan.current === false) {
      effectRan.current = true;
      console.log("[Logic] Interview screen loaded. Initializing...");

      // 1. Init audio system (for visualizer)
      // This is safe now because page.tsx got permission
      initAudioSystem();
      
      // 2. --- ✅ SMOOTH FULLSCREEN ---
      // We wrap this in a requestAnimationFrame to let the
      // page render *before* jarring the user with fullscreen
      requestAnimationFrame(() => {
        const container = mainContainerRef.current;
        if (container && !document.fullscreenElement) {
          container.requestFullscreen().catch((err) => {
            console.warn(`Fullscreen request failed: ${err.message}`);
          });
        }
      });
      // --- END SMOOTH FULLSCREEN ---
      
      // 3. Fetch the first AI question
      sendToAI([]);
    }

    // Cleanup
    return () => {
      // Check if the effect actually ran before cleaning up
      if (effectRan.current) {
        console.log("[Logic] InterviewSession Cleanup.");
        cleanupTts();
        cleanupStt();

        if (document.fullscreenElement) {
          document.exitFullscreen().catch((err) => console.warn(err));
        }
        effectRan.current = false; // Reset for potential fast refresh
      }
    };
    // We only want this to run ONCE on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Go Back button handler
  const goBack = useCallback(() => {
    cleanupTts();
    cleanupStt();

    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => router.push("/"));
    } else {
      router.push("/");
    }
  }, [router, cleanupTts, cleanupStt]);

  // Status Text
  const getStatusText = () => {
    if (isRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    if (errorState) return "An error occurred.";
    return "It's your turn. Press the mic to speak."; // Default state
  };

  // Check for TTS-specific errors
  useEffect(() => {
    if (ttsError) {
      setErrorState(`TTS Error: ${ttsError}`);
    }
  }, [ttsError]);

  // Return values
  return {
    state: {
      isLoading,
      isSpeaking,
      isRecording,
      isTranscribing,
      errorState,
      interviewStarted: true, // It's always active now
      messages,
      amplitude,
    },
    refs: {
      mainContainerRef,
    },
    handlers: {
      startRecording: handleStartRecording,
      stopRecording: handleStopRecording,
      goBack,
    },
    computed: {
      statusText: getStatusText(),
    },
  };
}