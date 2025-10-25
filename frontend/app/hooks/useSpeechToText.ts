// app/hooks/useSpeechToText.ts
"use client";

import { useState, useRef, useCallback } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";

interface UseSpeechToTextProps {
  onTranscript: (transcript: string) => void;
  onError: (error: string | null) => void; // <-- THIS LINE IS FIXED
}

export function useSpeechToText({
  onTranscript,
  onError,
}: UseSpeechToTextProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      console.log("[STT-Hook] Stopping recording...");
      recorder.stop();
    } else {
      console.warn("[STT-Hook] Stop called but not recording.");
      if (isRecording) setIsRecording(false);
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    setIsRecording(true);
    onError(null); // This call is now valid

    try {
      console.log("[STT-Hook] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log("[STT-Hook] Microphone access granted.");

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
      console.log(`[STT-Hook] MediaRecorder initialized.`);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        console.log("[STT-Hook] Recording stopped. Processing audio...");
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        setIsTranscribing(true);

        const currentMimeType = recorder.mimeType || AUDIO_MIME_TYPE;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: currentMimeType,
        });
        audioChunksRef.current = [];

        if (audioBlob.size < 100) {
          console.warn("[STT-Hook] Audio blob too small.");
          onError("No speech detected.");
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
            console.log(`[STT-Hook] Transcript: ${data.transcript}`);
            onTranscript(data.transcript.trim()); // Use callback
          } else {
            console.log("[STT-Hook] Received empty transcript.");
            onError("Could not understand audio.");
          }
        } catch (error) {
          console.error("[STT-Hook] Error during STT fetch/process:", error);
          onError(
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
        console.error("[STT-Hook] MediaRecorder error:", errorEvent?.error || event);
        onError(
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
      console.log("[STT-Hook] Recording started.");
    } catch (error) {
      console.error("[STT-Hook] Error starting recording:", error);
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
          specificError = "Microphone is in use or hardware error.";
        else specificError = `Microphone Error: ${error.name}.`;
      } else if (error instanceof Error) {
        specificError = error.message;
      }
      onError(specificError);
      setIsRecording(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [isRecording, onError, onTranscript, stopRecording]);

  // Cleanup function
  const cleanup = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    cleanup,
  };
}