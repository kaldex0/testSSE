"use client";

import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Question = {
  id: string;
  label: string;
  type: "radio" | "textarea" | "checkbox";
  options?: string[];
  section: "qcm" | "libre";
  correctAnswer?: string;
};

const freeQuestions: Question[] = [
  {
    id: "free-1",
    label: "Citez au moins 4 bons gestes en matière de santé - hygiène de vie :",
    type: "textarea",
    section: "libre",
  },
  {
    id: "free-2",
    label: "Citez 4 sortes d'EPI ?",
    type: "textarea",
    section: "libre",
  },
  {
    id: "free-3",
    label: "À quoi correspondent les pictogrammes suivants ?",
    type: "textarea",
    section: "libre",
  },
];

const pictograms = [
  {
    id: "picto-1",
    src: "/pictogramme-1.jpg",
    alt: "Danger de mort par électrocution",
  },
  {
    id: "picto-2",
    src: "/pictogramme-2.jpg",
    alt: "Port de chaussures de sécurité",
  },
  {
    id: "picto-3",
    src: "/pictogramme-3.gif",
    alt: "Ne pas tirer sur la prise",
  },
  {
    id: "picto-4",
    src: "/pictogramme-4.jpg",
    alt: "Point de rassemblement",
  },
] as const;

const FREE_TEXT_MAX_CHARS = 280;
const PICTOGRAM_TEXT_MAX_CHARS = 90;
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

const limitText = (value: string, maxChars: number) => value.slice(0, maxChars);

const parseCsvLine = (line: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
};

const parseQcmCsv = (csvText: string) => {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [] as Question[];
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const label = cells[0] || `Question ${index + 1}`;
    const options = cells.slice(1, 5).filter(Boolean);
    const correctAnswer = cells[5] || "";
    return {
      id: `qcm-${index + 1}`,
      label,
      type: "radio" as const,
      options,
      section: "qcm" as const,
      correctAnswer,
    };
  });
};

type Answers = Record<string, string | string[]>;
type ParticipantInfo = {
  nom: string;
  prénom: string;
};

const initialAnswers: Answers = {};

