"use client";

import { useState } from "react";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label"; 
import { UploadCloud, FileText, X } from "lucide-react"; 

interface ResumeUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (resumeText: string, extractedName: string) => void;
}

export default function ResumeUploadDialog({
  open,
  onOpenChange,
  onSubmit,
}: ResumeUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(""); 
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Please select a PDF file.");
      return;
    }

    setIsLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:5000/api/upload_resume", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload resume.");
      }

      const data = await response.json();
      onSubmit(data.resume_text, data.extracted_name || ""); 
      
    } catch (err) {
      setError("An error occurred during upload. Please try again.");
      console.error(err);
      setIsLoading(false); // Stop loading on error
    } 
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isLoading) return; 
    if (!isOpen) {
      setFile(null);
      setError("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* --- ✅ Removed dark: classes --- */}
      <DialogContent 
        className="sm:max-w-md data-[state=open]:animate-fade-in-up"
      >
        <DialogHeader>
          <DialogTitle>Upload Resume</DialogTitle>
          <DialogDescription>
            Please upload your resume as a PDF to begin.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <input
            type="file"
            id="resume-file-input"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={isLoading}
            className="hidden" // The actual input is hidden
          />
          
          {/* --- ✅ Use theme-aware classes --- */}
          <Label
            htmlFor="resume-file-input"
            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer
              ${isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"}
              ${error ? "border-destructive" : "border-border"}
            `}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">PDF only (MAX. 5MB)</p>
            </div>
          </Label>

          {/* --- ✅ Use theme-aware classes --- */}
          {file && !isLoading && (
            <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">{file.name}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
        </div>
        
        <DialogFooter>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading || !file}>
            {isLoading ? "Processing Resume..." : "Start Interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}