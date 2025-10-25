// app/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import InterviewSession from "@/components/InterviewSession";
import PositionForm from "@/components/PositionForm";
import ResumeUploadDialog from "@/components/ResumeUploadDialog";

// Suspense wrapper is necessary for useSearchParams in App Router
export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HomePageContent />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <main className="flex min-h-screen items-center justify-center p-24 bg-background">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">Loading Interviewer...</p>
      </div>
    </main>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State for controlling dialog visibility
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  // State to hold data passed to the InterviewSession
  const [resumeText, setResumeText] = useState<string | undefined>(undefined);
  const [userNameForResume, setUserNameForResume] = useState<string | undefined>(
    undefined
  );

  // State for permission loading
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Read URL parameters on every render
  const interviewMode = searchParams.get("mode");
  const role = searchParams.get("role");
  const skills = searchParams.get("skills");
  const nameParam = searchParams.get("name");

  // Mic Permission Flow
  const handlePositionSubmit = useCallback(async (
    submittedName: string,
    submittedRole: string,
    submittedSkills: string
  ) => {
    setIsRequestingPermission(true);
    setPermissionError(null);

    try {
      console.log("Requesting microphone permission...");
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted.");

      setResumeText(undefined);
      setUserNameForResume(undefined);

      const encodedName = encodeURIComponent(submittedName);
      const encodedRole = encodeURIComponent(submittedRole);
      const encodedSkills = encodeURIComponent(submittedSkills);

      // Close the dialog *before* navigating
      setShowPositionDialog(false);

      console.log(`Navigating to position interview for ${submittedName}`);
      router.push(`/?mode=position&name=${encodedName}&role=${encodedRole}&skills=${encodedSkills}`);

    } catch (err) {
      console.error("Microphone permission error:", err);
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setPermissionError("Microphone access was denied. You must allow it in your browser settings to continue.");
      } else {
        setPermissionError("Could not access microphone. Please check your hardware and permissions.");
      }
      setIsRequestingPermission(false);
    }
  }, [router]); // Keep router dependency


  // Handler for ResumeUploadDialog submission (also fixed)
  const handleResumeSubmit = useCallback(async (extractedText: string) => {
    const name = prompt("Please enter your name:");
    if (!name || name.trim() === "") {
      alert("Name is required to start the interview.");
      setShowResumeDialog(false);
      return;
    }

    setIsRequestingPermission(true);
    setPermissionError(null);

    try {
      console.log("Requesting microphone permission...");
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted.");

      setUserNameForResume(name);
      setResumeText(extractedText);
      const encodedName = encodeURIComponent(name);

      // Also close resume dialog here
      setShowResumeDialog(false);

      console.log(`Navigating to resume interview for ${name}`);
      router.push(`/?mode=resume&name=${encodedName}`);

    } catch (err) {
      console.error("Microphone permission error:", err);
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        alert("Microphone access was denied. Please allow it in your browser settings to continue.");
      } else {
        alert("Could not access microphone. Please check your hardware and permissions.");
      }
      setIsRequestingPermission(false);
    }
  }, [router]);


  // --- ✅ FIX IS HERE ---
  // Effect to clear ALL relevant state when navigating back to home
  useEffect(() => {
    // If there's no 'mode' param, we are on the home screen
    if (!searchParams.get("mode")) {
      console.log("On home screen, clearing session state.");
      setResumeText(undefined);
      setUserNameForResume(undefined);
      // Reset permission state as well
      setIsRequestingPermission(false);
      setPermissionError(null);
    }
  }, [searchParams]); // Rerun when URL parameters change
  // --- END FIX ---


  // --- Conditional Rendering ---

  // If mode and name are present, render Interview Session
  if (interviewMode && nameParam) {
    console.log("Rendering InterviewSession...");
    const decodedName = decodeURIComponent(nameParam);
    const decodedRole = role ? decodeURIComponent(role) : undefined;
    const decodedSkills = skills ? decodeURIComponent(skills) : undefined;
    const currentResumeText = (interviewMode === 'resume') ? resumeText : undefined;
    const currentUserName = decodedName;

    return (
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800">
        <InterviewSession
          mode={interviewMode as "resume" | "position"}
          userName={currentUserName}
          role={decodedRole}
          skills={decodedSkills}
          resumeText={currentResumeText}
        />
      </main>
    );
  }

  // --- Otherwise, render the Welcome Screen ---
  return (
    <>
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800">
        <div className="flex flex-col items-center text-center max-w-lg w-full px-4">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Welcome to the AI Interviewer 🤖
          </h1>
          <p className="text-md sm:text-lg text-muted-foreground mb-12">
            Select an interview mode to practice your skills.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full">
            {/* Resume Card */}
            <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300 dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="dark:text-gray-100">Resume Interview</CardTitle>
                <CardDescription>
                  Upload your resume (PDF) and get interviewed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setShowResumeDialog(true)}
                  disabled={isRequestingPermission}
                  aria-label="Start resume interview"
                >
                  {isRequestingPermission ? "Checking Mic..." : "Start Resume Interview"}
                </Button>
              </CardContent>
            </Card>

            {/* Position Card */}
            <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300 dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="dark:text-gray-100">Position Interview</CardTitle>
                <CardDescription>
                  Specify a role & skills and get interviewed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setShowPositionDialog(true)}
                  disabled={isRequestingPermission}
                  aria-label="Start position interview"
                >
                  {isRequestingPermission ? "Checking Mic..." : "Start Position Interview"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Show permission error from the form dialog */}
          {permissionError && (
             <p className="mt-4 text-red-500 dark:text-red-400 text-sm text-center">{permissionError}</p>
          )}
        </div>
      </main>

      {/* Dialogs rendered conditionally */}
      <PositionForm
        key="position-dialog"
        open={showPositionDialog}
        // Pass setShowPositionDialog correctly
        onOpenChange={(isOpen) => !isRequestingPermission && setShowPositionDialog(isOpen)}
        onSubmit={handlePositionSubmit}
        isLoading={isRequestingPermission}
        error={permissionError}
      />
      <ResumeUploadDialog
        key="resume-dialog"
        open={showResumeDialog}
        onOpenChange={(isOpen) => !isRequestingPermission && setShowResumeDialog(isOpen)} // Also prevent closing resume dialog
        onSubmit={handleResumeSubmit}
        // Pass loading state if you add it to ResumeUploadDialog
        // isLoading={isRequestingPermission}
      />
    </>
  );
}