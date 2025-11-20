"use client";
import { useState } from "react";
// ✅ FIXED IMPORTS: Using relative paths
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"; 
import { KeyRound, User, Briefcase, Clock } from "lucide-react";

interface EvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (key: string, name: string, role: string, duration: number) => Promise<void>;
}

export default function EvaluationDialog({ open, onOpenChange, onSubmit }: EvaluationDialogProps) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [duration, setDuration] = useState("10");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if(!key || !name || !role) { setError("All fields required"); return; }
    setLoading(true);
    setError("");

    try {
      // 1. Verify Key
      const res = await fetch("http://localhost:5000/api/verify_key", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      
      if (!data.valid) {
        throw new Error(data.message);
      }

      // 2. Start Session in DB
      await fetch("http://localhost:5000/api/start_evaluation", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ key, user_name: name, role, duration: parseInt(duration) })
      });

      await onSubmit(key, name, role, parseInt(duration));
      
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Evaluation Mode Login</DialogTitle>
          <DialogDescription>Enter your access key provided by the administrator.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Access Key</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-gray-500"/>
              <Input className="pl-9" placeholder="Enter 8-character key" value={key} onChange={e => setKey(e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>Full Name</Label>
                <div className="relative">
                   <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-500"/>
                   <Input className="pl-9" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)}/>
                </div>
             </div>
             <div className="space-y-2">
                <Label>Target Role</Label>
                <div className="relative">
                    <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-gray-500"/>
                    <Input className="pl-9" placeholder="DevOps Engineer" value={role} onChange={e => setRole(e.target.value)}/>
                </div>
             </div>
          </div>
          <div className="space-y-2">
             <Label>Duration</Label>
             <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 z-10"/>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="pl-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 Minutes (Quick Screen)</SelectItem>
                    <SelectItem value="20">20 Minutes (Standard)</SelectItem>
                    <SelectItem value="30">30 Minutes (Deep Dive)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
          </div>
          {error && <p className="text-red-600 text-sm font-medium text-center">{error}</p>}
        </div>
        <Button className="w-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Verifying..." : "Start Evaluation"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}