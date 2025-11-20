"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export function useVideoRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isVideoUploading, setIsVideoUploading] = useState(false); // NEW: Track upload status

  // Start Recording
  const startVideoRecording = useCallback(async () => {
    try {
      // Request permissions
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      streamRef.current = stream;
      
      // Try to use efficient codecs
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
         mimeType = 'video/webm'; // Fallback
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // Save chunks every second
      setIsRecordingVideo(true);
      console.log("[Video-Hook] Recording started");
    } catch (e) {
      console.error("[Video-Hook] Failed to start:", e);
    }
  }, []);

  // Stop and Upload
  const stopAndUploadVideo = useCallback(async (accessKey: string) => {
    // Guard: If already uploading or not recording, skip
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        console.warn("[Video-Hook] Stop called but recorder inactive.");
        return;
    }
    
    setIsVideoUploading(true);

    return new Promise<void>((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      
      if (!recorder) {
          setIsVideoUploading(false);
          resolve();
          return;
      }

      recorder.onstop = async () => {
        console.log("[Video-Hook] Recorder stopped. Processing...");
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        
        // Clean up stream tracks immediately
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsRecordingVideo(false);

        // Upload
        const formData = new FormData();
        formData.append("video", blob, "recording.webm");
        formData.append("key", accessKey);

        try {
          await fetch(`${BACKEND_URL}/api/upload_video`, {
            method: "POST",
            body: formData,
          });
          console.log("[Video-Hook] Upload complete.");
          resolve();
        } catch (e) {
          console.error("[Video-Hook] Upload failed:", e);
          reject(e);
        } finally {
          setIsVideoUploading(false);
          chunksRef.current = []; // Clear memory
        }
      };

      // Trigger stop
      recorder.stop();
    });
  }, []);

  // Cleanup on unmount (Safety net)
  useEffect(() => {
      return () => {
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
          }
      };
  }, []);

  return {
    startVideoRecording,
    stopAndUploadVideo,
    isRecordingVideo,
    isVideoUploading // Export this so we can block UI
  };
}