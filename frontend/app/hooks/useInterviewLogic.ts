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

type Message = {
  speaker: "alex" | "user";
  text: string;
};

interface UseInterviewLogicProps {
  mode: "resume" | "position" | "evaluation";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
  evaluationKey?: string;
  durationMinutes?: number;
  audioElementRef: RefObject<HTMLAudioElement | null>;
  onEnd: () => void;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export function useInterviewLogic({
  mode,
  userName,
  role,
  skills,
  resumeText,
  evaluationKey,
  durationMinutes,
  audioElementRef,
  onEnd,
}: UseInterviewLogicProps) {
  // Main State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [errorState, setErrorState] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  
  // --- TIMER STATE ---
  const [timeLeft, setTimeLeft] = useState<number | null>(
    durationMinutes ? durationMinutes * 60 : null
  );

  // Refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const effectRan = useRef<boolean>(false);
  const intentionalExitRef = useRef<boolean>(false);

  // --- TIMER EFFECT ---
  useEffect(() => {
    if (mode !== "evaluation" || timeLeft === null) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, timeLeft]);

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

  const sendToAI = useCallback(
    async (currentHistory: Message[]) => {
      // Calculate mins left for AI context
      const minsLeft = timeLeft ? timeLeft / 60 : null;

      const requestBody = {
        history: currentHistory,
        mode,
        role,
        skills,
        resumeText,
        user_name: userName,
        time_left_mins: minsLeft
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

        if (!response.ok) throw new Error(`Server error ${response.status}`);

        const data = await response.json();

        if (!data.reply) {
          setMessages((prev) => [...prev, { speaker: "alex", text: "(No response)" }]);
        } else {
          const alexReplyText = data.reply.trim();
          setMessages((prev) => [...prev, { speaker: "alex", text: alexReplyText }]);
          speak(alexReplyText);
          
          // If time is up and Alex says "good bye", we could trigger auto-finish, 
          // but letting user click 'X' is safer for UX.
        }
      } catch (error: any) {
        console.error("Error:", error);
        setErrorState(error.message);
        setIsLoading(false);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, role, skills, resumeText, userName, speak, timeLeft]
  );

  const {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    cleanup: cleanupStt,
  } = useSpeechToText({
    onTranscript: (transcript) => {
      if (!transcript.trim()) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorState(null);
      const newUserMessage: Message = { speaker: "user", text: transcript.trim() };
      const updatedHistory = [...messages, newUserMessage];
      setMessages(updatedHistory);
      sendToAI(updatedHistory);
    },
    onError: (error) => {
      if (error) setErrorState(error);
      setIsLoading(false);
    },
  });

  // --- DB SUBMIT ---
  const finishEvaluation = useCallback(async () => {
    if (mode === "evaluation" && evaluationKey) {
       try {
         await fetch(`${BACKEND_URL}/api/submit_interview`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ key: evaluationKey, history: messages })
         });
       } catch (e) {
         console.error("Failed to save interview", e);
       }
    }
    intentionalExitRef.current = true;
    cleanupTts();
    cleanupStt();
    onEnd();
  }, [mode, evaluationKey, messages, cleanupTts, cleanupStt, onEnd]);

  // Handlers
  const handleStartRecording = () => {
    stopSpeaking();
    startRecording();
  };
  
  const handleStopRecording = () => stopRecording();

  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && !intentionalExitRef.current) {
      stopSpeaking();
      stopRecording();
      setShowExitModal(true);
    }
    if (intentionalExitRef.current) intentionalExitRef.current = false;
  }, [stopSpeaking, stopRecording]);

  const handleConfirmExit = useCallback(() => {
    setShowExitModal(false);
    // If Evaluation, save data
    finishEvaluation(); 
  }, [finishEvaluation]);

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false);
    mainContainerRef.current?.requestFullscreen().catch(() => {});
  }, [mainContainerRef]);

  const handleRequestExit = useCallback(() => {
    stopSpeaking();
    stopRecording();
    setShowExitModal(true);
  }, [stopSpeaking, stopRecording]);

  useEffect(() => {
    if (effectRan.current === false) {
      effectRan.current = true;
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      initAudioSystem();
      sendToAI([]); 
    }
    return () => {
      if (effectRan.current) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        cleanupTts();
        cleanupStt();
        effectRan.current = false;
      }
    };
  }, []); 

  const getStatusText = () => {
    if (showExitModal) return "Paused. Please make a selection.";
    if (timeLeft === 0) return "Time is up. Wrap up your answer.";
    if (isRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    if (errorState) return `Error: ${errorState}`;
    return "It's your turn. Press the mic to speak.";
  };

  useEffect(() => {
    if (ttsError) setErrorState(`TTS Error: ${ttsError}`);
  }, [ttsError]);

  return {
    state: {
      isLoading,
      isSpeaking,
      isRecording,
      isTranscribing,
      errorState,
      messages,
      amplitude,
      showExitModal,
      timeLeft, // Export timeLeft
    },
    refs: { mainContainerRef },
    handlers: {
      startRecording: handleStartRecording,
      stopRecording: handleStopRecording,
      handleConfirmExit,
      handleCancelExit,
      handleRequestExit,
    },
    computed: { statusText: getStatusText() },
  };
}