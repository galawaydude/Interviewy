"use client";
import { useState, useEffect } from "react";
// ✅ FIXED IMPORTS: Going up two levels to find components
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Loader2, RefreshCcw, FileText, KeyRound } from "lucide-react";

export default function AdminPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/admin/all_keys");
      const data = await res.json();
      setKeys(data);
    } catch (e) {
      console.error("Failed to fetch keys");
    }
    setLoading(false);
  };

  const generateKey = async () => {
    await fetch("http://localhost:5000/api/admin/generate_key", { method: "POST" });
    fetchKeys();
  };

  const viewReport = async (key: string) => {
    setReportLoading(true);
    setReport(null);
    try {
      const res = await fetch(`http://localhost:5000/api/admin/report/${key}`);
      const data = await res.json();
      setReport(data);
    } catch (e) {
      alert("Error fetching report");
    }
    setReportLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10 border-b border-gray-800 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-blue-400">Admin Dashboard</h1>
          <Button onClick={generateKey} className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
            <KeyRound className="h-4 w-4" /> Generate New Key
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-200px)]">
          {/* Left: Key List */}
          <div className="lg:col-span-1 flex flex-col bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl">
            <div className="p-4 bg-gray-800/50 border-b border-gray-800 flex justify-between items-center">
              <h2 className="font-semibold text-gray-200">Interview Sessions</h2>
              <Button variant="ghost" size="icon" onClick={fetchKeys} className="text-gray-400 hover:text-white">
                <RefreshCcw className="h-4 w-4"/>
              </Button>
            </div>
            
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {loading ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin h-8 w-8 text-blue-500"/></div>
              ) : (
                keys.map((k) => (
                  <Card key={k.access_key} className="bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-750 transition-colors">
                    <CardContent className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-mono text-lg font-bold text-yellow-400 tracking-widest">{k.access_key}</div>
                        <div className="text-sm text-gray-400 mt-1">{k.user_name || "Unassigned"}</div>
                        <div className="mt-2">
                           <Badge variant={k.status === 'completed' ? "default" : "outline"} 
                                  className={k.status === 'completed' ? "bg-green-900 text-green-300 border-green-700" : "text-gray-400 border-gray-600"}>
                             {k.status}
                           </Badge>
                        </div>
                      </div>
                      {k.status === 'completed' && (
                        <Button size="sm" variant="secondary" onClick={() => viewReport(k.access_key)} className="gap-2">
                           <FileText className="h-4 w-4"/> Report
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
              {keys.length === 0 && !loading && <p className="text-center text-gray-500 mt-10">No keys generated yet.</p>}
            </div>
          </div>

          {/* Right: Report View */}
          <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden shadow-xl">
             <div className="p-4 bg-gray-800/50 border-b border-gray-800">
                <h2 className="font-semibold text-gray-200">Analysis Report</h2>
             </div>
             
             <div className="p-6 overflow-y-auto flex-1 bg-white text-gray-900">
                {reportLoading && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-600">
                    <Loader2 className="animate-spin h-12 w-12"/> 
                    <p className="font-medium">Generating AI Analysis...</p>
                  </div>
                )}
                
                {!report && !reportLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <FileText className="h-16 w-16 mb-4 opacity-20"/>
                    <p>Select a completed session to view the report.</p>
                  </div>
                )}

                {report && (
                  <div className="animate-in fade-in duration-500">
                    <div className="flex justify-between items-end mb-8 border-b pb-6">
                      <div>
                        <h3 className="text-4xl font-extrabold text-gray-900">{report.overall_score}<span className="text-xl text-gray-500">/10</span></h3>
                        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mt-1">Overall Score</p>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8">
                      <h4 className="font-bold text-blue-900 mb-2">Executive Summary</h4>
                      <p className="text-blue-800 leading-relaxed">{report.summary}</p>
                    </div>
                    
                    <h4 className="font-bold text-gray-900 mb-4 text-lg">Question Analysis</h4>
                    <div className="space-y-8">
                      {report.qa_analysis?.map((qa: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 rounded-xl p-6 bg-gray-50 shadow-sm">
                          <div className="mb-4">
                             <p className="font-bold text-sm text-blue-600 mb-1">QUESTION</p>
                             <p className="font-semibold text-gray-900">{qa.question}</p>
                          </div>
                          <div className="mb-6">
                             <p className="font-bold text-sm text-gray-500 mb-1">CANDIDATE ANSWER</p>
                             <p className="text-gray-700">{qa.user_answer}</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-yellow-800 uppercase">Feedback</span>
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">{qa.rating}/10</Badge>
                              </div>
                              <p className="text-sm text-gray-700">{qa.feedback}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                               <span className="font-bold text-sm text-green-800 uppercase block mb-2">Better Answer</span>
                               <p className="text-sm text-gray-700">{qa.better_answer}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </main>
  );
}