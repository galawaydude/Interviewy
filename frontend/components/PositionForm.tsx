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
  DialogClose // Optional: For an explicit cancel button
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Props definition
interface PositionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Callback accepts name, role, and skills
  onSubmit: (name: string, role: string, skills: string) => void;
}

export default function PositionForm({
  open,
  onOpenChange,
  onSubmit,
}: PositionFormProps) {
  // State for form fields
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState(""); // State for validation errors

  // Handle form submission
  const handleSubmit = () => {
    // Trim values and validate
    const trimmedName = name.trim();
    const trimmedRole = role.trim();
    const trimmedSkills = skills.trim();

    if (!trimmedName || !trimmedRole || !trimmedSkills) {
      setError("Please fill out all fields."); // Set error message
      return; // Stop submission
    }

    setError(""); // Clear error on successful validation
    onSubmit(trimmedName, trimmedRole, trimmedSkills); // Pass trimmed values
    // Dialog should close automatically via onOpenChange when onSubmit triggers navigation
  };

  // Handle changes in dialog open state to clear errors and potentially fields
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setError(""); // Clear error when dialog closes
      // Reset fields when closing for a fresh start next time
      setName("");
      setRole("");
      setSkills("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] dark:bg-gray-800"> {/* Dark mode bg */}
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
            <Label htmlFor="name-pos" className="text-right dark:text-gray-300"> {/* Unique ID, dark text */}
              Name
            </Label>
            <Input
              id="name-pos"
              placeholder="Your Name"
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" // Dark mode input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
            />
          </div>
          {/* Role Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role-pos" className="text-right dark:text-gray-300"> {/* Unique ID, dark text */}
              Position
            </Label>
            <Input
              id="role-pos"
              placeholder="e.g., Backend Developer"
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" // Dark mode input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-required="true"
            />
          </div>
          {/* Skills Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="skills-pos" className="text-right dark:text-gray-300"> {/* Unique ID, dark text */}
              Skills
            </Label>
            <Textarea
              id="skills-pos"
              placeholder="e.g., Python, Flask, SQL, Docker..."
              className="col-span-3 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600" // Dark mode input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              aria-required="true"
              rows={3} // Give textarea a bit more default height
            />
          </div>
          {/* Error Message Display */}
          {error && <p className="col-span-4 text-red-500 dark:text-red-400 text-sm text-center">{error}</p>}
        </div>
        {/* Dialog Footer */}
        <DialogFooter>
          {/* Optional Cancel Button */}
           <DialogClose asChild>
             <Button type="button" variant="outline">Cancel</Button>
           </DialogClose>
          <Button type="submit" onClick={handleSubmit}>
            Start Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}