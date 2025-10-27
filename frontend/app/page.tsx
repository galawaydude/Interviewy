"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import InterviewSession from "@/components/InterviewSession";
import PositionForm from "@/components/PositionForm";
import ResumeUploadDialog from "@/components/ResumeUploadDialog";
// --- 1. IMPORT THE NEW DIALOG ---
import NameConfirmationDialog from "@/components/NameConfirmationDialog";
import { FileText, Briefcase, Mic } from "lucide-react";
import { TypeAnimation } from "react-type-animation";

// Suspense wrapper
export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HomePageContent />
    </Suspense>
  );
}

// Loading Spinner
function LoadingSpinner() {
  return (
    <main className="flex min-h-screen items-center justify-center p-24 bg-white">
      <div className="text-center">
        <p className="text-lg text-gray-500 animate-pulse">
          Loading Interviewer...
        </p>
      </div>
    </main>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  
  // --- 2. STATE FOR THE NEW FLOW ---
  const [resumeData, setResumeData] = useState<{ text: string, name: string } | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // --- These states are for the *final* interview ---
  const [resumeText, setResumeText] = useState<string | undefined>(undefined);
  const [userNameForResume, setUserNameForResume] = useState<
    string | undefined
  >(undefined);
  

  // Animation staging (unchanged)
  const [showTitle, setShowTitle] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showArrows, setShowArrows] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowTitle(true), 100);
    const t2 = setTimeout(() => setShowSubtitle(true), 1200);
    const t3 = setTimeout(() => setShowHowItWorks(true), 2200);
    const t4 = setTimeout(() => setShowCards(true), 3200);
    const t5 = setTimeout(() => setShowArrows(true), 5000);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5);
    };
  }, []);

  // URL Params (unchanged)
  const interviewMode = searchParams.get("mode");
  const role = searchParams.get("role");
  const skills = searchParams.get("skills");
  const nameParam = searchParams.get("name");

  // `handlePositionSubmit` is unchanged
  const handlePositionSubmit = useCallback(
    async (submittedName: string, submittedRole: string, submittedSkills: string) => {
      setIsRequestingPermission(true);
      setPermissionError(null);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setResumeText(undefined);
        setUserNameForResume(undefined);
        const encodedName = encodeURIComponent(submittedName);
        const encodedRole = encodeURIComponent(submittedRole);
        const encodedSkills = encodeURIComponent(submittedSkills);
        setShowPositionDialog(false);
        router.push(
          `/?mode=position&name=${encodedName}&role=${encodedRole}&skills=${encodedSkills}`
        );
      } catch (err: any) {
        if (
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        ) {
          setPermissionError(
            "Microphone access was denied. You must allow it in your browser settings to continue."
          );
        } else {
          setPermissionError(
            "Could not access microphone. Please check your hardware and permissions."
          );
        }
        setIsRequestingPermission(false);
      }
    },
    [router]
  );

  // --- 3. MODIFIED `handleResumeSubmit` ---
  const handleResumeSubmit = useCallback(
    (extractedText: string, extractedName: string) => {
      setResumeData({ text: extractedText, name: extractedName });
      setShowResumeDialog(false); // Close upload dialog
    },
    [] 
  );

  // --- 4. NEW HANDLER for the NameConfirmationDialog ---
  const handleNameConfirmation = useCallback(
    async (confirmedName: string) => {
      if (!resumeData) return; 

      const resumeText = resumeData.text;

      setIsRequestingPermission(true);
      setPermissionError(null);

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const finalName = confirmedName.trim() || "Candidate";
        setUserNameForResume(finalName);
        setResumeText(resumeText);
        const encodedName = encodeURIComponent(finalName);
        
        setResumeData(null); // Close the name confirmation dialog
        router.push(`/?mode=resume&name=${encodedName}`);
      } catch (err: any) {
        if (
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        ) {
           setPermissionError(
            "Microphone access was denied. You must allow it in your browser settings to continue."
          );
        } else {
           setPermissionError(
            "Could not access microphone. Please check your hardware and permissions."
          );
        }
        setIsRequestingPermission(false); 
      }
    },
    [router, resumeData] 
  );

  const handleCancelNameConfirmation = () => {
    setResumeData(null);
    setIsRequestingPermission(false);
    setPermissionError(null);
  };


  // --- (Cleanup effect is unchanged) ---
  useEffect(() => {
    if (!searchParams.get("mode")) {
      setResumeText(undefined);
      setUserNameForResume(undefined);
      setIsRequestingPermission(false);
      setPermissionError(null);
      setResumeData(null);
    }
  }, [searchParams]);

  // --- (InterviewSession rendering is unchanged) ---
  if (interviewMode && nameParam) {
    const decodedName = decodeURIComponent(nameParam);
    const decodedRole = role ? decodeURIComponent(role) : undefined;
    const decodedSkills = skills ? decodeURIComponent(skills) : undefined;
    const currentResumeText = interviewMode === "resume" ? resumeText : undefined;
    const currentUserName = decodedName;

    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
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

  // --- (Landing page JSX is unchanged) ---
  return (
    <>
      <main className="grid-background flex min-h-screen items-center justify-center p-6 sm:p-12 text-gray-900">
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
           {/* Title */}
           <header
            className={`text-center mb-16 transition-all duration-700 ${
              showTitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 text-gray-900">
              <TypeAnimation
                sequence={["AI Interview Practice", 2500]}
                wrapper="span"
                speed={25}
                cursor={true}
                repeat={0}
                style={{ display: "inline-block" }}
              />
            </h1>
          </header>

          {/* Subtitle */}
          <p
            className={`text-lg sm:text-xl text-gray-600 max-w-xl mx-auto text-center transition-all duration-700 ${
              showSubtitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            Sharpen your skills and boost your confidence with realistic
            AI-powered interviews.
          </p>

          {/* How It Works */}
          <section
            className={`text-center mb-16 mt-12 transition-all duration-700 ${
              showHowItWorks ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h2 className="text-3xl font-semibold mb-6 text-gray-800 font-cursive">
              How It Works
            </h2>
            <p className="text-gray-600 max-w-lg mx-auto leading-relaxed">
              Choose your interview type below, grant microphone access when
              prompted, and you'll jump right into a practice session. Our AI
              interviewer, Jeet, will ask relevant questions. Speak clearly,
              think through your answers, and get valuable practice!
            </p>
          </section>

          {/* Cards Section */}
          <section
            className={`w-full max-w-2xl transition-all duration-700 ${
              showCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <h3 className="text-2xl font-semibold mb-10 text-center text-gray-700">
              Select Your Practice Mode:
            </h3>

            <div className="flex flex-col items-stretch gap-12">

              {/* Resume Card */}
              <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200">
                <div className="flex-shrink-0 p-4 bg-purple-100 rounded-full shadow-inner">
                  <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-purple-600" />
                </div>
                <div className="flex-grow text-center sm:text-left">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-gray-900">
                    Resume Interview
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm sm:text-base">
                    Get questions tailored to the experience listed on your PDF
                    resume.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-600 text-purple-600 hover:bg-purple-100 hover:text-purple-700 focus:ring-purple-500 focus:ring-2 focus:ring-offset-2 gap-1.5 transition-all duration-200"
                    onClick={() => setShowResumeDialog(true)}
                    disabled={isRequestingPermission}
                  >
                    {isRequestingPermission ? (
                      "Checking..."
                    ) : (
                      <>
                        <Mic className="h-4 w-4" /> Start Resume Interview
                      </>
                    )}
                  </Button>
                </div>

                {/* Arrow */}
                {showArrows && (
                  <svg
                    width="140"
                    height="80"
                    viewBox="0 0 140 80"
                    className="absolute right-[-140px] top-1/2 -translate-y-1/2 hidden sm:block"
                  >
                    <path
                      d="M130,40 C90,10 50,10 10,40"
                      stroke="#a78bfa"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray="6 6"
                      className="animate-arrowDraw"
                      markerEnd="url(#arrowhead-purple)"
                    />
                    <defs>
                      <marker
                        id="arrowhead-purple"
                        markerWidth="8"
                        markerHeight="6"
                        refX="8"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 8 3, 0 6" fill="#a78bfa" />
                      </marker>
                    </defs>
                  </svg>
                )}
              </div>

              {/* Position Card */}
              <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200">
                <div className="flex-shrink-0 p-4 bg-blue-100 rounded-full shadow-inner">
                  <Briefcase className="h-10 w-10 sm:h-12 sm:w-12 text-blue-600" />
                </div>
                <div className="flex-grow text-center sm:text-left">
                  <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-gray-900">
                    Position Interview
                  </h2>
                  <p className="text-gray-600 mb-5 text-sm sm:text-base">
                    Practice answering questions for a specific job role and
                    required skills.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-600 text-blue-600 hover:bg-blue-100 hover:text-blue-700 focus:ring-blue-500 focus:ring-2 focus:ring-offset-2 gap-1.5 transition-all duration-200"
                    onClick={() => setShowPositionDialog(true)}
                    disabled={isRequestingPermission}
                  >
                    {isRequestingPermission ? (
                      "Checking..."
                    ) : (
                      <>
                        <Mic className="h-4 w-4" /> Start Position Interview
                      </>
                    )}
                  </Button>
                </div>

                {/* Arrow */}
                {showArrows && (
                  <svg
                    width="140"
                    height="80"
                    viewBox="0 0 140 80"
                    className="absolute right-[-140px] top-1/2 -translate-y-1/2 hidden sm:block"
                  >
                    <path
                      d="M130,40 C90,70 50,70 10,40"
                      stroke="#93c5fd"
                      strokeWidth="2"
                      fill="none"
                      strokeDasharray="6 6"
                      className="animate-arrowDraw"
                      markerEnd="url(#arrowhead-blue)"
                    />
                    <defs>
                      <marker
                        id="arrowhead-blue"
                        markerWidth="8"
                        markerHeight="6"
                        refX="8"
                        refY="3"
                        orient="auto"
                      >
                        <polygon points="0 0, 8 3, 0 6" fill="#93c5fd" />
                      </marker>
                    </defs>
                  </svg>
                )}
              </div>
            </div>
          </section>

          {permissionError && (
            <p className="mt-12 text-red-600 text-sm text-center animate-shake">
              {permissionError}
            </p>
          )}
        </div>
      </main>

      {/* --- 5. ADD THE DIALOGS TO THE RENDER --- */}

      <PositionForm
        open={showPositionDialog}
        onOpenChange={(isOpen) =>
          !isRequestingPermission && setShowPositionDialog(isOpen)
        }
        onSubmit={handlePositionSubmit}
        isLoading={isRequestingPermission}
        error={permissionError}
      />
      
      <ResumeUploadDialog
        open={showResumeDialog}
        onOpenChange={(isOpen) => {
            if (!isRequestingPermission) setShowResumeDialog(isOpen);
        }}
        onSubmit={handleResumeSubmit}
      />

      <NameConfirmationDialog
        open={!!resumeData} // Open when resumeData is not null
        defaultName={resumeData?.name || ""}
        onSubmit={handleNameConfirmation}
        onCancel={handleCancelNameConfirmation}
        isLoading={isRequestingPermission}
        error={permissionError}
      />
    </>
  );
}