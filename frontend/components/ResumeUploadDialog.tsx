"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Define the component's props
interface ResumeUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // This function will pass the extracted text back to the main page
  onSubmit: (resumeText: string) => void;
}

export default function ResumeUploadDialog({
  open,
  onOpenChange,
  onSubmit,
}: ResumeUploadDialogProps) {
  // Local state for the selected file
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(""); // Clear previous errors
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

    // Use FormData to send the file to the backend
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
      
      // Pass the extracted text back to the parent page
      onSubmit(data.resume_text);
      onOpenChange(false); // Close the dialog

    } catch (err) {
      setError("An error occurred during upload. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setFile(null); // Reset file input
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upload Resume</DialogTitle>
          <DialogDescription>
            Please upload your resume as a PDF to begin the interview.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="resume" className="text-right">
              Resume
            </Label>
            <Input
              id="resume"
              type="file"
              accept=".pdf" // Only allow PDF files
              className="col-span-3"
              onChange={handleFileChange}
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Uploading..." : "Start Interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}