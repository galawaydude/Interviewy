// components/ExitFullscreenDialog.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ExitFullscreenDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExitFullscreenDialog({
  open,
  onConfirm,
  onCancel,
}: ExitFullscreenDialogProps) {
  return (
    // We do not pass onOpenChange, so it can only be closed
    // by the buttons, Esc, or overlay click.
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md bg-gray-800 border-gray-700 text-white"
        // Prevent closing the dialog with the Escape key.
        // Instead, treat pressing 'Esc' as "Cancel".
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onCancel();
        }}
        // Prevent closing by clicking outside the dialog.
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-yellow-400" />
            Leave Interview?
          </DialogTitle>
          <DialogDescription className="text-gray-300 pt-2">
            You've exited fullscreen. To continue the interview, you must stay in
            fullscreen.
            <br />
            <br />
            Ending the interview will take you back to the home page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onConfirm}
            className="bg-gray-800 border-gray-600 hover:bg-gray-700 hover:text-white"
          >
            End Interview
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="bg-gray-200 text-gray-900 hover:bg-white"
          >
            Stay (Re-enter Fullscreen)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}