"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type QcmResult = {
  id: string;
  label: string;
  selected: string;
  correct: string;
  isCorrect: boolean;
};

type FreeResult = {
  id: string;
  label: string;
  answer: string;
  expected?: string;
  matched?: string[];
  matchedCount?: number;
  requiredCount?: number;
  isCorrect?: boolean;
  pictograms?: {
    expected: string;
    answer: string;
    isCorrect: boolean;
  }[];
};

type Submission = {
  stats: {
    scoreCorrect: number;
    qcmCorrect?: number;
    qcmTotal: number;
    freeCorrect?: number;
    freeTotal?: number;
    overallTotal?: number;
    score20: number;
  };
  qcmResults: QcmResult[];
  freeResults: FreeResult[];
  pdfPayload: {
    participant: {
      nom: string;
      prénom: string;
      date: string;
    };
    answers: Record<string, string>;
    result: {
      score: string;
      validé: boolean;
      renforcement: boolean;
      correction: boolean;
    };
    signatures: {
      participant: string;
      animateur: string;
    };
    observations: {
      animateur: string;
    };
  };
};

const resolveApiBase = () => {
  const configuredBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  if (configuredBase) {
    return configuredBase;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000";
    }
  }
  return "";
};
const API_BASE = resolveApiBase();

export default function ResultatsPage() {
  const router = useRouter();
  const [theme, setTheme] = useState("light");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme");
    const nextTheme = storedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);

    const raw = window.localStorage.getItem("testAccueilSubmission");
    if (raw) {
      try {
        setSubmission(JSON.parse(raw) as Submission);
      } catch {
        setSubmission(null);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
  };

  const downloadPdf = async () => {
    if (!submission) {
      return;
    }
    setLoadingPdf(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/api/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission.pdfPayload),
      });

      if (!response.ok) {
        const serverMessage = (await response.text()).slice(0, 180);
        throw new Error(serverMessage || `Erreur HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "test_accueil_sse.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatus("PDF téléchargé.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setStatus(`Impossible de générer le PDF (${message}).`);
    } finally {
      setLoadingPdf(false);
    }
  };

  const panelClass = useMemo(
    () =>
      `rounded-3xl border p-4 shadow-lg backdrop-blur sm:p-6 ${
        theme === "dark"
          ? "border-slate-700/70 bg-slate-900/90 shadow-black/30"
          : "border-slate-200/70 bg-[#D9D9D9] shadow-slate-200/40"
      }`,
    [theme],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-emerald-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="flex w-full flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-12 sm:py-6">
        <h1 className="font-[var(--font-playfair)] text-2xl font-semibold text-slate-900 dark:text-white sm:text-4xl">
          Résultats du test
        </h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
        >
          {theme === "dark" ? "Mode jour" : "Mode nuit"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-12 sm:gap-6 sm:px-10 sm:pb-16 lg:px-12">
        {!submission && (
          <section className={panelClass}>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Aucun résultat trouvé. Validez d&apos;abord le test depuis le questionnaire.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-4 rounded-xl border border-teal-500 bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600"
            >
              Retour au questionnaire
            </button>
          </section>
        )}

        {submission && (
          <>
            <section className={panelClass}>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Synthèse</h2>
              <p className="mt-3 text-sm text-slate-800 dark:text-slate-200">
                Score global: {submission.stats.scoreCorrect}/{submission.stats.overallTotal ?? submission.stats.qcmTotal}
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                QCM: {submission.stats.qcmCorrect ?? submission.stats.scoreCorrect}/{submission.stats.qcmTotal}
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                Réponses libres: {submission.stats.freeCorrect ?? 0}/{submission.stats.freeTotal ?? 0}
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                Note sur 20: {submission.stats.score20}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={loadingPdf}
                  className="rounded-xl border border-teal-500 bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPdf ? "Génération en cours..." : "Télécharger le PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Retour au questionnaire
                </button>
              </div>
              {status && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{status}</p>}
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Détail QCM</h2>
              <div className="mt-4 grid gap-3">
                {submission.qcmResults.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 ${
                      item.isCorrect
                        ? "border-emerald-400/70 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20"
                        : "border-rose-400/70 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Votre réponse: {item.selected || "-"}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">Bonne réponse: {item.correct || "-"}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={panelClass}>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Réponses libres</h2>
              <div className="mt-4 grid gap-3">
                {submission.freeResults.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-300/70 p-4 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                    {item.pictograms && (
                      <div className="mt-2 grid gap-2">
                        {item.pictograms.map((picto, index) => (
                          <div
                            key={`${item.id}-${index}`}
                            className={`rounded-xl border p-3 ${
                              picto.isCorrect
                                ? "border-emerald-400/70 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20"
                                : "border-rose-400/70 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20"
                            }`}
                          >
                            <p className="text-sm text-slate-900 dark:text-slate-100">Réponse attendue: {picto.expected}</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">Votre réponse: {picto.answer || "-"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!item.pictograms && (
                      <>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Votre réponse: {item.answer || "-"}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">Attendu: {item.expected || "-"}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          Éléments reconnus: {item.matchedCount || 0}/{item.requiredCount || 0}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          Mots-clés trouvés: {item.matched && item.matched.length > 0 ? item.matched.join(", ") : "Aucun"}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
