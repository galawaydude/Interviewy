// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Dancing_Script } from "next/font/google"; // Ensure Dancing_Script is imported
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// --- ✅ CRITICAL: This loads Dancing Script and assigns its CSS variable ---
const dancingScript = Dancing_Script({
  variable: "--font-dancing-script", // This CSS variable name must match tailwind.config.js
  weight: ["400", "700"], // Explicitly requesting weights
  style: ["normal"],
  subsets: ["latin"],
  display: 'swap',
});
// --- END ---

export const metadata: Metadata = {
  title: "AI Interview Practice",
  description: "Practice your interview skills with an AI interviewer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        // --- ✅ CRITICAL: This applies the font variables to the body ---
        className={`${geistSans.variable} ${geistMono.variable} ${dancingScript.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}