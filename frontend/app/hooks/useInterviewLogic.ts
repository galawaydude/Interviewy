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
import { useVideoRecorder } from "./useVideoRecorder"; // Import Video Hook

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
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [errorState, setErrorState] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState<boolean>(false);

  const [showAltTabModal, setShowAltTabModal] = useState<boolean>(false);

  const [timeLeft, setTimeLeft] = useState<number | null>(
    durationMinutes ? durationMinutes * 60 : null
  );
  const [isFinishing, setIsFinishing] = useState(false); // NEW: Lock state during upload

  // Refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const effectRan = useRef<boolean>(false);
  const intentionalExitRef = useRef<boolean>(false);
  const audioInitDone = useRef<boolean>(false); // Track if audio is init

  // --- HOOKS ---
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
    startVideoRecording,
    stopAndUploadVideo,
    isRecordingVideo,
    isVideoUploading
  } = useVideoRecorder();

  // --- MASTER END FUNCTION ---
  // This is the single source of truth for stopping everything.
  const forceEndSession = useCallback(async () => {
      if (isFinishing) return; // Prevent double triggers
      setIsFinishing(true);
      setIsLoading(true); // Show loading on UI

      console.log("🛑 Force End Session triggered.");

      // 1. Stop AI & Speech immediately
      stopSpeaking();
      
      // 2. Save Video (Wait for it!)
      if (mode === "evaluation" && evaluationKey) {
          console.log("🛑 Uploading video...");
          await stopAndUploadVideo(evaluationKey);
      }

      // 3. Save Transcript to DB
      if (mode === "evaluation" && evaluationKey) {
         console.log("🛑 Saving transcript...");
         try {
           await fetch(`${BACKEND_URL}/api/submit_interview`, {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ key: evaluationKey, history: messages })
           });
         } catch (e) {
           console.error("Failed to save interview data", e);
         }
      }

      // 4. Cleanup & Notify Parent
      intentionalExitRef.current = true;
      cleanupTts();
      // cleanupStt() is handled below in its hook or via simple unmount
      
      setIsFinishing(false);
      setIsLoading(false);
      onEnd(); // Tell parent component to switch views
  }, [mode, evaluationKey, messages, stopSpeaking, stopAndUploadVideo, cleanupTts, onEnd, isFinishing]);


  // --- TIMER EFFECT ---
  useEffect(() => {
    if (mode !== "evaluation" || timeLeft === null) return;

    if (timeLeft <= 0) {
        // TIME IS UP -> FORCE END
        forceEndSession();
        return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, timeLeft, forceEndSession]);


  // --- AI LOGIC ---
  const sendToAI = useCallback(
    async (currentHistory: Message[]) => {
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = await response.json();
        if (data.reply) {
          const alexReply = data.reply.trim();
          setMessages((prev) => [...prev, { speaker: "alex", text: alexReply }]);
          speak(alexReply);
        }
      } catch (error: any) {
        setErrorState(error.message);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, role, skills, resumeText, userName, speak, timeLeft]
  );

  // --- STT HOOK ---
  const {
    startRecording: startStt,
    stopRecording: stopStt,
    isRecording: isSttRecording,
    isTranscribing,
    cleanup: cleanupStt,
  } = useSpeechToText({
    onTranscript: (transcript) => {
      if (!transcript.trim()) { setIsLoading(false); return; }
      setIsLoading(true);
      const newMsg: Message = { speaker: "user", text: transcript.trim() };
      const history = [...messages, newMsg];
      setMessages(history);
      sendToAI(history);
    },
    onError: (err) => {
       if (err) setErrorState(err);
       setIsLoading(false);
    },
  });

  // Wrapper for Start Recording to handle Lazy Audio Init
  const handleStartRecording = () => {
    stopSpeaking();
    
    // LAZY INIT: Initialize AudioContext here, on first user interaction
    if (!audioInitDone.current) {
        initAudioSystem();
        audioInitDone.current = true;
    }

    startStt();
  };

  // --- LIFECYCLE START ---
  useEffect(() => {
    if (effectRan.current === false) {
      effectRan.current = true;
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      
      // 1. Start Video Immediately (Browser will prompt for Camera)
      if (mode === "evaluation") {
         startVideoRecording();
      }
      
      // 2. Start AI (Chat only, no AudioContext yet)
      sendToAI([]); 
    }
    return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        cleanupTts();
        cleanupStt();
        // Note: We don't stop video here because forceEndSession handles logic.
        // The video hook cleanup handles unmount safety.
    };
  }, []); 

  // --- HANDLERS ---
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && !intentionalExitRef.current) {
      stopSpeaking();
      stopStt();
      setShowExitModal(true);
    }
    if (intentionalExitRef.current) intentionalExitRef.current = false;
  }, [stopSpeaking, stopStt]);

  const handleConfirmExit = useCallback(() => {
    setShowExitModal(false);
    forceEndSession(); // Use Master End
  }, [forceEndSession]);

  const handleCancelExit = useCallback(() => {
    setShowExitModal(false);
    mainContainerRef.current?.requestFullscreen().catch(() => {});
  }, [mainContainerRef]);

  const handleRequestExit = useCallback(() => {
    stopSpeaking();
    stopStt();
    setShowExitModal(true);
  }, [stopSpeaking, stopStt]);

  const handleReturnFromAltTab = useCallback(() => {
    setShowAltTabModal(false);
    mainContainerRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      // Window focus lost — likely Alt+Tab or switching apps
      stopSpeaking();
      // stopRecording();
      stopStt(); // does this stop?
      setShowAltTabModal(true);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        // User changed tabs, minimized, or alt-tabbed
        stopSpeaking();
        // stopRecording();
        stopStt(); // does this stop?
        setShowAltTabModal(true);
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stopSpeaking, stopStt]);

  // Status Text
  const getStatusText = () => {
    if (isFinishing || isVideoUploading) return "Saving interview data... Please wait.";
    if (showExitModal) return "Paused. Please make a selection.";
    if (timeLeft === 0) return "Time is up. Finishing...";
    if (isSttRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    return "It's your turn. Press the mic to speak.";
  };

  return {
    state: {
      isLoading: isLoading || isFinishing || isVideoUploading, // Block UI during finish
      isSpeaking,
      isRecording: isSttRecording,
      isTranscribing,
      errorState,
      messages,
      amplitude,
      showExitModal,
      showAltTabModal,
      timeLeft,
    },
    refs: { mainContainerRef },
    handlers: {
      startRecording: handleStartRecording,
      stopRecording: stopStt,
      handleConfirmExit,
      handleCancelExit,
      handleRequestExit,
      handleReturnFromAltTab,
    },
    computed: { statusText: getStatusText() },
  };
}