export default function Home() {
  const router = useRouter();
  const accessCodeMap: Record<string, "test-accueil"> = {
    "0105": "test-accueil",
  };
  const [theme, setTheme] = useState("light");
  const [accessCode, setAccessCode] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [participant, setParticipant] = useState<ParticipantInfo>({
    nom: "",
    prénom: "",
  });
  const [participantSignature, setParticipantSignature] = useState("");
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const signatureLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [qcmQuestions, setQcmQuestions] = useState<Question[]>([]);
  const [qcmLoaded, setQcmLoaded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFinalReview, setShowFinalReview] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (!showSignaturePrompt && !participantSignature) {
      return;
    }
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return;
    }
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineWidth = 2;
      context.strokeStyle = "#0f172a";
      context.lineJoin = "round";
      context.lineCap = "round";
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [participantSignature, showSignaturePrompt]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
  };

  const handleAccessSubmit = () => {
    const cleaned = accessCode.trim();
    if (accessCodeMap[cleaned]) {
      setAccessGranted(true);
      setAccessError("");
      return;
    }
    setAccessError("Code invalidé.");
  };

  const handleRadio = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleText = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: limitText(value, FREE_TEXT_MAX_CHARS) }));
  };

  const handlePictogramText = (id: string, pictogramIndex: number, value: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? [...prev[id]] : Array(pictograms.length).fill("");
      current[pictogramIndex] = limitText(value, PICTOGRAM_TEXT_MAX_CHARS);
      return { ...prev, [id]: current };
    });
  };

  const toggleCheckbox = (id: string, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? prev[id] : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  };

  useEffect(() => {
    let cancelled = false;
    const loadQcm = async () => {
      try {
        const response = await fetch("/reponseQCM.csv");
        if (!response.ok) {
          throw new Error("Impossible de charger reponseQCM.csv");
        }
        const text = await response.text();
        const parsed = parseQcmCsv(text);
        if (!cancelled) {
          setQcmQuestions(parsed);
        }
      } catch {
        if (!cancelled) {
          setQcmQuestions([]);
        }
      } finally {
        if (!cancelled) {
          setQcmLoaded(true);
        }
      }
    };

    loadQcm();
    return () => {
      cancelled = true;
    };
  }, []);

  const allQuestions = useMemo(
    () => (qcmLoaded ? [...qcmQuestions, ...freeQuestions] : []),
    [qcmLoaded, qcmQuestions],
  );
  const currentQuestion = allQuestions[currentIndex];
  const totalQuestions = allQuestions.length;

  useEffect(() => {
    if (!qcmLoaded) {
      return;
    }
    setAnswers((prev) => {
      let changed = false;
      const next: Answers = { ...prev };
      allQuestions.forEach((question) => {
        if (!(question.id in next)) {
          next[question.id] =
            question.id === "free-3"
              ? Array(pictograms.length).fill("")
              : question.type === "checkbox"
                ? []
                : "";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allQuestions, qcmLoaded]);

  useEffect(() => {
    if (totalQuestions === 0) {
      return;
    }
    setCurrentIndex((prev) => Math.min(prev, totalQuestions - 1));
  }, [totalQuestions]);
  const goToQuestion = (index: number) => {
    if (showFinalReview) {
      setShowFinalReview(false);
    }
    setCurrentIndex(Math.max(0, Math.min(index, totalQuestions - 1)));
  };
  const goPrev = () => goToQuestion(currentIndex - 1);
  const goNext = () => goToQuestion(currentIndex + 1);
  const isDark = theme === "dark";
  const sidePanelClass = `flex flex-col rounded-3xl border p-6 shadow-lg backdrop-blur ${
    isDark
      ? "border-slate-700/70 bg-slate-900/90 shadow-black/30"
      : "border-slate-200/70 bg-[#D9D9D9] shadow-slate-200/40"
  }`;
  const questionPanelClass = `flex w-full flex-1 flex-col rounded-3xl border p-6 shadow-lg backdrop-blur ${
    isDark
      ? "border-slate-700/70 bg-slate-900/90 shadow-black/30"
      : "border-slate-200/70 bg-[#D9D9D9] shadow-slate-200/40"
  }`;
  const headerSmallTextClass = isDark
    ? "text-xs uppercase tracking-[0.2em] text-slate-400"
    : "text-xs uppercase tracking-[0.2em] text-slate-900";
  const navTitleClass = isDark
    ? "text-sm font-semibold uppercase tracking-[0.2em] text-slate-400"
    : "text-sm font-semibold uppercase tracking-[0.2em] text-slate-900";
  const navCountClass = isDark ? "text-xs text-slate-400" : "text-xs text-slate-900";
  const questionMetaClass = isDark
    ? "flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400"
    : "flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-900";
  const questionSectionClass = isDark
    ? "mt-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500"
    : "mt-2 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-900";
  const questionTitleClass = isDark
    ? "mt-3 text-center text-lg font-semibold text-slate-100"
    : "mt-3 text-center text-lg font-semibold text-slate-900";
  const isIdentityComplete = participant.nom.trim().length > 0 && participant.prénom.trim().length > 0;
  const isIdentityReady = isIdentityComplete && identityConfirmed;

  const isQuestionAnswered = useCallback(
    (question: Question) => {
      const value = answers[question.id];
      if (question.type === "radio") {
        return typeof value === "string" && value.trim().length > 0;
      }
      if (question.type === "checkbox") {
        return Array.isArray(value) && value.length > 0;
      }
      if (question.id === "free-3") {
        if (!Array.isArray(value)) {
          return false;
        }
        return value.length === pictograms.length && value.every((item) => String(item).trim().length > 0);
      }
      return typeof value === "string" && value.trim().length > 0;
    },
    [answers],
  );

  const unansweredCount = useMemo(
    () => allQuestions.filter((question) => !isQuestionAnswered(question)).length,
    [allQuestions, isQuestionAnswered],
  );
  const answeredCount = useMemo(
    () => allQuestions.filter((question) => isQuestionAnswered(question)).length,
    [allQuestions, isQuestionAnswered],
  );
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const qcmAnsweredCount = useMemo(
    () => allQuestions.filter((question) => question.section === "qcm" && isQuestionAnswered(question)).length,
    [allQuestions, isQuestionAnswered],
  );
  const freeAnsweredCount = useMemo(
    () => allQuestions.filter((question) => question.section === "libre" && isQuestionAnswered(question)).length,
    [allQuestions, isQuestionAnswered],
  );

  useEffect(() => {
    if (unansweredCount === 0 && completionError) {
      setCompletionError("");
    }
  }, [completionError, unansweredCount]);

  const displayOptions = currentQuestion?.options
    ? currentQuestion.options.length === 3
      ? [...currentQuestion.options, "__placeholder__"]
      : currentQuestion.options
    : [];

  const getAnswerText = (id: string) => {
    const value = answers[id];
    return typeof value === "string" ? value : "";
  };

  const getQuestionSummaryAnswer = useCallback(
    (question: Question) => {
      const value = answers[question.id];
      if (question.id === "free-3") {
        if (!Array.isArray(value)) {
          return "-";
        }
        const entries = value
          .map((item, index) => {
            const trimmed = String(item || "").trim();
            return trimmed.length > 0 ? `Pictogramme ${index + 1}: ${trimmed}` : "";
          })
          .filter(Boolean);
        return entries.length > 0 ? entries.join(" | ") : "-";
      }
      if (question.type === "checkbox") {
        if (!Array.isArray(value)) {
          return "-";
        }
        return value.length > 0 ? value.join(", ") : "-";
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : "-";
      }
      return "-";
    },
    [answers],
  );

  const normalizeText = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const containsAny = (value: string, keywords: string[]) => {
    const normalized = normalizeText(value);
    return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
  };

  const getSignaturePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handleSignaturePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) {
      return;
    }
    signatureDrawingRef.current = true;
    const point = getSignaturePoint(event);
    signatureLastPointRef.current = point;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handleSignaturePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawingRef.current) {
      return;
    }
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) {
      return;
    }
    const point = getSignaturePoint(event);
    const last = signatureLastPointRef.current;
    if (last) {
      context.lineTo(point.x, point.y);
      context.stroke();
      signatureLastPointRef.current = point;
    }
  };

  const handleSignaturePointerUp = () => {
    signatureDrawingRef.current = false;
    signatureLastPointRef.current = null;
  };

  const handleSignatureClear = () => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    setParticipantSignature("");
  };

  const handleSignatureUse = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    setParticipantSignature(dataUrl);
    setShowSignaturePrompt(false);
  };

  const buildSubmission = () => {
    const scoreCorrect = qcmQuestions.reduce((count, question, index) => {
      const selected = getAnswerText(`qcm-${index + 1}`);
      return selected && selected === question.correctAnswer ? count + 1 : count;
    }, 0);
    const qcmTotal = qcmQuestions.length;

    const pictogramAnswers = Array.isArray(answers["free-3"])
      ? (answers["free-3"] as string[])
      : [];

    const hygieneCriteria = [
      { label: "Hydratation", keywords: ["hydrat", "eau", "boire", "s_hydrater", "hydratation", "dehydrat", "bouteille"] },
      { label: "Alimentation equilibree", keywords: ["aliment", "alimentation", "equilibre", "sain", "equilibree", "fruit", "legume",  "proteine","vitamine", "fibre", "repas", "petit dejeuner", "collation"] },
      { label: "Sommeil", keywords: ["sommeil", "dorm", "repos", "dormir", "sieste", "recuperation", "rythme"] },
      { label: "Activite physique", keywords: ["activite physique", "sport", "marche", "courir", "course", "velo", "natation", "etirement", "exercice", "entrainement"] },
      { label: "Pauses regulieres", keywords: ["pause", "micro pause", "pause reguliere", "pause reguliere", "repos court"] },
      { label: "Hygiène des mains", keywords: ["lavage", "laver", "main", "hygiene", "gel hydroalcoolique", "savon", "desinfecter"] },
      { label: "Gestion du stress", keywords: ["stress", "respiration", "calme", "relax", "detente", "coherence", "meditation"] },
      { label: "Ergonomie et posture", keywords: ["ergonomie", "posture", "etirement", "position", "assis", "chaise", "ecran", "hauteur", "postural"] },
      { label: "Hygiène corporelle", keywords: ["douche", "proprete", "se laver", "toilette", "propre"] },
    ];

    const epiCriteria = [
      { label: "Casque", keywords: ["casque", "casque chantier", "casque protection", "casque securite", "casquette coquée"] },
      { label: "Gants", keywords: ["gant", "gants", "gantage"] },
      { label: "Lunettes de protection", keywords: ["lunette", "visiere", "ecran facial", "protege yeux", "protection oculaire"] },
      { label: "Chaussures de sécurité", keywords: ["chaussure", "botte", "securite", "coque"] },
      { label: "Protection auditive", keywords: ["bouchon", "auditif", "casque antibruit", "protege oreille", "oreille"] },
      { label: "Protection respiratoire", keywords: ["masque", "respiratoire", "ffp", "respiration", "filtrant"] },
      { label: "Harnais antichute", keywords: ["harnais", "antichute", "longe", "ligne de vie"] },
      { label: "Gilet haute visibilité", keywords: ["gilet", "haute visibilite", "fluorescent", "reflechissant"] },
      { label: "Veste ou combinaison", keywords: ["veste", "combinaison", "tenue", "vetement"] },
    ];

    const hygieneAnswer = getAnswerText("free-1");
    const hygieneMatched = hygieneCriteria
      .filter((criterion) => containsAny(hygieneAnswer, criterion.keywords))
      .map((criterion) => criterion.label);

    const epiAnswer = getAnswerText("free-2");
    const epiMatched = epiCriteria
      .filter((criterion) => containsAny(epiAnswer, criterion.keywords))
      .map((criterion) => criterion.label);

    const pictogramCriteria = [
      ["electrocution", "electrique", "danger"],
      ["chaussure", "securite", "conductrice"],
      ["prise", "tirer", "debrancher"],
      ["rassemblement", "point de rassemblement"],
    ];

    const pictogramChecks = pictograms.map((picto, idx) => {
      const answer = pictogramAnswers[idx] || "";
      return {
        expected: picto.alt,
        answer,
        isCorrect: containsAny(answer, pictogramCriteria[idx] || [picto.alt]),
      };
    });

    const pdfAnswers = {
      q1: getAnswerText("qcm-1"),
      q2: getAnswerText("free-1"),
      q3: getAnswerText("qcm-2"),
      q4: getAnswerText("qcm-3"),
      q5: getAnswerText("qcm-4"),
      q6: getAnswerText("qcm-5"),
      q7: getAnswerText("free-2"),
      q8: getAnswerText("qcm-6"),
      q9: pictogramAnswers.filter(Boolean).join(" | "),
      q10: getAnswerText("qcm-7"),
      q11: getAnswerText("qcm-8"),
      q12: getAnswerText("qcm-9"),
      q13: getAnswerText("qcm-10"),
      q14: getAnswerText("qcm-11"),
    };

    const qcmResults = qcmQuestions.map((question, index) => {
        const selected = getAnswerText(`qcm-${index + 1}`);
        return {
          id: question.id,
          label: question.label,
          selected,
          correct: question.correctAnswer || "",
          isCorrect: Boolean(selected && selected === question.correctAnswer),
        };
      });

    const freeResults = [
        {
          id: "free-1",
          label: "Citez au moins 4 bons gestes en matière de santé - hygiène de vie :",
          answer: hygieneAnswer,
          expected:
            "Au moins 4 gestes parmi: hydratation, alimentation équilibrée, sommeil, activité physique, pauses, hygiène des mains, gestion du stress, ergonomie, hygiène corporelle.",
          matched: hygieneMatched,
          matchedCount: hygieneMatched.length,
          requiredCount: 4,
          isCorrect: hygieneMatched.length >= 4,
        },
        {
          id: "free-2",
          label: "Citez 4 sortes d'EPI ?",
          answer: epiAnswer,
          expected:
            "Au moins 4 EPI parmi: casque, gants, lunettes, chaussures de sécurité, protection auditive, masque respiratoire, harnais, gilet haute visibilité, veste ou combinaison.",
          matched: epiMatched,
          matchedCount: epiMatched.length,
          requiredCount: 4,
          isCorrect: epiMatched.length >= 4,
        },
        {
          id: "free-3",
          label: "À quoi correspondent les pictogrammes suivants ?",
          answer: "",
          pictograms: pictogramChecks,
          isCorrect: pictogramChecks.every((item) => item.isCorrect),
        },
      ];

    const freeCorrect = freeResults.filter((item) => item.isCorrect).length;
    const freeTotal = freeResults.length;
    const overallCorrect = scoreCorrect + freeCorrect;
    const overallTotal = qcmTotal + freeTotal;
    const overallScore20 =
      overallTotal > 0 ? Math.round((overallCorrect / overallTotal) * 200) / 10 : 0;

    return {
      stats: {
        scoreCorrect: overallCorrect,
        qcmCorrect: scoreCorrect,
        qcmTotal,
        freeCorrect,
        freeTotal,
        overallTotal,
        score20: overallScore20,
      },
      qcmResults,
      freeResults,
      pdfPayload: {
        participant: {
          nom: participant.nom.trim(),
          prénom: participant.prénom.trim(),
          date: new Date().toISOString().slice(0, 10),
        },
        answers: pdfAnswers,
        result: {
          score: String(overallScore20),
          validé: overallScore20 >= 10,
          renforcement: overallScore20 < 10,
          correction: true,
        },
        signatures: {
          participant: participantSignature,
          animateur: "",
        },
        observations: {
          animateur: "",
        },
      },
    };
  };

  const handleValidateTest = () => {
    if (!isIdentityReady) {
      return;
    }
    if (unansweredCount > 0) {
      setCompletionError(`Merci de répondre à toutes les questions (${unansweredCount} restante${unansweredCount > 1 ? "s" : ""}).`);
      return;
    }
    if (!participantSignature) {
      setShowSignaturePrompt(true);
      return;
    }
    setCompletionError("");
    setShowFinalReview(true);
  };

  const handleConfirmAndSubmit = async () => {
    if (!isIdentityReady || unansweredCount > 0 || !participantSignature) {
      return;
    }
    const submission = buildSubmission();
    window.localStorage.setItem("testAccueilSubmission", JSON.stringify(submission));
    try {
      await fetch(`${API_BASE}/api/tests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
      });
    } catch {
      // Best-effort save; continue to results page.
    }
    router.push("/resultats");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-emerald-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <header className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-12 sm:py-6">
        {accessGranted ? (
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Image
              src="/images/1770807021525.jpg"
              alt="Logo Goron"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full bg-white/80 p-1 object-contain shadow-sm dark:bg-slate-900/80"
              priority
            />
            <div>
              <p className={headerSmallTextClass}>
                Goron Systemes
              </p>
              <h1 className="font-[var(--font-playfair)] text-2xl font-semibold text-slate-900 dark:text-white sm:text-4xl">
                Test Accueil SSE
              </h1>
            </div>
          </div>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full border border-[#e57648]/50 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#e57648] dark:bg-slate-900/70 dark:text-slate-200"
        >
          {theme === "dark" ? "Mode jour" : "Mode nuit"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-16 sm:gap-8 sm:px-10 sm:pb-20 lg:px-12">
        {!accessGranted && (
          <section className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center">
            <div className="w-full rounded-3xl border border-slate-200 bg-white/90 p-10 shadow-lg backdrop-blur sm:p-12 dark:border-slate-700 dark:bg-slate-900/80">
              <div className="grid gap-4">
                <input
                  type="text"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="Code d'accès"
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base text-slate-800 shadow-sm outline-none focus:border-[#e57648] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {accessError && <p className="text-sm text-rose-600">{accessError}</p>}
                <button
                  type="button"
                  onClick={handleAccessSubmit}
                  className="rounded-2xl border border-[#e57648] bg-[#e57648] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#d7653b]"
                >
                  Accéder au test
                </button>
              </div>
            </div>
          </section>
        )}
        {accessGranted && (
        <section className="grid flex-1 gap-4 sm:gap-6 lg:grid-cols-[240px_1fr]">
          <aside className={`${sidePanelClass} order-2 lg:order-1`}>
            <div className="flex items-center justify-between">
              <h3 className={navTitleClass}>
                Navigation
              </h3>
              <span className={navCountClass}>
                {totalQuestions === 0 ? "0/0" : `${currentIndex + 1}/${totalQuestions}`}
              </span>
            </div>
            {isIdentityReady && qcmLoaded && totalQuestions > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-300/70 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/60">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Progression</span>
                  <span className="text-[#e57648]">{progressPercent}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[#e57648] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-3 grid gap-1 text-xs text-slate-700 dark:text-slate-300">
                  <p>
                    Répondues: <span className="font-semibold">{answeredCount}/{totalQuestions}</span>
                  </p>
                  <p>
                    Restantes: <span className="font-semibold">{unansweredCount}</span>
                  </p>
                  <p>
                    QCM: <span className="font-semibold">{qcmAnsweredCount}/{qcmQuestions.length}</span>
                  </p>
                  <p>
                    Réponses libres: <span className="font-semibold">{freeAnsweredCount}/{freeQuestions.length}</span>
                  </p>
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-5 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
              {allQuestions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => goToQuestion(index)}
                  disabled={!isIdentityReady}
                  className={`flex h-9 items-center justify-center rounded-xl border text-xs font-semibold transition sm:h-10 sm:text-sm ${
                    index === currentIndex
                      ? "border-[#e57648] bg-[#e57648]/15 text-[#e57648] shadow-sm"
                      : isDark
                        ? "border-slate-700 text-slate-300 hover:border-[#e57648]"
                        : "border-slate-500 text-slate-900 hover:border-[#e57648]"
                  }`}
                  aria-label={`Aller à la question ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleValidateTest}
              disabled={!isIdentityReady || !qcmLoaded || totalQuestions === 0 || unansweredCount > 0}
              className="mt-auto rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d7653b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Vérification finale
            </button>
            {isIdentityReady && qcmLoaded && totalQuestions > 0 && unansweredCount > 0 && (
              <p className="mt-2 text-xs text-rose-600">
                {unansweredCount} question{unansweredCount > 1 ? "s" : ""} restante{unansweredCount > 1 ? "s" : ""} avant validation.
              </p>
            )}
            {completionError && <p className="mt-2 text-xs text-rose-600">{completionError}</p>}
          </aside>

          <div className="relative order-1 flex flex-1 flex-col items-center gap-4 sm:gap-6 lg:order-2">
            <div className={questionPanelClass}>
              {!identityConfirmed && (
                <div className="flex flex-1 flex-col items-center justify-center gap-6 text-sm text-slate-600 dark:text-slate-300">
                  <div className="text-center">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Avant de commencer
                    </p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      Merci d&apos;indiquer votre nom et prénom.
                    </p>
                  </div>
                  <div className="grid w-full gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                      Nom
                      <input
                        type="text"
                        value={participant.nom}
                        onChange={(event) =>
                          setParticipant((prev) => ({ ...prev, nom: event.target.value }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder="Votre nom"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
                      prénom
                      <input
                        type="text"
                        value={participant.prénom}
                        onChange={(event) =>
                          setParticipant((prev) => ({ ...prev, prénom: event.target.value }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder="Votre prénom"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIdentityConfirmed(true)}
                    disabled={!isIdentityComplete}
                    className="rounded-xl border border-[#e57648] bg-[#e57648] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#d7653b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Commencer le questionnaire
                  </button>
                </div>
              )}
              {isIdentityReady && !qcmLoaded && (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Chargement des QCM...
                </div>
              )}
              {isIdentityReady && qcmLoaded && showFinalReview && (
                <div className="flex h-full flex-col gap-4">
                  <div className={questionMetaClass}>
                    <span>Vérification finale</span>
                    <span>{totalQuestions} réponses</span>
                  </div>
                  <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-[#e57648]">
                    Résumé avant envoi
                  </p>
                  <h3 className={questionTitleClass}>
                    Merci de vérifier vos réponses avant validation définitive
                  </h3>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                    <p>
                      <span className="font-semibold">Nom :</span> {participant.nom.trim() || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Prénom :</span> {participant.prénom.trim() || "-"}
                    </p>
                  </div>
                  <div className="mt-2 max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-950/60 sm:max-h-[360px]">
                    <div className="space-y-3">
                      {allQuestions.map((question, index) => (
                        <div
                          key={question.id}
                          className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"
                        >
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {index + 1}. {question.label}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                            {getQuestionSummaryAnswer(question)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFinalReview(false)}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Retour au questionnaire
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmAndSubmit}
                      className="rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d7653b]"
                    >
                      Confirmer et envoyer
                    </button>
                  </div>
                </div>
              )}
              {isIdentityReady && qcmLoaded && !showFinalReview && currentQuestion && (
                <>
              <div className={questionMetaClass}>
                <span>Question {currentIndex + 1}</span>
                <span>{totalQuestions} questions</span>
              </div>
              <p className={questionSectionClass}>
                {currentQuestion.section === "qcm" ? "QCM" : "Réponse libre"}
              </p>
              <h3 className={questionTitleClass}>
                {currentQuestion.label}
              </h3>

              {currentQuestion.type === "radio" && (
                <div className="mt-4 grid flex-1 gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
                  {displayOptions.map((option) => {
                    const isPlaceholder = option === "__placeholder__";
                    return (
                      <label
                        key={option}
                        className={`group relative flex min-h-[82px] items-center justify-center rounded-2xl border px-3 py-4 text-center text-sm font-semibold transition sm:min-h-[96px] sm:px-4 sm:py-5 ${
                          isPlaceholder
                            ? isDark
                              ? "border-slate-700/60 bg-slate-900/40 text-transparent"
                              : "border-slate-200/60 bg-white/40 text-transparent"
                            : answers[currentQuestion.id] === option
                              ? isDark
                                ? "border-teal-400 bg-teal-950/40 text-teal-200 shadow-sm"
                                : "border-teal-400 bg-teal-50 text-teal-700 shadow-sm"
                              : isDark
                                ? "border-slate-700 text-slate-200 hover:border-teal-300"
                                : "border-slate-500 text-slate-900 hover:border-teal-500"
                        }`}
                      >
                        {!isPlaceholder && (
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            checked={answers[currentQuestion.id] === option}
                            onChange={() => handleRadio(currentQuestion.id, option)}
                            className="sr-only"
                          />
                        )}
                        <span className="pointer-events-none">{isPlaceholder ? "" : option}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {currentQuestion.type === "checkbox" && (
                <div className="mt-4 grid flex-1 gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
                  {displayOptions.map((option) => {
                    const isPlaceholder = option === "__placeholder__";
                    const current = Array.isArray(answers[currentQuestion.id])
                      ? (answers[currentQuestion.id] as string[])
                      : [];
                    const checked = !isPlaceholder && current.includes(option);
                    return (
                      <label
                        key={option}
                        className={`group relative flex min-h-[82px] items-center justify-center rounded-2xl border px-3 py-4 text-center text-sm font-semibold transition sm:min-h-[96px] sm:px-4 sm:py-5 ${
                          isPlaceholder
                            ? isDark
                              ? "border-slate-700/60 bg-slate-900/40 text-transparent"
                              : "border-slate-200/60 bg-white/40 text-transparent"
                            : checked
                              ? isDark
                                ? "border-teal-400 bg-teal-950/40 text-teal-200 shadow-sm"
                                : "border-teal-400 bg-teal-50 text-teal-700 shadow-sm"
                              : isDark
                                ? "border-slate-700 text-slate-200 hover:border-teal-300"
                                : "border-slate-500 text-slate-900 hover:border-teal-500"
                        }`}
                      >
                        {!isPlaceholder && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCheckbox(currentQuestion.id, option)}
                            className="sr-only"
                          />
                        )}
                        <span className="pointer-events-none">{isPlaceholder ? "" : option}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type === "textarea" && (
                currentQuestion.id === "free-3" ? (
                  <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4">
                    {pictograms.map((picto, index) => {
                      const pictoAnswers = Array.isArray(answers[currentQuestion.id])
                        ? (answers[currentQuestion.id] as string[])
                        : Array(pictograms.length).fill("");
                      return (
                        <div
                          key={picto.id}
                          className="grid items-center gap-4 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[96px_1fr] dark:border-slate-700"
                        >
                          <Image
                            src={picto.src}
                            alt={picto.alt}
                            width={80}
                            height={80}
                            className="h-20 w-20 justify-self-center rounded-lg object-contain bg-white p-1"
                          />
                          <input
                            type="text"
                            value={pictoAnswers[index] || ""}
                            onChange={(event) =>
                              handlePictogramText(currentQuestion.id, index, event.target.value)
                            }
                            maxLength={PICTOGRAM_TEXT_MAX_CHARS}
                            placeholder="Votre réponse pour ce pictogramme"
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(pictoAnswers[index] || "").length}/{PICTOGRAM_TEXT_MAX_CHARS}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <textarea
                      className="mt-4 min-h-[220px] w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:mt-6 sm:min-h-[320px]"
                      value={answers[currentQuestion.id] as string}
                      onChange={(event) => handleText(currentQuestion.id, event.target.value)}
                      maxLength={FREE_TEXT_MAX_CHARS}
                      placeholder="Votre réponse..."
                    />
                    <p className="mt-2 text-right text-xs text-slate-500 dark:text-slate-400">
                      {String(answers[currentQuestion.id] || "").length}/{FREE_TEXT_MAX_CHARS}
                    </p>
                  </>
                )
              )}
                </>
              )}
            </div>

            {isIdentityReady && qcmLoaded && (showSignaturePrompt || participantSignature) && (
              <div className="w-full rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-white dark:text-slate-900">
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-900">
                      Signature du candidat
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-700">
                      Merci de signer avant de valider le test.
                    </p>
                  </div>
                  {participantSignature && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-white">
                      <Image
                        src={participantSignature}
                        alt="Signature du candidat"
                        width={520}
                        height={80}
                        unoptimized
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-white">
                    <canvas
                      ref={signatureCanvasRef}
                      width={520}
                      height={160}
                      className="h-36 w-full touch-none"
                      onPointerDown={handleSignaturePointerDown}
                      onPointerMove={handleSignaturePointerMove}
                      onPointerUp={handleSignaturePointerUp}
                      onPointerLeave={handleSignaturePointerUp}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSignatureUse}
                      className="rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#d7653b]"
                    >
                      Utiliser cette signature
                    </button>
                    <button
                      type="button"
                      onClick={handleSignatureClear}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-300 dark:bg-white dark:text-slate-700"
                    >
                      Effacer
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex w-full items-center justify-between px-1 pb-1 sm:px-4 sm:pb-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={!isIdentityReady || showFinalReview || currentIndex === 0 || totalQuestions === 0}
                className="group flex h-12 w-14 items-center justify-center rounded-xl border border-[#e57648]/60 bg-white/70 shadow-sm transition hover:-translate-y-0.5 hover:border-[#e57648] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/80"
                aria-label="Question précédente"
              >
                <span className="h-0 w-0 border-y-[10px] border-r-[16px] border-y-transparent border-r-[#e57648] transition group-hover:border-r-[#d7653b]" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!isIdentityReady || showFinalReview || currentIndex === totalQuestions - 1 || totalQuestions === 0}
                className="group flex h-12 w-14 items-center justify-center rounded-xl border border-[#e57648]/60 bg-white/70 shadow-sm transition hover:-translate-y-0.5 hover:border-[#e57648] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/80"
                aria-label="Question suivante"
              >
                <span className="h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-[#e57648] transition group-hover:border-l-[#d7653b]" />
              </button>
            </div>
          </div>
        </section>
        )}
      </main>
    </div>
  );
}
