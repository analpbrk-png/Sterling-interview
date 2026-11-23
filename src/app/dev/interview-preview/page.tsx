import { notFound } from "next/navigation";
import { InterviewRunner } from "@/components/interview/interview-runner";
import { brand } from "@/config/brand";

/**
 * DEVELOPMENT ONLY: exercises the interview UI and timers without a database.
 * Returns 404 in production builds. Saves nothing.
 */
export default async function DevPreview({ searchParams }: { searchParams: Promise<{ prep?: string; answer?: string; mode?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const prep = Number(sp.prep ?? 5);
  const answer = Number(sp.answer ?? 10);
  const mode = sp.mode === "manual" ? "manual" : "automatic";
  const texts = [
    "What inspired you to study in the UK? Please give at least three reasons.",
    "How will your previous business education help you succeed in the MSc Business Analytics programme?",
    "How have you budgeted for your living expenses, including accommodation, transportation, food, and other day-to-day costs?",
  ];
  return (
    <InterviewRunner
      previewMode
      brandName={`${brand.name} (dev preview)`}
      session={{
        id: "preview",
        applicationId: null,
        universityName: "Preview University",
        courseName: "MSc Business Analytics",
        generationNotice: "Development preview: questions are fixed samples and nothing is saved.",
        config: {
          templateName: "Preview",
          introSteps: ["welcome", "media", "passport", "name_id", "pronunciation", "declaration"],
          pronunciationWords: ["Hocus-pocus", "Jibber-jabber", "Babbling"],
          declarationText: "I confirm that I understand the seriousness of this interview process.",
          allowEarlySubmit: true,
          ttsDefault: false,
          ttsRate: 0.95,
          includesSensitive: false,
        },
      }}
      questions={texts.map((text, i) => ({ position: i, text, prepSeconds: prep, answerSeconds: answer, submissionMode: i === 1 ? "manual" : mode, state: "pending" }))}
      identity={{ fullName: "Sample Student", studentId: "S0000000" }}
    />
  );
}
