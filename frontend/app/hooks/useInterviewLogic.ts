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
  audioElementRef: RefObject<HTMLAudioElement | null>;
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
  } = useTextToSpeech({ audioElementRef });

  const {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    cleanup: cleanupStt,
  } = useSpeechToText({
    // --- ✅ Back to Direct Call Method ---
    onTranscript: (transcript) => {
      console.log(`[Logic] onTranscript received: "${transcript}"`);
      if (!transcript || transcript.trim() === "") {
        console.warn("[Logic] Received empty or whitespace transcript, ignoring.");
        // Make sure loading stops if transcript is unusable
        // Need to check if we were already loading from a previous turn
        // Safest is to just ensure it's false if we are not proceeding.
        setIsLoading(false);
        return;
      }

      // Set loading and clear errors immediately
      setIsLoading(true);
      setErrorState(null);

      const newUserMessage: Message = { speaker: "user", text: transcript.trim() };

      // Create the next history state locally *using the current state*
      // React guarantees state is consistent within this event handler
      const updatedHistory = [...messages, newUserMessage];

      // Update the state for UI rendering
      setMessages(updatedHistory);

      // Call sendToAI immediately with the *just created* updated history
      console.log(`[Logic] Calling sendToAI immediately. History length: ${updatedHistory.length}`);
      sendToAI(updatedHistory);
    },
    onError: (error) => {
      if (error) { // Only log/set if there's a real error string
        console.error(`[Logic] STT Error: ${error}`);
        setErrorState(error);
      } else {
        setErrorState(null); // Clear error state if null is received
      }
       // Ensure loading stops regardless of error type
      setIsLoading(false);
    },
  });
  // --- END Direct Call Method ---


  // sendToAI function (accepts history)
  const sendToAI = useCallback(
    async (currentHistory: Message[]) => {
      console.log(`[Logic] sendToAI starting. History length: ${currentHistory.length}`);
      // Note: setIsLoading(true) is now handled reliably in onTranscript

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
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(requestBody),
        });

        console.log(`[Logic] Backend response status: ${response.status}`); // Log status

        if (!response.ok) {
          let errorText = `Server error ${response.status}`;
          try {
            const errorData = await response.json();
            errorText = errorData.error || errorText;
            console.error("[Logic] Backend error response:", errorData); // Log error details
          } catch (jsonError) {
             console.error("[Logic] Failed to parse backend error response:", jsonError);
          }
          throw new Error(errorText);
        }

        const data = await response.json();
        console.log("[Logic] Backend response data:", data); // Log successful data

        if (!data.reply || data.reply.trim() === "") {
          console.warn("[Logic] Received empty reply from backend.");
          const noResponseMsg: Message = { speaker: "alex", text: "(No response generated.)" };
          setMessages((prev) => [...prev, noResponseMsg]);
        } else {
          const alexReplyText = data.reply.trim();
          const alexReply: Message = { speaker: "alex", text: alexReplyText };
          console.log(`[Logic] Adding Alex reply to state: "${alexReplyText.substring(0,50)}..."`);
          setMessages((prev) => [...prev, alexReply]); // Add AI reply

          if ( alexReplyText.startsWith("Error:") || alexReplyText.startsWith("An error occurred") || alexReplyText.startsWith("Sorry, an error occurred") ) {
            console.error(`[Logic] Received AI-side error message: ${alexReplyText}`);
            setErrorState(alexReplyText);
            // Don't speak AI-generated error messages
          } else if (alexReplyText === "(No response generated.)") {
             // Don't speak the placeholder message
             console.log("[Logic] Not speaking placeholder message.");
          }
          else {
            console.log("[Logic] Calling speak()...");
            speak(alexReplyText);
          }
        }
      } catch (error) {
        console.error("[Logic] Error during sendToAI fetch or processing:", error);
        const errorMsgText = error instanceof Error ? error.message : "Network or unknown error.";
        const errorMsg: Message = { speaker: "alex", text: `Sorry, an error occurred: ${errorMsgText}` };
        setMessages((prev) => [...prev, errorMsg]);
        setErrorState(`Failed to get response: ${errorMsgText}`);
      } finally {
        console.log("[Logic] sendToAI finished. Setting isLoading to false.");
        setIsLoading(false); // Ensure loading is set to false in all cases
      }
    },
    [mode, role, skills, resumeText, userName, speak] // Dependencies are correct
  );

  // --- Handlers (Unchanged) ---
  const handleStartRecording = () => {
    stopSpeaking();
    // setErrorState(null); // Now cleared inside STT hook's onError(null)
    startRecording();
  };
  const handleStopRecording = () => {
    stopRecording();
  };

  // --- Initial Setup Effect (Unchanged) ---
   useEffect(() => {
    if (effectRan.current === false) {
      effectRan.current = true;
      console.log("[Logic] Interview screen loaded. Initializing...");
      initAudioSystem();
      const container = mainContainerRef.current;
      if (container && !document.fullscreenElement) {
        console.log("[Logic] Attempting fullscreen...");
        container.requestFullscreen().catch((err) => {
          console.error(`[Logic] Fullscreen request failed: ${err.message}`, err);
        });
      }
      console.log("[Logic] Initial setup: Calling sendToAI with empty history.");
      sendToAI([]); // Call AI for the first greeting
    }
    return () => { // Cleanup logic
      if (effectRan.current) {
        console.log("[Logic] InterviewSession Cleanup.");
        cleanupTts(); cleanupStt();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(console.warn);
        }
        effectRan.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount


  // --- Go Back handler (Unchanged) ---
  const goBack = useCallback(() => {
    cleanupTts();
    cleanupStt();
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => router.push("/"));
    } else {
      router.push("/");
    }
  }, [router, cleanupTts, cleanupStt]);

  // --- Status Text (Unchanged) ---
  const getStatusText = () => {
    if (isRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    if (errorState) return `Error: ${errorState}`;
    return "It's your turn. Press the mic to speak.";
  };

  // --- TTS Error Effect (Unchanged) ---
  useEffect(() => {
    if (ttsError) {
      setErrorState(`TTS Error: ${ttsError}`);
    }
  }, [ttsError]);

  // --- Return values (Unchanged) ---
  return {
    state: { isLoading, isSpeaking, isRecording, isTranscribing, errorState, interviewStarted: true, messages, amplitude },
    refs: { mainContainerRef },
    handlers: { startRecording: handleStartRecording, stopRecording: handleStopRecording, goBack },
    computed: { statusText: getStatusText() },
  };
}