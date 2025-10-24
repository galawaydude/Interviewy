"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
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

// This wrapper is needed to use useSearchParams
export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State for the dialogs
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  
  // State to hold the resume text
  const [resumeText, setResumeText] = useState<string | undefined>(undefined);

  // Read URL params
  const interviewMode = searchParams.get("mode");
  const role = searchParams.get("role");
  const skills = searchParams.get("skills");

  // This runs when the PositionForm is submitted
  const handlePositionSubmit = (submittedRole: string, submittedSkills: string) => {
    const encodedRole = encodeURIComponent(submittedRole);
    const encodedSkills = encodeURIComponent(submittedSkills);
    router.push(`/?mode=position&role=${encodedRole}&skills=${encodedSkills}`);
  };

  // This runs when the ResumeUploadDialog is submitted
  const handleResumeSubmit = (extractedText: string) => {
    setResumeText(extractedText); // Save the text
    router.push(`/?mode=resume`); // Navigate to the interview
  };
  
  // This logic handles the user clicking the browser's "Back" button
  useEffect(() => {
    if (searchParams.get("mode") === "resume" && !resumeText) {
      router.push("/");
    }
  }, [searchParams, resumeText, router]);


  // If the URL has a mode, show the interview
  if (interviewMode) {
    return (
      <main className="flex min-h-screen items-center justify-center p-24 bg-background">
        <InterviewSession
          mode={interviewMode as "resume" | "position"}
          role={role || undefined}
          skills={skills || undefined}
          resumeText={resumeText} // Pass the resume text
        />
      </main>
    );
  }

  // If no mode, show the welcome cards
  return (
    <>
      <main className="flex min-h-screen items-center justify-center p-24 bg-background">
        <div className="flex flex-col items-center text-center max-w-lg">
          <h1 className="text-4xl font-bold mb-4">
            Welcome to the AI Interviewer
          </h1>
          <p className="text-lg text-muted-foreground mb-12">
            Please select your interview mode to begin.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Mode 1: Resume Interview */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Resume Interview</CardTitle>
                <CardDescription>
                  Upload your resume and get interviewed on your experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setShowResumeDialog(true)} // Opens resume dialog
                >
                  Start Resume Interview
                </Button>
              </CardContent>
            </Card>

            {/* Mode 2: Position Interview */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Position Interview</CardTitle>
                <CardDescription>
                  Choose a role and get interviewed for that specific position.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => setShowPositionDialog(true)} // Opens position dialog
                >
                  Start Position Interview
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* The dialogs are hidden until their state is true */}
      <PositionForm
        open={showPositionDialog}
        onOpenChange={setShowPositionDialog}
        onSubmit={handlePositionSubmit}
      />
      
      <ResumeUploadDialog
        open={showResumeDialog}
        onOpenChange={setShowResumeDialog}
        onSubmit={handleResumeSubmit}
      />
    </>
  );
}