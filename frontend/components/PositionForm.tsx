"use client";

import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label"; 
import { Textarea } from "../components/ui/textarea";
import { User, Briefcase, Wrench } from "lucide-react";

// Props definition
interface PositionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState(""); 

  useEffect(() => {
    if (parentError) {
      setError("");
    }
  }, [parentError]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedRole = role.trim();
    const trimmedSkills = skills.trim();

    if (!trimmedName || !trimmedRole || !trimmedSkills) {
      setError("Please fill out all fields."); 
      return; 
    }

    setError(""); 
    
    try {
      await onSubmit(trimmedName, trimmedRole, trimmedSkills);
    } catch (e) {
      console.error("Submission error caught in form:", e);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isLoading) return; 

    if (!isOpen) {
      setError(""); 
      setName("");
      setRole("");
      setSkills("");
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
          <DialogTitle>Interview Details</DialogTitle>
          <DialogDescription>
            Please provide your name and the position details.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name-pos">
              Name
            </Label>
            <div className="relative">
              {/* --- ✅ Use 'text-muted-foreground' --- */}
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="name-pos"
                placeholder="Your Name"
                className="pl-10" // --- ✅ Removed dark: classes
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-required="true"
                disabled={isLoading}
              />
            </div>
          </div>
          
          {/* Role Field */}
          <div className="space-y-2">
            <Label htmlFor="role-pos">
              Position
            </Label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="role-pos"
                placeholder="e.g., Backend Developer"
                className="pl-10" // --- ✅ Removed dark: classes
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-required="true"
                disabled={isLoading}
              />
            </div>
          </div>
          
          {/* Skills Field */}
          <div className="space-y-2">
            <Label htmlFor="skills-pos">
              Skills
            </Label>
            <div className="relative">
              <Wrench className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Textarea
                id="skills-pos"
                placeholder="e.g., Python, Flask, SQL, Docker..."
                className="pl-10" // --- ✅ Removed dark: classes
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                aria-required="true"
                rows={3}
                disabled={isLoading}
              />
            </div>
          </div>
          
          {/* Error Message Display */}
          {(parentError || error) && (
             // --- ✅ Use 'text-destructive' ---
            <p className="text-destructive text-sm text-center">
              {parentError || error}
            </p>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isLoading}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Waiting for Mic..." : "Start Interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}