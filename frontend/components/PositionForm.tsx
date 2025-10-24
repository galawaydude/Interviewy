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
import { Textarea } from "@/components/ui/textarea"; // Import Textarea

// Define the component's props
interface PositionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (role: string, skills: string) => void;
}

export default function PositionForm({
  open,
  onOpenChange,
  onSubmit,
}: PositionFormProps) {
  // Local state for the form fields
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");

  const handleSubmit = () => {
    // Basic validation
    if (role.trim() && skills.trim()) {
      onSubmit(role, skills);
      onOpenChange(false); // Close the dialog
    } else {
      alert("Please fill out both fields.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Position Details</DialogTitle>
          <DialogDescription>
            What position are you applying for? List your top skills for
            this role.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Position
            </Label>
            <Input
              id="role"
              placeholder="e.g., Backend Developer"
              className="col-span-3"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="skills" className="text-right">
              Skills
            </Label>
            <Textarea
              id="skills"
              placeholder="e.g., Python, Flask, SQL, Docker..."
              className="col-span-3"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSubmit}>
            Start Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}