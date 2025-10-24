"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = {
  speaker: "alex" | "user";
  text: string;
};

// This interface accepts all possible props
interface InterviewSessionProps {
  mode: "resume" | "position";
  role?: string;
  skills?: string;
  resumeText?: string; 
}

export default function InterviewSession({
  mode,
  role,
  skills,
  resumeText,
}: InterviewSessionProps) {
  const router = useRouter();
  const [currentMessage, setCurrentMessage] = useState("");

  // This is the hardcoded initial greeting, as you preferred
  const initialGreeting =
    mode === "position" && role
      ? `Hello, I am Alex. I see you're applying for the ${role} role. Before we begin, tell me your name.`
      : "Hello, I am Alex, and this is an interview practice session. I would be interviewing you. Before we begin, tell me your name.";

  const [messages, setMessages] = useState<Message[]>([
    { speaker: "alex", text: initialGreeting },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scrolls the chat window
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendText = async () => {
    if (currentMessage.trim() === "") return;

    const newUserMessage: Message = { speaker: "user", text: currentMessage };
    const newHistory = [...messages, newUserMessage];

    setMessages(newHistory);
    setCurrentMessage("");
    setIsLoading(true);

    try {
      // Calls the backend with all the context
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: newHistory,
          mode: mode,
          role: role,
          skills: skills,
          resume_text: resumeText, // Sends the resume text
        }),
      });

      if (!response.ok) {
        throw new Error("Backend chat failed");
      }

      const data = await response.json();
      const alexReply: Message = { speaker: "alex", text: data.reply };

      setMessages([...newHistory, alexReply]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages([
        ...newHistory,
        { speaker: "alex", text: "Sorry, I had an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => {
    router.push("/");
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          <h2 className="text-2xl font-bold">
            Interview Mode: {mode.charAt(0).toUpperCase() + mode.slice(1)}
            {role && (
              <span className="text-lg text-muted-foreground">{role}</span>
            )}
          </h2>

          <div
            ref={chatContainerRef}
            className="w-full h-80 bg-muted rounded-lg p-4 space-y-3 overflow-y-auto"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.speaker === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`p-2 rounded-lg max-w-[80%] whitespace-pre-wrap ${
                    msg.speaker === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  }`}
                >
                  <p className="inline">{msg.text}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="p-2 rounded-lg bg-background border">
                  <p className="inline text-muted-foreground italic">
                    Alex is thinking...
                  </p>
                </div>
              </div>
            )}
          </div>

          <form
            className="flex w-full space-x-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendText();
            }}
          >
            <Input
              type="text"
              placeholder={
                isLoading ? "Alex is thinking..." : "Type your answer..."
              }
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading}>
              Send
            </Button>
          </form>

          <Button
            className="w-full"
            variant="outline"
            onClick={goBack}
            disabled={isLoading}
          >
            Back to Mode Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}