"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";

// --- Type Definitions ---
type Message = {
  speaker: "alex" | "user";
  text: string;
};

interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
}

// --- Constants ---
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";

export function useInterviewLogic({
  mode,
  userName,
  role,
  skills,
  resumeText,
}: InterviewSessionProps) {
  const router = useRouter();

  // --- State Variables ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [interviewStarted, setInterviewStarted] = useState<boolean>(false);

  // --- Refs ---
  const effectRan = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // --- Core Functions ---

  // TTS Playback
  const speakText = useCallback(async (text: string) => {
    console.log(`[ALEX SAYS]: ${text}`);

    if (
      !text ||
      text.trim() === "" ||
      text.startsWith("Error:") ||
      text.startsWith("An error occurred") ||
      text.startsWith("Sorry,")
    ) {
      console.log("[TTS] Skipping non-speakable text.");
      return;
    }

    const prevAudio = currentAudioRef.current;
    if (prevAudio) {
      console.warn("[TTS] Stopping previous audio.");
      prevAudio.pause();
      prevAudio.src = "";
      prevAudio.onended = null;
      prevAudio.onerror = null;
      currentAudioRef.current = null;
    }

    setIsSpeaking(true);
    setErrorState(null);
    let audioUrl: string | null = null;
    console.log(`[TTS] Requesting for: "${text.substring(0, 60)}..."`);
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
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          console.log("[TTS] Playback finished.");
          resolve();
        };
        audio.onerror = (e) => {
          console.error("[TTS] HTMLAudioElement error:", e);
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch(reject);
      });
    } catch (error) {
      console.error("[TTS] Error:", error);
      setErrorState(
        error instanceof Error ? error.message : "Unknown audio error."
      );
    } finally {
      console.log("[TTS] Cleaning up state.");
      setIsSpeaking(false);
      currentAudioRef.current = null;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    }
  }, []);

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
      console.log(">>> [FETCH] Calling sendToAI");

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
          console.warn("[FETCH] Received empty reply.");
          const noResponseMsg = {
            speaker: "alex" as const,
            text: "(No response generated. You can continue or ask differently.)",
          };
          setMessages((prev) => [...prev, noResponseMsg]);
          console.log(`[ALEX SAYS]: ${noResponseMsg.text}`);
        } else {
          const alexReply: Message = { speaker: "alex", text: data.reply };
          setMessages((prev) => [...prev, alexReply]);
          speakText(alexReply.text);
        }
      } catch (error) {
        console.error("[FETCH] Error in sendToAI fetch/process:", error);
        const errorMsgText =
          error instanceof Error ? error.message : "Failed to get response.";
        const errorMsg = {
          speaker: "alex" as const,
          text: `Sorry, an error occurred: ${errorMsgText}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
        console.log(`[ALEX SAYS]: ${errorMsg.text}`);
        setErrorState(`Error getting AI response: ${errorMsgText}`);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, role, skills, resumeText, userName, speakText]
  );

  // --- STT Logic ---

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      console.log("[STT] Stopping recording...");
      recorder.stop();
    } else {
      console.warn("[STT] Stop called but not recording.");
      if (isRecording) setIsRecording(false);
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    const busy = isLoading || isSpeaking || isTranscribing || isRecording;
    if (busy) {
      console.warn("[STT] startRecording called while busy.");
      return;
    }
    setErrorState(null);

    try {
      console.log("[STT] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log("[STT] Microphone access granted.");

      if (!window.MediaRecorder) {
        throw new Error("MediaRecorder API not supported.");
      }
      let options = { mimeType: AUDIO_MIME_TYPE };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "" };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      console.log(`[STT] MediaRecorder initialized.`);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        console.log("[STT] Recording stopped. Processing audio...");
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        setIsTranscribing(true);
        setErrorState(null);

        const currentMimeType = recorder.mimeType || AUDIO_MIME_TYPE;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: currentMimeType,
        });
        audioChunksRef.current = [];

        if (audioBlob.size < 100) {
          console.warn("[STT] Audio blob too small.");
          setErrorState("No speech detected.");
          setIsTranscribing(false);
          return;
        }

        const formData = new FormData();
        const fileExtension =
          currentMimeType.split("/")[1]?.split(";")[0] || "webm";
        formData.append("audio_blob", audioBlob, `recording.${fileExtension}`);

        try {
          const response = await fetch(`${BACKEND_URL}/api/stt`, {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            let eD = `STT Error ${response.status}`;
            try {
              const d = await response.json();
              eD = d.error || eD;
            } catch {}
            throw new Error(eD);
          }
          const data = await response.json();

          if (data.transcript && data.transcript.trim() !== "") {
            const transcript = data.transcript.trim();
            console.log(`[USER SAYS]: ${transcript}`);
            const newUserMessage: Message = {
              speaker: "user",
              text: transcript,
            };
            setMessages((prev) => [...prev, newUserMessage]);
            sendToAI([...messages, newUserMessage]);
          } else {
            console.log("[STT] Received empty transcript.");
            setErrorState("Could not understand audio.");
          }
        } catch (error) {
          console.error("[FETCH] Error during STT fetch/process:", error);
          setErrorState(
            error instanceof Error
              ? error.message
              : "Failed to transcribe audio."
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.onerror = (event: Event) => {
        const errorEvent = event as any;
        console.error("[STT] MediaRecorder error:", errorEvent?.error || event);
        setErrorState(
          `Recording error: ${
            errorEvent?.error?.message || "Unknown recorder error"
          }.`
        );
        if (isRecording) stopRecording();
        else {
          setIsRecording(false);
          setIsTranscribing(false);
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
      };

      recorder.start();
      setIsRecording(true);
      console.log("[STT] Recording started.");
    } catch (error) {
      console.error("[STT] Error starting recording:", error);
      let specificError = "Could not start recording.";
      if (error instanceof DOMException) {
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        )
          specificError = "Microphone access denied.";
        else if (
          error.name === "NotFoundError" ||
          error.name === "DevicesNotFoundError"
        )
          specificError = "No microphone found.";
        else if (error.name === "NotReadableError")
          specificError = "Microphone is already in use or hardware error.";
        else specificError = `Microphone Error: ${error.name}.`;
      } else if (error instanceof Error) {
        specificError = error.message;
      }
      setErrorState(specificError);
      setIsRecording(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [
    isLoading,
    isSpeaking,
    isTranscribing,
    isRecording,
    stopRecording,
    sendToAI,
    messages,
  ]);

  // --- Page Lifecycle and Navigation ---
  useEffect(() => {
    if (
      effectRan.current === false &&
      userName &&
      userName.trim() !== "" &&
      messages.length === 0
    ) {
      console.log(">>> Triggering startInterview");
      effectRan.current = true;

      const container = mainContainerRef.current;
      if (container && container.requestFullscreen) {
        container.requestFullscreen().catch((err) => {
          console.warn(`Fullscreen request failed: ${err.message}`);
        });
      }

      sendToAI([])
        .then(() => {
          setInterviewStarted(true);
        })
        .catch((err) => {
          console.error("Error in initial sendToAI:", err);
          setErrorState("Failed to start the interview.");
          setIsLoading(false);
        });
    }

    return () => {
      console.log("InterviewSession Cleanup.");

      const audio = currentAudioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audio.onended = null;
        audio.onerror = null;
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (document.fullscreenElement) {
        document.exitFullscreen().catch((err) => console.warn(err));
      }
    };
  }, [userName, messages.length, sendToAI]);

  // Go Back button handler
  const goBack = useCallback(() => {
    const audio = currentAudioRef.current;
    if (audio) audio.pause();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") stopRecording();

    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());

    currentAudioRef.current = null;
    mediaRecorderRef.current = null;
    streamRef.current = null;

    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => router.push("/"));
    } else {
      router.push("/");
    }
  }, [router, stopRecording]);

  // --- Status Text ---
  const getStatusText = () => {
    if (isRecording) return "Listening... Speak now.";
    if (isTranscribing) return "Processing your response...";
    if (isLoading) return "Alex is thinking...";
    if (isSpeaking) return "Alex is speaking...";
    if (errorState) return "An error occurred.";
    if (interviewStarted) return "It's your turn. Press the mic to speak.";
    return "Connecting to the interview...";
  };

  // --- Return values ---
  return {
    state: {
      isLoading,
      isSpeaking,
      isRecording,
      isTranscribing,
      errorState,
      interviewStarted,
    },
    refs: {
      mainContainerRef,
    },
    handlers: {
      startRecording,
      stopRecording,
      goBack,
    },
    computed: {
      statusText: getStatusText(),
    },
  };
}
