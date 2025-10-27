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
import { User } from "lucide-react";

interface NameConfirmationDialogProps {
  open: boolean;
  defaultName: string;
  onSubmit: (confirmedName: string) => Promise<void>; 
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function NameConfirmationDialog({
  open,
  defaultName,
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
}: NameConfirmationDialogProps) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) {
      setName(defaultName);
    }
  }, [open, defaultName]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    await onSubmit(trimmedName); 
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isLoading) onCancel();
      }}
    >
      {/* --- ✅ Removed dark: classes --- */}
      <DialogContent 
        className="sm:max-w-md data-[state=open]:animate-fade-in-up"
      >
        <DialogHeader>
          <DialogTitle>Confirm Your Name</DialogTitle>
          <DialogDescription>
            We've detected your name from the resume. Please confirm or correct
            it below.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name-confirm">
              Name
            </Label>
            <div className="relative">
              {/* --- ✅ Use 'text-muted-foreground' --- */}
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="name-confirm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10" // --- ✅ Removed dark: classes
                disabled={isLoading}
              />
            </div>
          </div>
          {error && (
             // --- ✅ Use 'text-destructive' ---
            <p className="text-destructive text-sm text-center">
              {error}
            </p>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
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