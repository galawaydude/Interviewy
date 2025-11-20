"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import InterviewSession from "../components/InterviewSession";
import PositionForm from "../components/PositionForm";
import ResumeUploadDialog from "../components/ResumeUploadDialog";
import NameConfirmationDialog from "../components/NameConfirmationDialog";
import EvaluationDialog from "../components/EvaluationDialog";
import { FileText, Briefcase, KeyRound } from "lucide-react";
import { TypeAnimation } from "react-type-animation";

type InterviewData = {
  mode: "resume" | "position" | "evaluation";
  userName: string;
  role?: string;
  skills?: string;
  resumeText?: string;
  evaluationKey?: string;
  durationMinutes?: number;
};

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HomePageContent />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <main className="flex min-h-screen items-center justify-center p-24 bg-white">
      <div className="text-center">
        <p className="text-lg text-gray-500 animate-pulse">Loading Interviewer...</p>
      </div>
    </main>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);

  const [resumeData, setResumeData] = useState<{ text: string; name: string } | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [interviewData, setInterviewData] = useState<InterviewData | null>(null);

  const [showTitle, setShowTitle] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowTitle(true), 100);
    const t2 = setTimeout(() => setShowSubtitle(true), 1200);
    const t3 = setTimeout(() => setShowHowItWorks(true), 2200);
    const t4 = setTimeout(() => setShowCards(true), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  // --- SHARED PERMISSION LOGIC ---
  const requestPermissions = async (): Promise<boolean> => {
    setIsRequestingPermission(true);
    setPermissionError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await document.documentElement.requestFullscreen();
      return true;
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setPermissionError(err.message.includes("fullscreen") ? "Fullscreen denied." : "Microphone denied.");
      } else {
        setPermissionError("Hardware access error.");
      }
      setIsRequestingPermission(false);
      return false;
    }
  };

  // 1. Position Submit
  const handlePositionSubmit = useCallback(async (name: string, role: string, skills: string) => {
      if (await requestPermissions()) {
        setShowPositionDialog(false);
        setInterviewData({ mode: "position", userName: name, role, skills });
      }
  }, []);

  // 2. Resume Submit
  const handleResumeSubmit = useCallback((text: string, name: string) => {
      setResumeData({ text, name });
      setShowResumeDialog(false);
  }, []);

  // 3. Name Confirmation (Resume flow)
  const handleNameConfirmation = useCallback(async (name: string) => {
      if (!resumeData) return;
      if (await requestPermissions()) {
        setInterviewData({ mode: "resume", userName: name, resumeText: resumeData.text });
        setResumeData(null);
      }
  }, [resumeData]);

  // 4. Evaluation Submit
  const handleEvaluationSubmit = useCallback(async (key: string, name: string, role: string, duration: number) => {
      if (await requestPermissions()) {
        setShowEvaluationDialog(false);
        setInterviewData({ 
            mode: "evaluation", 
            userName: name, 
            role, 
            evaluationKey: key, 
            durationMinutes: duration 
        });
      }
  }, []);

  // --- ✅ FIXED: RESET LOADING STATE HERE ---
  const handleInterviewEnd = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    setInterviewData(null);
    // Resetting these ensures the buttons go back to normal
    setIsRequestingPermission(false);
    setPermissionError(null);
  }, []);

  if (interviewData) {
    return <main className="flex min-h-screen items-center justify-center bg-gray-900"><InterviewSession {...interviewData} onEnd={handleInterviewEnd} /></main>;
  }

  return (
    <>
      <main className="grid-background flex min-h-screen items-center justify-center p-6 sm:p-12 text-gray-900">
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
          <header className={`text-center mb-16 transition-all duration-700 ${showTitle ? "opacity-100" : "opacity-0 translate-y-8"}`}>
            <h1 className="text-4xl sm:text-6xl font-bold mb-5 text-gray-900">
              <TypeAnimation sequence={["AI Interview Practice", 2500]} wrapper="span" speed={25} cursor={true} repeat={0} />
            </h1>
          </header>

          <p className={`text-lg sm:text-xl text-gray-600 max-w-xl mx-auto text-center mb-12 transition-all duration-700 ${showSubtitle ? "opacity-100" : "opacity-0 translate-y-8"}`}>
            Sharpen your skills and boost your confidence.
          </p>

          <section className={`w-full max-w-4xl transition-all duration-700 ${showCards ? "opacity-100" : "opacity-0 translate-y-8"}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* RESUME MODE */}
              <div className="flex flex-col items-center p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-purple-100 hover:shadow-xl transition-shadow">
                <div className="p-4 bg-purple-100 rounded-full mb-4"><FileText className="h-8 w-8 text-purple-600" /></div>
                <h2 className="text-xl font-semibold mb-2">Resume Mode</h2>
                <p className="text-gray-500 text-center text-sm mb-6">Questions tailored to your specific resume PDF.</p>
                <Button variant="outline" onClick={() => setShowResumeDialog(true)} disabled={isRequestingPermission} className="border-purple-600 text-purple-600 hover:bg-purple-50 w-full">
                   {isRequestingPermission ? "Loading..." : "Start"}
                </Button>
              </div>

              {/* POSITION MODE */}
              <div className="flex flex-col items-center p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-blue-100 hover:shadow-xl transition-shadow">
                <div className="p-4 bg-blue-100 rounded-full mb-4"><Briefcase className="h-8 w-8 text-blue-600" /></div>
                <h2 className="text-xl font-semibold mb-2">Position Mode</h2>
                <p className="text-gray-500 text-center text-sm mb-6">Practice for a specific role and tech stack.</p>
                <Button variant="outline" onClick={() => setShowPositionDialog(true)} disabled={isRequestingPermission} className="border-blue-600 text-blue-600 hover:bg-blue-50 w-full">
                   {isRequestingPermission ? "Loading..." : "Start"}
                </Button>
              </div>

              {/* EVALUATION MODE - ✅ BADGE REMOVED */}
              <div className="flex flex-col items-center p-6 bg-white/90 backdrop-blur-sm rounded-lg shadow-xl border border-orange-200 transform scale-105">
                {/* <div className="absolute -top-3 ...">PRO</div> <-- DELETED THIS LINE */}
                <div className="p-4 bg-orange-100 rounded-full mb-4"><KeyRound className="h-8 w-8 text-orange-600" /></div>
                <h2 className="text-xl font-semibold mb-2">Evaluation Mode</h2>
                <p className="text-gray-500 text-center text-sm mb-6">Timed interview with access key & performance report.</p>
                <Button onClick={() => setShowEvaluationDialog(true)} disabled={isRequestingPermission} className="bg-orange-600 hover:bg-orange-700 text-white w-full">
                   {isRequestingPermission ? "Loading..." : "Enter Key"}
                </Button>
              </div>

            </div>
          </section>

          {permissionError && <p className="mt-12 text-red-600 text-sm animate-shake">{permissionError}</p>}
        </div>
      </main>

      <PositionForm open={showPositionDialog} onOpenChange={setShowPositionDialog} onSubmit={handlePositionSubmit} isLoading={isRequestingPermission} error={permissionError} />
      <ResumeUploadDialog open={showResumeDialog} onOpenChange={setShowResumeDialog} onSubmit={handleResumeSubmit} />
      <NameConfirmationDialog open={!!resumeData} defaultName={resumeData?.name || ""} onSubmit={handleNameConfirmation} onCancel={() => setResumeData(null)} isLoading={isRequestingPermission} error={permissionError} />
      <EvaluationDialog open={showEvaluationDialog} onOpenChange={setShowEvaluationDialog} onSubmit={handleEvaluationSubmit} />
    </>
  );
}