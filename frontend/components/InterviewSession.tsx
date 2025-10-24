"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

// Define the structure for chat messages
type Message = {
  speaker: "alex" | "user";
  text: string;
};

// Define the properties expected by this component
interface InterviewSessionProps {
  mode: "resume" | "position";
  userName: string; // User's name is required from URL param
  role?: string;     // From URL param
  skills?: string;   // From URL param
  resumeText?: string; // From parent state (only for resume mode)
}

// Define backend URL - adjust if your backend runs elsewhere
const BACKEND_URL = "http://localhost:5000";

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
  const [messages, setMessages] = useState<Message[]>([]); // Chat history
  const [isLoading, setIsLoading] = useState<boolean>(true); // For AI thinking (starts true for initial load)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false); // For TTS playback
  const [errorState, setErrorState] = useState<string | null>(null); // To display errors in UI

  // --- Refs ---
  const chatContainerRef = useRef<HTMLDivElement>(null); // For auto-scrolling chat
  const effectRan = useRef<boolean>(false); // StrictMode guard for initial effect
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // Ref to manage audio object

  // --- Audio Playback Function ---
  const speakText = useCallback(async (text: string) => {
    // Basic check for non-speakable content
    if (!text || text.trim() === "" || text.startsWith("Error:") || text.startsWith("An error occurred") || text.startsWith("Sorry,")) {
      console.log("[TTS] Skipping for empty/error/placeholder message.");
      return;
    }

    // Stop and clean up any previous audio instance *before* starting new one
    if (currentAudioRef.current) {
      console.warn("[TTS] speakText called while previous audio might exist, stopping previous.");
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null; // Remove listeners
      currentAudioRef.current.onerror = null;
      currentAudioRef.current = null; // Clear ref
    }
    // Reset speaking state *before* async operations if needed, or rely on finally block
    setIsSpeaking(true);
    setErrorState(null); // Clear previous errors when starting new speech
    let audioUrl: string | null = null;

    try {
      console.log(`[TTS] Requesting for: "${text.substring(0, 60)}..."`);
      const response = await fetch(`${BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error ${response.status}` }));
        console.error("[TTS] Backend failed:", response.status, errorData);
        throw new Error(`Audio Error: ${errorData.error || response.statusText}`);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size === 0 || !audioBlob.type.startsWith('audio/')) {
          console.error("[TTS] Invalid audio blob received:", audioBlob);
          throw new Error("Audio Error: Received invalid audio data.");
      }

      audioUrl = URL.createObjectURL(audioBlob);
      console.log("[TTS] Creating new audio object.");
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio; // Store in ref

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => { console.log("[TTS] Playback finished."); resolve(); };
        audio.onerror = (e) => { console.error("[TTS] HTMLAudioElement error:", e); reject(new Error("Audio playback failed")); };
        console.log("[TTS] Playing audio...");
        audio.play().catch(error => { console.error("[TTS] audio.play() immediate error:", error); reject(error); });
      });

    } catch (error) {
      console.error("[TTS] Error during speakText execution:", error);
      // Set error state to display in UI
      setErrorState(error instanceof Error ? error.message : "An unknown audio error occurred.");
    } finally {
      // Guaranteed cleanup
      console.log("[TTS] Cleaning up speakText state in finally block.");
      setIsSpeaking(false); // Reset speaking state
      currentAudioRef.current = null; // Clear ref after playback attempt
      if (audioUrl) {
        console.log("[TTS] Revoking Object URL");
        URL.revokeObjectURL(audioUrl); // Release Blob memory
      }
    }
  }, []); // No dependencies needed as it uses refs and state setters


  // --- Function to get the first message from the AI ---
  const startInterview = useCallback(async () => {
     // Guard clauses
     if (!userName || userName.trim() === "") { console.error("startInterview abort: No userName."); setErrorState("Cannot start: User name missing."); setIsLoading(false); return; }
     // Ensure it doesn't run again if messages already exist
     if (messages.length > 0) { console.log("startInterview abort: Messages already exist."); setIsLoading(false); return; } // Stop initial loading if already started
     // Ensure it doesn't run if already loading (might happen with fast state changes)
     // if (isLoading) { console.log("startInterview abort: Already loading."); return; } // isLoading check might be redundant if messages.length check is sufficient

    console.log(">>> [FETCH] Preparing startInterview for user:", userName);
    setIsLoading(true); // Explicitly set loading true here
    setErrorState(null);
    setMessages([]); // Ensure messages are clear

    const requestBody = { history: [], mode, role, skills, resume_text: resumeText, user_name: userName };
    console.log("[FETCH] startInterview Request URL:", `${BACKEND_URL}/api/chat`);
    console.log("[FETCH] startInterview Request Body:", JSON.stringify(requestBody, null, 2));

    try {
      console.log(`[FETCH] Calling ${BACKEND_URL}/api/chat (startInterview)`);
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" }, // Added Accept header
        body: JSON.stringify(requestBody),
      });
      console.log("[FETCH] startInterview Response Status:", response.status);

      if (!response.ok) {
           // Try to get more detailed error from backend
           let errorDetail = `Server error ${response.status}: ${response.statusText}`;
           try {
               const errorData = await response.json();
               errorDetail = errorData.error || errorDetail;
           } catch (parseError) {
                console.warn("Could not parse error response as JSON.");
           }
           console.error("[FETCH] startInterview Backend failed:", errorDetail);
           throw new Error(errorDetail);
      }
      const data = await response.json();
      console.log("[FETCH] startInterview Received data:", data);

      if (!data.reply || data.reply.trim() === "") {
          console.warn("[FETCH] Received empty initial reply.");
          // Provide a fallback message
          const fallbackMsg = { speaker: "alex" as const, text: `Hello ${userName}! I seem to be having trouble starting. Could you tell me about yourself?` };
          setMessages([fallbackMsg]);
          speakText(fallbackMsg.text); // Speak the fallback
      } else {
        const firstMessage: Message = { speaker: "alex", text: data.reply };
        setMessages([firstMessage]);
        speakText(firstMessage.text); // Speak the actual first message
      }
    } catch (error) {
      console.error("[FETCH] Error in startInterview fetch/process:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to start interview. Check connection and backend logs.";
      setErrorState(errorMsg); // Show error in UI
      setMessages([]); // Clear messages on failure to start
    } finally {
      setIsLoading(false); // Ensure loading state is reset
    }
  // All props and state variables used inside need to be dependencies
  }, [userName, mode, role, skills, resumeText, speakText, messages.length]); // Added messages.length


  // --- Initial useEffect Hook ---
  useEffect(() => {
    console.log("InterviewSession Mount/Update. userName:", userName, "effectRan:", effectRan.current);
    // Run start logic ONCE when userName is valid AND effect hasn't run AND messages are empty
    if (effectRan.current === false && userName && userName.trim() !== "" && messages.length === 0) {
      console.log(">>> Triggering startInterview from useEffect");
      startInterview(); // Call the memoized function
      effectRan.current = true; // Mark that the effect's core logic has run
    } else {
        console.log("useEffect: Conditions not met to call startInterview.", { effectRan: effectRan.current, userName: !!userName, messagesLength: messages.length });
        // If the component loaded but is waiting for userName, keep loading indicator
        if (!userName && !errorState) {
            // Only set isLoading if it's not already true - avoids loops
            setIsLoading(prev => prev ? prev : true);
        } else if (messages.length === 0 && !errorState) {
            // Name might be present but startInterview hasn't run yet or failed silently
            // This case might indicate an issue needing investigation
             console.warn("useEffect: Name present, no messages, but startInterview didn't run?");
        } else {
             // Either already ran, name missing, or messages exist - stop initial loading indicator
             setIsLoading(false);
        }
    }

    // Cleanup function: runs when the component unmounts
    return () => {
      console.log("InterviewSession Cleanup: Pausing audio on unmount.");
      // Use ref for cleanup to access the latest audio object
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.onended = null;
        currentAudioRef.current.onerror = null;
        // No need to set state here, component is unmounting
      }
      // Reset effectRan if you want the effect to run again if the component remounts
      // effectRan.current = false;
    };
  // Depend on startInterview (memoized) and userName.
  }, [startInterview, userName, errorState]); // Added errorState dependency


  // --- Auto-scroll Effect ---
  useEffect(() => {
    if (chatContainerRef.current) {
      // Use requestAnimationFrame for smoother scrolling after render
      requestAnimationFrame(() => {
          if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
      });
    }
  }, [messages]); // Run whenever messages update


  // --- Function to handle sending user messages ---
  const handleSendText = useCallback(async () => {
    const trimmedMessage = currentMessage.trim();
    if (trimmedMessage === "" || isLoading || isSpeaking) return; // Prevent spam/overlap

    const newUserMessage: Message = { speaker: "user", text: trimmedMessage };
    const historyForAPI = [...messages, newUserMessage]; // History includes the new message

    setMessages(historyForAPI); // Optimistic UI update
    setCurrentMessage(""); // Clear input
    setIsLoading(true); // Start loading indicator
    setErrorState(null); // Clear previous errors

    const requestBody = { history: historyForAPI, mode, role, skills, resumeText, user_name: userName };
    console.log(">>> [FETCH] Calling handleSendText");
    console.log("[FETCH] handleSendText Request URL:", `${BACKEND_URL}/api/chat`);
    console.log("[FETCH] handleSendText Request Body:", JSON.stringify(requestBody).substring(0, 500) + "..."); // Log truncated body

    try {
      console.log(`[FETCH] Calling ${BACKEND_URL}/api/chat (handleSendText)`);
      const response = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(requestBody) });
      console.log("[FETCH] handleSendText Response Status:", response.status);

      if (!response.ok) {
           let errorDetail = `Server error ${response.status}: ${response.statusText}`;
           try { const errorData = await response.json(); errorDetail = errorData.error || errorDetail; } catch {}
           console.error("[FETCH] handleSendText Backend failed:", errorDetail);
           throw new Error(errorDetail);
      }
      const data = await response.json();
      console.log("[FETCH] handleSendText Received data:", data);

       if (!data.reply || data.reply.trim() === "") {
           console.warn("[FETCH] Received empty subsequent reply.");
           // Add a placeholder or error message?
           setMessages(prev => [...prev, { speaker: "alex", text: "(I couldn't generate a response for that. Could you try asking differently?)" }]);
           // No speakText call for this
       } else {
        const alexReply: Message = { speaker: "alex", text: data.reply };
        setMessages(prev => [...prev, alexReply]); // Add Alex's valid reply
        speakText(alexReply.text); // Speak the reply (don't wait)
      }
    } catch (error) {
      console.error("[FETCH] Error in handleSendText fetch/process:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to get response.";
      // Add error message to chat AND set error state for alert
      const errorChatMessage = `Sorry, an error occurred: ${errorMsg}`;
      setMessages(prev => [...prev, { speaker: "alex", text: errorChatMessage }]);
      setErrorState(`Error sending message: ${errorMsg}`);
    } finally {
      setIsLoading(false); // Stop loading indicator
    }
  // All dependencies the function relies on
  }, [currentMessage, isLoading, isSpeaking, messages, mode, role, skills, resumeText, userName, speakText]);


  // --- Go Back Function ---
  const goBack = useCallback(() => {
    // Use ref for cleanup
    if (currentAudioRef.current) {
      console.log("Go Back: Pausing audio");
      currentAudioRef.current.pause();
    }
    router.push("/"); // Navigate to home page
  }, [router]); // Only depends on router


  // Determine if inputs/buttons should be disabled
  const isDisabled = isLoading || isSpeaking;

  // --- Render JSX ---
  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl dark:bg-gray-800 border dark:border-gray-700"> {/* Added border */}
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Header */}
          <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 dark:text-gray-100">
            Interview: {userName || "Loading Name..."} {/* Placeholder if name is somehow missing */}
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
          <div
            ref={chatContainerRef}
            className="w-full h-80 sm:h-96 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4 space-y-3 overflow-y-auto border dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" // Added focus styles
            tabIndex={0} // Make scrollable div focusable for accessibility
          >
            {/* Initial loading/waiting message */}
            {messages.length === 0 && isLoading && !errorState && ( <div className="flex justify-center items-center h-full"><p className="text-muted-foreground italic">Starting interview, please wait...</p></div> )}
            {messages.length === 0 && !isLoading && !errorState && ( <div className="flex justify-center items-center h-full"><p className="text-muted-foreground italic">Interview ready. Alex will greet you shortly.</p></div> )}
            {messages.length === 0 && errorState && ( <div className="flex justify-center items-center h-full"><p className="text-red-600 dark:text-red-400 font-medium">Failed to start interview. Check error above.</p></div> )}

            {/* Message Mapping */}
            {messages.map((msg, index) => (
              <div key={`${msg.speaker}-${index}`} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}> {/* Improved key */}
                <div
                  className={`p-2 px-3 rounded-lg max-w-[85%] sm:max-w-[80%] whitespace-pre-wrap shadow-sm ${
                    msg.speaker === 'user'
                      ? 'bg-blue-600 text-white dark:bg-blue-700'
                      : 'bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-gray-100'
                  }`}
                >
                  <p className="inline text-sm sm:text-base">{msg.text}</p>
                </div>
              </div>
            ))}
            {/* Loading/Speaking Indicator */}
            {(isLoading || isSpeaking) && ( // Show indicator even during initial load if needed
              <div className="flex justify-start pt-2">
                <div className="p-2 px-3 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 border dark:border-gray-500 shadow-sm">
                  <p className="inline text-sm sm:text-base text-muted-foreground dark:text-gray-400 italic">
                    {isLoading ? "Alex is thinking..." : "Alex is speaking..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            className="flex w-full space-x-2"
            onSubmit={(e) => { e.preventDefault(); handleSendText(); }}
          >
            <Input
              type="text"
              placeholder={isDisabled ? "Please wait..." : (messages.length === 0 ? "Waiting to start..." : "Type your answer...")}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              // Disable input until the first message has arrived AND not busy
              disabled={isDisabled || messages.length === 0}
              aria-label="Your answer"
              className="flex-grow dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500" // Added focus styles
            />
            <Button type="submit" disabled={isDisabled || messages.length === 0} aria-label="Send message">
              Send
            </Button>
          </form>

          {/* Back Button */}
          <Button
            className="w-full"
            variant="outline"
            onClick={goBack}
            disabled={isLoading || isSpeaking} // Keep disabled logic simple
            aria-label="Back to mode selection"
          >
            Back to Mode Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}