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
  // A simple loading indicator while the page or components load
  return (
    <main className="flex min-h-screen items-center justify-center p-24 bg-background">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">Loading Interviewer...</p>
        {/* You could add an actual spinner icon here */}
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

  // State to hold data passed to the InterviewSession (cleared on navigating back home)
  // These are primarily needed for the resume flow to persist the extracted text
  const [resumeText, setResumeText] = useState<string | undefined>(undefined);
  const [userNameForResume, setUserNameForResume] = useState<string | undefined>(undefined);

  // Read URL parameters on every render
  const interviewMode = searchParams.get("mode");
  const role = searchParams.get("role");
  const skills = searchParams.get("skills");
  const nameParam = searchParams.get("name"); // Name from URL

  // Handler for PositionForm submission
  const handlePositionSubmit = useCallback((
    submittedName: string,
    submittedRole: string,
    submittedSkills: string
  ) => {
    // Clear potentially lingering resume state from previous sessions
    setResumeText(undefined);
    setUserNameForResume(undefined);

    const encodedName = encodeURIComponent(submittedName);
    const encodedRole = encodeURIComponent(submittedRole);
    const encodedSkills = encodeURIComponent(submittedSkills);
    // Navigate with all details in URL params
    console.log(`Navigating to position interview for ${submittedName}`);
    router.push(`/?mode=position&name=${encodedName}&role=${encodedRole}&skills=${encodedSkills}`);
  }, [router]); // router is a stable dependency


  // Handler for ResumeUploadDialog submission
  const handleResumeSubmit = useCallback((extractedText: string) => {
    // Resume mode needs the name. Use prompt as placeholder.
    const name = prompt("Please enter your name:");
    if (!name || name.trim() === "") {
        alert("Name is required to start the interview.");
        setShowResumeDialog(false); // Close dialog on failure
        return; // Don't proceed without a name
    }

    // Clear potentially lingering position state
    // (Not strictly necessary as URL params override, but good practice)

    setUserNameForResume(name); // Persist name for this session
    setResumeText(extractedText); // Persist resume text for this session
    const encodedName = encodeURIComponent(name);
    console.log(`Navigating to resume interview for ${name}`);
    router.push(`/?mode=resume&name=${encodedName}`);
  }, [router]); // router is stable


  // Effect to clear session state (resumeText, userNameForResume) when navigating back to home
  useEffect(() => {
    // If there's no 'mode' param, we are on the home screen
    if (!searchParams.get("mode")) {
      console.log("On home screen, clearing session state.");
      setResumeText(undefined);
      setUserNameForResume(undefined);
    }
  }, [searchParams]); // Rerun when URL parameters change


  // --- Conditional Rendering ---

  // If mode and name are present in URL, render the Interview Session
  if (interviewMode && nameParam) {
    console.log("Rendering InterviewSession with mode:", interviewMode, "name:", nameParam);
    // Decode URL parameters safely
    const decodedName = decodeURIComponent(nameParam);
    const decodedRole = role ? decodeURIComponent(role) : undefined;
    const decodedSkills = skills ? decodeURIComponent(skills) : undefined;

    // Determine the resume text to pass - only if mode is 'resume'
    // Use state which persists across renders after upload, fallback needed?
    const currentResumeText = (interviewMode === 'resume') ? resumeText : undefined;
    // Name passed to InterviewSession should be the one from the URL param
    const currentUserName = decodedName;


    return (
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800"> {/* Added background */}
        <InterviewSession
          mode={interviewMode as "resume" | "position"}
          userName={currentUserName} // Pass name from URL
          role={decodedRole}
          skills={decodedSkills}
          resumeText={currentResumeText} // Pass resumeText from state
        />
      </main>
    );
  }

  // --- Otherwise, render the Welcome Screen ---
  console.log("Rendering Welcome Screen");
  return (
    <>
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800"> {/* Added background */}
        <div className="flex flex-col items-center text-center max-w-lg w-full px-4">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Welcome to the AI Interviewer 🤖
          </h1>
          <p className="text-md sm:text-lg text-muted-foreground mb-12">
            Select an interview mode to practice your skills.
          </p>

          {/* Grid layout for cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full">
            {/* Resume Card */}
            <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300 dark:bg-gray-800"> {/* Added style */}
              <CardHeader>
                <CardTitle className="dark:text-gray-100">Resume Interview</CardTitle>
                <CardDescription>
                  Upload your resume (PDF) and get interviewed based on your experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                       console.log("Resume button clicked");
                       setShowResumeDialog(true);
                  }}
                  aria-label="Start resume interview"
                >
                  Start Resume Interview
                </Button>
              </CardContent>
            </Card>

            {/* Position Card */}
            <Card className="w-full shadow-lg hover:shadow-xl transition-shadow duration-300 dark:bg-gray-800"> {/* Added style */}
              <CardHeader>
                <CardTitle className="dark:text-gray-100">Position Interview</CardTitle>
                <CardDescription>
                  Specify a role & skills and get interviewed for that position.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                      console.log("Position button clicked");
                      setShowPositionDialog(true);
                  }}
                  aria-label="Start position interview"
                >
                  Start Position Interview
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Dialogs rendered conditionally */}
      <PositionForm
        key="position-dialog" // Add key for state reset if needed
        open={showPositionDialog}
        onOpenChange={setShowPositionDialog}
        onSubmit={handlePositionSubmit}
      />
      <ResumeUploadDialog
        key="resume-dialog" // Add key
        open={showResumeDialog}
        onOpenChange={setShowResumeDialog}
        onSubmit={handleResumeSubmit}
      />
    </>
  );
}