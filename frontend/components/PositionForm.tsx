// components/PositionForm.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Props definition
interface PositionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // --- ✅ FIX: onSubmit MUST be async ---
  onSubmit: (name: string, role: string, skills: string) => Promise<void>; 
  isLoading?: boolean;
  error?: string | null;
}

export default function PositionForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  error: parentError = null,
}: PositionFormProps) {
  // State for form fields
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState(""); // State for *internal* validation errors

  // If a parent error (like mic permission) comes in,
  // clear the internal validation error.
  useEffect(() => {
    if (parentError) {
      setError("");
    }
  }, [parentError]);

  // --- ✅ FIX: handleSubmit must be async ---
  const handleSubmit = async () => {
    // Trim values and validate
    const trimmedName = name.trim();
    const trimmedRole = role.trim();
    const trimmedSkills = skills.trim();

    if (!trimmedName || !trimmedRole || !trimmedSkills) {
      setError("Please fill out all fields."); // Set internal error
      return; // Stop submission
    }

    setError(""); // Clear internal error
    
    // This will now *wait* for the parent (page.tsx)
    // to finish the `getUserMedia` call.
    try {
      await onSubmit(trimmedName, trimmedRole, trimmedSkills);
      // If onSubmit is successful, it will navigate, so we don't need to do anything.
    } catch (e) {
      // The parent (page.tsx) handles setting the error prop.
      console.error("Submission error caught in form:", e);
    }
  };

  // Handle changes in dialog open state
  const handleOpenChange = (isOpen: boolean) => {
    // Don't allow closing the dialog while waiting for mic
    if (isLoading) return; 

    if (!isOpen) {
      setError(""); // Clear internal error when dialog closes
      // Reset fields
      setName("");
      setRole("");
      setSkills("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">Interview Details</DialogTitle>
          <DialogDescription>
            Please provide your name and the position details.
          </DialogDescription>
        </DialogHeader>
        {/* Form Grid */}
        <div className="grid gap-4 py-4">
          {/* Name Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name-pos" className="text-right dark:text-gray-300">
              Name
            </Label>
            <Input
              id="name-pos"
              placeholder="Your Name"
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
              disabled={isLoading} // <-- Disable on load
            />
          </div>
          {/* Role Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role-pos" className="text-right dark:text-gray-300">
              Position
            </Label>
            <Input
              id="role-pos"
              placeholder="e.g., Backend Developer"
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-required="true"
              disabled={isLoading} // <-- Disable on load
            />
          </div>
          {/* Skills Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="skills-pos" className="text-right dark:text-gray-300">
              Skills
            </Label>
            <Textarea
              id="skills-pos"
              placeholder="e.g., Python, Flask, SQL, Docker..."
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              aria-required="true"
              rows={3}
              disabled={isLoading} // <-- Disable on load
            />
          </div>
          
          {/* --- Error Message Display --- */}
          {parentError && (
            <p className="col-span-4 text-red-500 dark:text-red-400 text-sm text-center">
              {parentError}
            </p>
          )}
          {!parentError && error && (
            <p className="col-span-4 text-red-500 dark:text-red-400 text-sm text-center">
              {error}
            </p>
          )}
        </div>
        {/* Dialog Footer */}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isLoading}>
              Cancel
            </Button>
          </DialogClose>
          
          {/* --- Updated Submit Button --- */}
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Waiting for Mic..." : "Start Interview"}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}