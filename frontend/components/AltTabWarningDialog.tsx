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

interface AltTabWarningDialogProps {
  open: boolean;
  onReturn: () => void;
}

export default function AltTabWarningDialog({
  open,
  onReturn,
}: AltTabWarningDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md bg-gray-800 border-gray-700 text-white"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onReturn();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-yellow-400" />
            Focus Lost
          </DialogTitle>
          <DialogDescription className="text-gray-300 pt-2">
            You switched away from the interview (Alt-Tab or window change).
            <br />
            <br />
            Please stay focused on the interview tab to continue.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="bg-gray-200 text-gray-900 hover:bg-white"
            onClick={onReturn}
          >
            Return to Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}