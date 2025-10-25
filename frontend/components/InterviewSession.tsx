"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Mic, Square } from "lucide-react"; // Icons for STT

// --- Type Definitions ---
type Message = {
  speaker: "alex" | "user";
  text: string;
};

interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string; // User's name is required
  role?: string;
  skills?: string;
  resumeText?: string;
}

// --- Constants ---
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"; // Use environment variable or default
const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus'; // Preferred MIME type

export default function InterviewSession({
  mode,
  userName,
  role,
  skills,
  resumeText,
}: InterviewSessionProps) {
  const router = useRouter();

  // --- State Variables ---
  const [currentMessage, setCurrentMessage] = useState<string>(""); // Input field content
  const [messages, setMessages] = useState<Message[]>([]); // Conversation history
  const [isLoading, setIsLoading] = useState<boolean>(true); // AI thinking or initial load
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false); // TTS playback active
  const [errorState, setErrorState] = useState<string | null>(null); // To display errors in UI
  const [isRecording, setIsRecording] = useState<boolean>(false); // STT recording active
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false); // STT processing active

  // --- Refs ---
  const chatContainerRef = useRef<HTMLDivElement>(null); // For auto-scrolling chat
  const effectRan = useRef<boolean>(false); // StrictMode guard for initial effect
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Holds current TTS audio object
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // Holds MediaRecorder instance
  const audioChunksRef = useRef<Blob[]>([]); // Stores recorded audio chunks
  const streamRef = useRef<MediaStream | null>(null); // Holds the microphone stream

  // --- Function Definitions (Order matters for useCallback dependencies) ---

  // TTS Playback
  const speakText = useCallback(async (text: string) => {
    if (!text || text.trim() === "" || text.startsWith("Error:") || text.startsWith("An error occurred") || text.startsWith("Sorry,")) {
      console.log("[TTS] Skipping non-speakable text.");
      return;
    }
    // Stop previous audio safely using the ref
    if (currentAudioRef.current) {
      console.warn("[TTS] speakText called while previous audio exists, stopping it.");
      currentAudioRef.current.pause();
      currentAudioRef.current.src = ''; // Release resource
      currentAudioRef.current.onended = null; currentAudioRef.current.onerror = null;
      currentAudioRef.current = null;
    }
    // Set speaking BEFORE async
    setIsSpeaking(true);
    setErrorState(null); // Clear errors when starting new speech attempt
    let audioUrl: string | null = null;
    console.log(`[TTS] Requesting for: "${text.substring(0, 60)}..."`);
    try {
      const response = await fetch(`${BACKEND_URL}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) { const d = await response.json().catch(()=>({error:`Server error ${response.status}`})); throw new Error(`Audio Error: ${d.error || response.statusText}`); }
      const blob = await response.blob();
      if (blob.size < 100 || !blob.type.startsWith('audio/')) { throw new Error("Audio Error: Invalid data received."); } // Increased size check
      audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio; // Store ref *before* play

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => { console.log("[TTS] Playback finished."); resolve(); };
        audio.onerror = (e) => { console.error("[TTS] HTMLAudioElement error:", e); reject(new Error("Audio playback failed")); };
        audio.play().catch(reject); // Play and catch immediate errors
      });
    } catch (error) {
      console.error("[TTS] Error:", error);
      setErrorState(error instanceof Error ? error.message : "Unknown audio error.");
    } finally {
      console.log("[TTS] Cleaning up state.");
      setIsSpeaking(false);
      // Ensure ref is cleared even if play fails early
      currentAudioRef.current = null;
      if (audioUrl) { URL.revokeObjectURL(audioUrl); }
    }
  }, []); // No external state dependencies needed here

  // Send message to AI (used by both text input and STT)
  const sendToAI = useCallback(async (historyWithUserMessage: Message[]) => {
    setIsLoading(true); setErrorState(null); // Start loading

    const requestBody = { history: historyWithUserMessage, mode, role, skills, resumeText, user_name: userName };
    console.log(">>> [FETCH] Calling sendToAI");
    console.log("[FETCH] sendToAI Request Body (Preview):", JSON.stringify(requestBody).substring(0, 300) + "...");

    try {
      console.log(`[FETCH] Calling ${BACKEND_URL}/api/chat (sendToAI)`);
      const response = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(requestBody) });
      console.log("[FETCH] sendToAI Response Status:", response.status);
      if (!response.ok) { let eD = `Server error ${response.status}`; try { const d = await response.json(); eD = d.error || eD; } catch {} throw new Error(eD); }
      const data = await response.json();
      console.log("[FETCH] sendToAI Received data:", data);

       if (!data.reply || data.reply.trim() === "") {
           console.warn("[FETCH] Received empty reply.");
           setMessages(prev => [...prev, { speaker: "alex", text: "(No response generated. You can continue or ask differently.)" }]);
       } else {
        const alexReply: Message = { speaker: "alex", text: data.reply };
        setMessages(prev => [...prev, alexReply]); // Add Alex's valid reply
        speakText(alexReply.text); // Speak the reply
      }
    } catch (error) {
      console.error("[FETCH] Error in sendToAI fetch/process:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to get response.";
      setMessages(prev => [...prev, { speaker: "alex", text: `Sorry, an error occurred: ${errorMsg}` }]);
      setErrorState(`Error getting AI response: ${errorMsg}`);
    } finally {
      setIsLoading(false); // Stop loading indicator
    }
  // Dependencies: All props/state read and callbacks called
  }, [mode, role, skills, resumeText, userName, speakText]); // Removed messages, isLoading, isSpeaking


  // Handle TEXT INPUT submission
  const handleSendText = useCallback(() => {
    const trimmedMessage = currentMessage.trim();
    if (trimmedMessage === "" || isLoading || isSpeaking || isRecording || isTranscribing) { // Check all busy states
      console.log("handleSendText: Aborting - empty or busy.");
      return;
    }
    const newUserMessage: Message = { speaker: "user", text: trimmedMessage };
    setMessages(prev => [...prev, newUserMessage]); // Update UI optimistically
    setCurrentMessage(""); // Clear input
    sendToAI([...messages, newUserMessage]); // Call the common AI function
  // Dependencies: Include necessary state reads and the sendToAI callback
  }, [currentMessage, isLoading, isSpeaking, isRecording, isTranscribing, messages, sendToAI]);


  // --- Speech-to-Text (STT) Logic ---

  // Stop recording
  const stopRecording = useCallback(() => {
    // Check ref and state for safety
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log("[STT] Stopping recording via stopRecording function...");
      mediaRecorderRef.current.stop(); // This triggers 'onstop' where state changes happen
    } else {
      console.warn("[STT] Stop called but not recording/no recorder.");
      // Force state reset if somehow out of sync AND release stream
      if (isRecording) setIsRecording(false);
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    }
  }, [isRecording]); // Depends only on isRecording read state


  // Start recording
  const startRecording = useCallback(async () => {
    // Combined busy check
    const busy = isLoading || isSpeaking || isTranscribing || isRecording;
    if (busy) { console.warn("[STT] startRecording called while busy."); return; }
    setErrorState(null);

    try {
      console.log("[STT] Requesting microphone access...");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("MediaDevices API not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log("[STT] Microphone access granted.");

      if (!window.MediaRecorder) { throw new Error("MediaRecorder API not supported."); }
      let options = { mimeType: AUDIO_MIME_TYPE };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: '' }; } // Fallback

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = []; // Reset chunks
      console.log(`[STT] MediaRecorder initialized. MimeType: ${recorder.mimeType}`);

      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };

      recorder.onstop = async () => {
        console.log("[STT] Recording stopped. Processing audio...");
        streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
        setIsRecording(false); setIsTranscribing(true); setErrorState(null);

        const currentMimeType = recorder.mimeType || AUDIO_MIME_TYPE;
        const audioBlob = new Blob(audioChunksRef.current, { type: currentMimeType });
        console.log(`[STT] Final blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        const localChunks = [...audioChunksRef.current]; // Copy if needed, then clear ref
        audioChunksRef.current = [];

        if (audioBlob.size < 100) { console.warn("[STT] Audio blob too small."); setErrorState("No speech detected."); setIsTranscribing(false); return; }

        const formData = new FormData();
        const fileExtension = currentMimeType.split('/')[1]?.split(';')[0] || 'webm';
        formData.append('audio_blob', audioBlob, `recording.${fileExtension}`);

        try {
          console.log(`>>> [FETCH] Calling ${BACKEND_URL}/api/stt`);
          const response = await fetch(`${BACKEND_URL}/api/stt`, { method: 'POST', body: formData });
          console.log("[FETCH] /api/stt Response Status:", response.status);
          if (!response.ok) { let eD = `STT Error ${response.status}`; try { const d = await response.json(); eD = d.error || eD; } catch {} throw new Error(eD); }
          const data = await response.json();
          console.log("[FETCH] /api/stt Received data:", data);

          if (data.transcript && data.transcript.trim() !== "") {
            const transcript = data.transcript.trim();
            console.log(`[STT] Transcription result: "${transcript}"`);
            // Add user message THEN call AI function
            const newUserMessage: Message = { speaker: "user", text: transcript };
            setMessages(prev => [...prev, newUserMessage]); // Update UI first
            sendToAI([...messages, newUserMessage]); // Send history *including* new message
          } else {
            console.log("[STT] Received empty transcript.");
            setErrorState("Could not understand audio.");
          }
        } catch (error) {
          console.error("[FETCH] Error during STT fetch/process:", error);
          setErrorState(error instanceof Error ? error.message : "Failed to transcribe audio.");
        } finally {
          setIsTranscribing(false); // Processing finished
        }
      };

      recorder.onerror = (event: Event) => {
           const errorEvent = event as any;
           console.error("[STT] MediaRecorder error:", errorEvent?.error || event);
           setErrorState(`Recording error: ${errorEvent?.error?.message || 'Unknown recorder error'}.`);
           // Ensure cleanup happens
           if (isRecording) stopRecording();
           else { setIsRecording(false); setIsTranscribing(false); /* ... cleanup refs ... */ }
            streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
            mediaRecorderRef.current = null; audioChunksRef.current = [];
      };

      recorder.start(); // Start recording
      setIsRecording(true);
      console.log("[STT] Recording started.");

    } catch (error) {
      console.error("[STT] Error accessing mic/starting recording:", error);
      // Handle permission/device errors more specifically
      let specificError = "Could not start recording.";
      if (error instanceof DOMException) {
          if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') specificError = "Microphone access denied.";
          else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') specificError = "No microphone found.";
          else if (error.name === 'NotReadableError') specificError = "Microphone is already in use or hardware error.";
          else specificError = `Microphone Error: ${error.name}.`;
      } else if (error instanceof Error) {
           specificError = error.message;
      }
      setErrorState(specificError);
      setIsRecording(false);
       if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    }
  // Dependencies: Includes busy states and the callbacks it uses
  }, [isLoading, isSpeaking, isTranscribing, isRecording, stopRecording, sendToAI, messages]); // Added messages


  // --- Function to get the first message (Moved after handleSendText/speakText definition) ---
  const startInterview = useCallback(async () => {
     if (!userName || userName.trim() === "") { console.error("startInterview abort: No userName."); setErrorState("Cannot start: User name missing."); setIsLoading(false); return; }
     if (messages.length > 0) { console.log("startInterview abort: Messages exist."); setIsLoading(false); return; }

    console.log(">>> [FETCH] Preparing startInterview for user:", userName);
    setIsLoading(true); setErrorState(null); setMessages([]);

    const requestBody = { history: [], mode, role, skills, resume_text: resumeText, user_name: userName };
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(requestBody) });
      if (!response.ok) { let eD = `Server error ${response.status}`; try { const d = await response.json(); eD = d.error || eD; } catch {} throw new Error(eD); }
      const data = await response.json();

      if (!data.reply || data.reply.trim() === "") {
          const fallbackMsg = { speaker: "alex" as const, text: `Hello ${userName}! Welcome. Please tell me a bit about yourself to start.` };
          setMessages([fallbackMsg]);
          speakText(fallbackMsg.text);
      } else {
        const firstMessage: Message = { speaker: "alex", text: data.reply };
        setMessages([firstMessage]);
        speakText(firstMessage.text);
      }
    } catch (error) {
      console.error("[FETCH] Error in startInterview:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to start interview.";
      setErrorState(errorMsg); setMessages([]);
    } finally {
      setIsLoading(false);
    }
  // All props/state read and callbacks called
  }, [userName, mode, role, skills, resumeText, speakText]); // Removed isLoading, messages.length


  // --- Initial useEffect Hook ---
  useEffect(() => {
    console.log("InterviewSession Mount/Update. userName:", userName, "effectRan:", effectRan.current, "msgLen:", messages.length);
    // Run start logic ONCE when userName is valid AND effect hasn't run AND messages are empty
    if (effectRan.current === false && userName && userName.trim() !== "" && messages.length === 0) {
      console.log(">>> Triggering startInterview from useEffect");
      startInterview(); // Call the memoized function
      effectRan.current = true; // Mark that the effect's core logic has run
    } else {
      console.log("useEffect: Conditions not met.", { effectRan: effectRan.current, userName: !!userName, messagesLength: messages.length });
      // Manage initial loading indicator more precisely
      if (!userName && !errorState) { setIsLoading(true); } // Waiting for name
      else if (messages.length === 0 && !errorState && !isLoading && effectRan.current) { setIsLoading(false); } // Started but maybe failed silently
      else if (messages.length > 0 || errorState) { setIsLoading(false); } // Started successfully or errored
    }
    // Cleanup function
    return () => {
      console.log("InterviewSession Cleanup: Pausing audio, stopping stream/recording.");
      if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current.src=''; currentAudioRef.current.onended=null; currentAudioRef.current.onerror=null; }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") { mediaRecorderRef.current.stop(); }
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    };
  // userName is key trigger, startInterview is the action
  }, [startInterview, userName, errorState, messages.length]);


  // --- Auto-scroll Effect ---
  useEffect(() => {
    if (chatContainerRef.current) { requestAnimationFrame(() => { if (chatContainerRef.current) { chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; } }); }
  }, [messages]);


  // --- Go Back Function ---
  const goBack = useCallback(() => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") { stopRecording(); }
    else if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    router.push("/");
  }, [router, stopRecording]); // stopRecording is memoized


  // Determine overall disabled state
  const isDisabled = isLoading || isSpeaking || isRecording || isTranscribing;

  // --- Render JSX ---
  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl dark:bg-gray-800 border dark:border-gray-700">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Header */}
          <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 dark:text-gray-100">
            Interview: {userName || "Loading..."}
            {role && <span className="block sm:inline text-base sm:text-lg text-muted-foreground sm:ml-2">({role})</span>}
          </h2>

          {/* Error Alert */}
          {errorState && (
             <Alert variant="destructive" className="w-full">
               <Terminal className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{errorState}</AlertDescription>
             </Alert>
           )}

          {/* Chat Window */}
          <div ref={chatContainerRef} className="w-full h-80 sm:h-96 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4 space-y-3 overflow-y-auto border dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" tabIndex={0}>
            {/* Initial loading/waiting messages */}
            {messages.length === 0 && isLoading && !errorState && ( <div className="flex justify-center items-center h-full"><p className="text-muted-foreground italic">Starting interview...</p></div> )}
            {messages.length === 0 && !isLoading && !errorState && ( <div className="flex justify-center items-center h-full"><p className="text-muted-foreground italic">Interview ready.</p></div> )}
            {messages.length === 0 && errorState && ( <div className="flex justify-center items-center h-full"><p className="text-red-600 dark:text-red-400 font-medium">Failed to start. Check error.</p></div> )}

            {/* Message Mapping */}
            {messages.map((msg, index) => (
              <div key={`${msg.speaker}-${index}-${msg.text.substring(0, 10)}`} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-2 px-3 rounded-lg max-w-[85%] sm:max-w-[80%] whitespace-pre-wrap shadow-sm ${msg.speaker === 'user' ? 'bg-blue-600 text-white dark:bg-blue-700' : 'bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-gray-100'}`}>
                  <p className="inline text-sm sm:text-base">{msg.text}</p>
                </div>
              </div>
            ))}

            {/* Combined Status Indicator */}
            {(isLoading || isSpeaking || isRecording || isTranscribing) && (
              <div className="flex justify-start pt-2">
                <div className="p-2 px-3 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 border dark:border-gray-500 shadow-sm">
                  <p className="inline text-sm sm:text-base text-muted-foreground dark:text-gray-400 italic">
                    {isRecording ? "Listening..." :
                     isTranscribing ? "Processing..." :
                     isLoading ? "Thinking..." :
                     isSpeaking ? "Speaking..." : "Please wait..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex w-full items-center space-x-2">
            {/* Text Input Form */}
            <form className="flex-grow flex space-x-2" onSubmit={(e) => { e.preventDefault(); handleSendText(); }}>
              <Input
                type="text"
                placeholder={isDisabled ? "Please wait..." : (messages.length === 0 ? "Waiting..." : "Type or record...")}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                // Disable unless idle AND first message received
                disabled={isDisabled || messages.length === 0}
                aria-label="Your answer"
                className="flex-grow dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
              />
              {/* Send button only shown if not recording */}
              {!isRecording && (
                <Button type="submit" disabled={isDisabled || messages.length === 0 || currentMessage.trim() === ""} aria-label="Send message">
                    Send
                </Button>
               )}
            </form>

            {/* Record/Stop Button */}
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              // Disable unless idle AND first message received
              disabled={isLoading || isSpeaking || isTranscribing || messages.length === 0}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              title={isRecording ? "Stop recording" : "Start recording"}
              className="dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              {isRecording ? <Square className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
            </Button>
          </div>

          {/* Back Button */}
          <Button className="w-full" variant="outline" onClick={goBack} disabled={isRecording || isTranscribing} aria-label="Back to mode selection"> {/* Only disable if recording/transcribing */}
            Back to Mode Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}