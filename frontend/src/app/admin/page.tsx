"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "react-hot-toast";

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
const TOKEN_KEY = "adminJwtToken";
const REFRESH_TOKEN_KEY = "adminJwtRefreshToken";
const AUTO_SAVE_INTERVAL_MS = 8000; // 8 seconds entre chaque sauvegarde automatique

const isJwtExpiredOrSoon = (jwt: string, thresholdSeconds = 30) => {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      return true;
    }
    const payloadRaw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadRaw) as { exp?: number };
    if (!payload.exp) {
      return true;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSeconds + thresholdSeconds;
  } catch {
    return true;
  }
};

type TestListItem = {
  id: number;
  nom: string;
  prénom: string;
  date: string | null;
  score20: number | null;
  testType: "test-accueil" | "stagiaire" | "technicien" | "service-administratif";
  workflowStatus: "to_review" | "in_progress" | "validated";
  validatedAt: string | null;
  validatedBy: string | null;
  isValidated: boolean;
  createdAt: string;
};

type StatusFilter = "all" | "to_review" | "in_progress" | "validated";
type TestTypeFilter = "all" | "test-accueil" | "stagiaire" | "technicien" | "service-administratif";
type SortOption = "recent" | "score-desc" | "score-asc" | "date-desc" | "date-asc";

type TestListResponse = {
  results: TestListItem[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type TestDetail = {
  id: number;
  nom: string;
  prénom: string;
  date: string | null;
  score20: number | null;
  testType?: "test-accueil" | "stagiaire" | "technicien" | "service-administratif";
  workflowStatus?: "to_review" | "in_progress" | "validated";
  validatedAt?: string | null;
  validatedBy?: string | null;
  stats: Record<string, unknown>;
  qcmResults: unknown[];
  freeResults: unknown[];
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
      participant?: string;
      animateur?: string;
    };
    observations: {
      animateur?: string;
    };
    workflow?: {
      status?: "to_review" | "in_progress" | "validated";
      validatedAt?: string | null;
      validatedBy?: string | null;
    };
  };
  createdAt: string;
};

const LazySignaturePad = dynamic(() => import("@/components/admin/SignaturePad"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
      Chargement du module de signature...
    </div>
  ),
});

const LazyPdfPreviewPanel = dynamic(() => import("@/components/admin/PdfPreviewPanel"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
      Chargement de la prévisualisation...
    </div>
  ),
});

export default function AdminTestsPage() {
  const [theme, setTheme] = useState("light");
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TestDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [testTypeFilter, setTestTypeFilter] = useState<TestTypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [observations, setObservations] = useState("");
  const [animateurSignature, setAnimateurSignature] = useState("");
  const [isValidated, setIsValidated] = useState(false);
  const [needsReinforcement, setNeedsReinforcement] = useState(false);
  const [correctionPresented, setCorrectionPresented] = useState(true);
  const [workflowStatus, setWorkflowStatus] = useState<"to_review" | "in_progress" | "validated">("to_review");
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [validatedBy, setValidatedBy] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<{
    observations: string;
    animateurSignature: string;
    isValidated: boolean;
    needsReinforcement: boolean;
    correctionPresented: boolean;
    workflowStatus: "to_review" | "in_progress" | "validated";
  } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewCacheRef = useRef<Map<number, string>>(new Map());
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme");
    const nextTheme = storedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);

    const stored = window.localStorage.getItem(TOKEN_KEY);
    const storedRefresh = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (stored) {
      setToken(stored);
    }
    if (storedRefresh) {
      setRefreshToken(storedRefresh);
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

  const authHeaders = (jwt: string) => ({
    Authorization: `Bearer ${jwt}`,
  });

  const clearPreview = useCallback(() => {
    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
      previewAbortRef.current = null;
    }
    previewCacheRef.current.forEach((url) => {
      window.URL.revokeObjectURL(url);
    });
    previewCacheRef.current.clear();
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPdfPreviewUrl(null);
    setPreviewError(null);
  }, []);

  const clearAuth = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setRefreshToken(null);
    setTests([]);
    setTotalCount(0);
    setTotalPages(1);
    setSelectedId(null);
    setDetail(null);
    clearPreview();
  }, [clearPreview]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const invalidatePreviewCacheFor = useCallback((id: number) => {
    const cachedUrl = previewCacheRef.current.get(id);
    if (!cachedUrl) {
      return;
    }
    window.URL.revokeObjectURL(cachedUrl);
    previewCacheRef.current.delete(id);
    if (previewUrlRef.current === cachedUrl) {
      previewUrlRef.current = null;
      setPdfPreviewUrl(null);
    }
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) {
      return null;
    }
    const response = await fetch(`${API_BASE}/api/token/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { access: string };
    window.localStorage.setItem(TOKEN_KEY, data.access);
    setToken(data.access);
    return data.access;
  }, [refreshToken]);

  const authorizedFetch = useCallback(
    async (path: string, init?: RequestInit, retry = true): Promise<Response> => {
      if (!token) {
        throw new Error("Not authenticated");
      }

      let activeToken = token;
      if (isJwtExpiredOrSoon(activeToken)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          clearAuth();
          throw new Error("Session expired");
        }
        activeToken = refreshed;
      }

      const headers = {
        ...authHeaders(activeToken),
        ...(init?.headers || {}),
      };

      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
      });

      if (response.status === 401 && retry) {
        const nextToken = await refreshAccessToken();
        if (!nextToken) {
          clearAuth();
          throw new Error("Session expired");
        }

        const retryHeaders = {
          ...authHeaders(nextToken),
          ...(init?.headers || {}),
        };

        return fetch(`${API_BASE}${path}`, {
          ...init,
          headers: retryHeaders,
        });
      }

      return response;
    },
    [clearAuth, refreshAccessToken, token],
  );

  const fetchTests = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("page_size", String(pageSize));
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      if (dateFrom) {
        params.set("date_from", dateFrom);
      }
      if (dateTo) {
        params.set("date_to", dateTo);
      }
      if (scoreMin.trim()) {
        params.set("score_min", scoreMin.trim());
      }
      if (scoreMax.trim()) {
        params.set("score_max", scoreMax.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (testTypeFilter !== "all") {
        params.set("test_type", testTypeFilter);
      }
      params.set("sort", sortBy);

      const response = await authorizedFetch(`/api/admin/tests?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Chargement impossible");
      }
      const data = (await response.json()) as TestListResponse;
      setTests(Array.isArray(data.results) ? data.results : []);
      setTotalCount(typeof data.count === "number" ? data.count : 0);
      setTotalPages(typeof data.total_pages === "number" ? data.total_pages : 1);
      if (typeof data.page === "number" && data.page !== currentPage) {
        setCurrentPage(data.page);
      }
    } catch {
      setError("Impossible de charger la liste des tests.");
    } finally {
      setLoadingList(false);
    }
  }, [
    authorizedFetch,
    currentPage,
    dateFrom,
    dateTo,
    pageSize,
    scoreMax,
    scoreMin,
    searchQuery,
    sortBy,
    statusFilter,
    testTypeFilter,
  ]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void fetchTests();
  }, [fetchTests, token]);

  const fetchPdfPreview = useCallback(
    async (id: number, forceRefresh = false) => {
      const cachedPreview = previewCacheRef.current.get(id);
      if (cachedPreview && !forceRefresh) {
        setPdfPreviewUrl(cachedPreview);
        setPreviewError(null);
        return;
      }

      if (previewAbortRef.current) {
        previewAbortRef.current.abort();
      }
      const controller = new AbortController();
      previewAbortRef.current = controller;

      setLoadingPreview(true);
      setPreviewError(null);
      try {
        const response = await authorizedFetch(`/api/admin/tests/${id}/pdf?preview=1`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Preview impossible");
        }
        const blob = await response.blob();
        const nextUrl = window.URL.createObjectURL(blob);
        const previousCachedUrl = previewCacheRef.current.get(id);
        if (previousCachedUrl) {
          window.URL.revokeObjectURL(previousCachedUrl);
        }
        previewCacheRef.current.set(id, nextUrl);
        previewUrlRef.current = nextUrl;
        setPdfPreviewUrl(nextUrl);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPdfPreviewUrl(null);
        setPreviewError("Impossible de charger la prévisualisation PDF.");
      } finally {
        if (previewAbortRef.current === controller) {
          previewAbortRef.current = null;
        }
        setLoadingPreview(false);
      }
    },
    [authorizedFetch],
  );

  const fetchDetail = async (id: number) => {
    setLoadingDetail(true);
    setError(null);
    setPreviewError(null);
    try {
      const response = await authorizedFetch(`/api/admin/tests/${id}`);
      if (!response.ok) {
        throw new Error("Chargement impossible");
      }
      const data = (await response.json()) as TestDetail;
      setDetail(data);
      setSelectedId(id);
      setObservations(data.pdfPayload?.observations?.animateur || "");
      setAnimateurSignature(data.pdfPayload?.signatures?.animateur || "");
      const result = data.pdfPayload?.result;
      const defaultValid = data.score20 !== null ? data.score20 >= 10 : false;
      const validValue = typeof result?.validé === "boolean" ? result.validé : defaultValid;
      setIsValidated(validValue);
      setNeedsReinforcement(
        typeof result?.renforcement === "boolean" ? result.renforcement : !validValue,
      );
      setCorrectionPresented(
        typeof result?.correction === "boolean" ? result.correction : true,
      );
      const nextWorkflowStatus =
        data.workflowStatus || data.pdfPayload?.workflow?.status || "to_review";
      setWorkflowStatus(nextWorkflowStatus);
      setValidatedAt(data.validatedAt || data.pdfPayload?.workflow?.validatedAt || null);
      setValidatedBy(data.validatedBy || data.pdfPayload?.workflow?.validatedBy || null);
      setSavedDraft({
        observations: data.pdfPayload?.observations?.animateur || "",
        animateurSignature: data.pdfPayload?.signatures?.animateur || "",
        isValidated: validValue,
        needsReinforcement:
          typeof result?.renforcement === "boolean" ? result.renforcement : !validValue,
        correctionPresented:
          typeof result?.correction === "boolean" ? result.correction : true,
        workflowStatus: nextWorkflowStatus,
      });
      await fetchPdfPreview(id);
    } catch {
      setError("Impossible de charger le test.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error("Identifiants invalidés");
      }
      const data = (await response.json()) as { access: string; refresh: string };
      window.localStorage.setItem(TOKEN_KEY, data.access);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
      setToken(data.access);
      setRefreshToken(data.refresh);
    } catch {
      setError("Connexion impossible. Vérifiez vos identifiants.");
    }
  };

  const handleLogout = () => {
    clearAuth();
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setScoreMin("");
    setScoreMax("");
    setStatusFilter("all");
    setTestTypeFilter("all");
    setSortBy("recent");
    setCurrentPage(1);
  };

  const showToast = useCallback((message: string) => {
    toast.success(message, {
      duration: 2800,
      style: {
        border: "1px solid #166534",
        padding: "14px",
        color: "#14532d",
        background: "#ecfdf5",
        fontWeight: "600",
      },
      iconTheme: {
        primary: "#16a34a",
        secondary: "#ecfdf5",
      },
    });
  }, []);

  const getStatusLabel = (status: "to_review" | "in_progress" | "validated") => {
    if (status === "validated") {
      return "validé";
    }
    if (status === "in_progress") {
      return "En cours";
    }
    return "À relire";
  };

  const getStatusBadgeClass = (status: "to_review" | "in_progress" | "validated") => {
    if (status === "validated") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    }
    if (status === "in_progress") {
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    }
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  };

  const getResultBadgeClass = (valid: boolean) => {
    return valid
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300";
  };

  const getTestTypeLabel = (
    testType: "test-accueil" | "stagiaire" | "technicien" | "service-administratif" | undefined,
  ) => {
    if (testType === "stagiaire") {
      return "Stagiaire";
    }
    if (testType === "technicien") {
      return "Technicien";
    }
    if (testType === "service-administratif") {
      return "Service administratif";
    }
    return "Test accueil";
  };

  const buildReviewPayload = useCallback(
    (targetDetail: TestDetail) => ({
      signatures: {
        participant: targetDetail.pdfPayload?.signatures?.participant || "",
        animateur: animateurSignature,
      },
      observations: {
        animateur: observations,
      },
      result: {
        score:
          targetDetail.pdfPayload?.result?.score ||
          (targetDetail.score20 !== null ? String(targetDetail.score20) : ""),
        validé: isValidated,
        renforcement: needsReinforcement,
        correction: correctionPresented,
      },
      workflow: {
        status: workflowStatus,
        validatedAt,
        validatedBy,
      },
    }),
    [
      animateurSignature,
      correctionPresented,
      isValidated,
      needsReinforcement,
      observations,
      workflowStatus,
      validatedAt,
      validatedBy,
    ],
  );

  const handleValidationDecision = async (valid: boolean) => {
    if (!detail || !token) {
      return;
    }
    setIsValidated(valid);
    setNeedsReinforcement(!valid);
    setSaving(true);
    setError(null);
    try {
      // Result decision updates pedagogic outcome; workflow completion is handled separately.
      const nextWorkflowStatus = workflowStatus === "to_review" ? "in_progress" : workflowStatus;
      const response = await authorizedFetch(`/api/admin/tests/${detail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signatures: {
            participant: detail.pdfPayload?.signatures?.participant || "",
            animateur: animateurSignature,
          },
          observations: {
            animateur: observations,
          },
          result: {
            score:
              detail.pdfPayload?.result?.score ||
              (detail.score20 !== null ? String(detail.score20) : ""),
            validé: valid,
            renforcement: !valid,
            correction: correctionPresented,
          },
          workflow: {
            status: nextWorkflowStatus,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("Validation impossible");
      }
      await fetchDetail(detail.id);
      await fetchTests();
      showToast("Résultat mis à jour.");
    } catch {
      setError("Impossible de mettre a jour la validation du test.");
    } finally {
      setSaving(false);
    }
  };

  const handleWorkflowStatusChange = async (
    nextStatus: "to_review" | "in_progress" | "validated",
  ) => {
    if (!detail || !token) {
      return;
    }
    if (nextStatus === "validated" && !animateurSignature.trim()) {
      setError("Ajoutez d'abord la signature animateur avant de clôturer le workflow.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/admin/tests/${detail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...buildReviewPayload(detail),
          workflow: {
            status: nextStatus,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("Mise à jour workflow impossible");
      }
      invalidatePreviewCacheFor(detail.id);
      await fetchDetail(detail.id);
      await fetchTests();
      showToast("Workflow mis à jour.");
    } catch {
      setError("Impossible de mettre a jour le workflow du test.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!detail || !token) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/admin/tests/${detail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildReviewPayload(detail)),
      });
      if (!response.ok) {
        throw new Error("Sauvegarde impossible");
      }
      invalidatePreviewCacheFor(detail.id);
      await fetchDetail(detail.id);
      await fetchTests();
      showToast("Sauvegarde réussie.");
    } catch {
      setError("Impossible de sauvegarder les signatures.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!detail || !token) {
      return;
    }
    setError(null);
    try {
      // Persist current review fields so PDF always includes latest signature/observation.
      const saveResponse = await authorizedFetch(`/api/admin/tests/${detail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildReviewPayload(detail)),
      });
      if (!saveResponse.ok) {
        throw new Error("Sauvegarde impossible");
      }
      showToast("Sauvegarde réussie.");

      invalidatePreviewCacheFor(detail.id);
      const response = await authorizedFetch(`/api/admin/tests/${detail.id}/pdf`);
      if (!response.ok) {
        throw new Error("PDF impossible");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      previewCacheRef.current.set(detail.id, url);
      previewUrlRef.current = url;
      setPdfPreviewUrl(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = `test_accueil_${detail.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Impossible de générer le PDF.");
    }
  };

  const selectedLabel = useMemo(() => {
    if (!detail) {
      return "";
    }
    return `${detail.nom} ${detail.prénom}`.trim();
  }, [detail]);

  const hasUnsavedChanges = useMemo(() => {
    if (!detail || !savedDraft) {
      return false;
    }
    return (
      observations !== savedDraft.observations ||
      animateurSignature !== savedDraft.animateurSignature ||
      isValidated !== savedDraft.isValidated ||
      needsReinforcement !== savedDraft.needsReinforcement ||
      correctionPresented !== savedDraft.correctionPresented ||
      workflowStatus !== savedDraft.workflowStatus
    );
  }, [
    animateurSignature,
    correctionPresented,
    detail,
    isValidated,
    needsReinforcement,
    observations,
    savedDraft,
    workflowStatus,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!detail || !token || !savedDraft) {
      return;
    }

    const interval = window.setInterval(async () => {
      if (saving || autoSaving) {
        return;
      }
      if (observations === savedDraft.observations) {
        return;
      }

      setAutoSaving(true);
      try {
        const response = await authorizedFetch(`/api/admin/tests/${detail.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            observations: {
              animateur: observations,
            },
          }),
        });

        if (response.ok) {
          setSavedDraft((prev) =>
            prev
              ? {
                  ...prev,
                  observations,
                }
              : prev,
          );
        }
      } finally {
        setAutoSaving(false);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [authorizedFetch, autoSaving, detail, observations, savedDraft, saving, token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFrom, dateTo, scoreMin, scoreMax, statusFilter, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [testTypeFilter]);

  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(pageStart + tests.length - 1, totalCount);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6 sm:py-16">
        <div className="mx-auto flex w-full max-w-md justify-end pb-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full border border-[#e57648]/50 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#e57648] dark:bg-slate-900/70 dark:text-slate-200"
          >
            {theme === "dark" ? "Mode jour" : "Mode nuit"}
          </button>
        </div>
        <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-2xl font-semibold text-slate-900">Accès admin</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Connexion reservée aux administrateurs.</p>
          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
          <div className="mt-6 grid gap-4">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Utilisateur"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mot de passe"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={handleLogin}
            className="mt-6 w-full rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d7653b]"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-6 sm:py-10">
      <Toaster
        position="top-right"
        toastOptions={{
          success: {
            style: {
              border: "1px solid #166534",
              padding: "14px",
              color: "#14532d",
              background: "#ecfdf5",
              fontWeight: "600",
            },
            iconTheme: {
              primary: "#16a34a",
              secondary: "#ecfdf5",
            },
          },
        }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Tests à relire</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Validation, signatures et génération PDF.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full border border-[#e57648]/50 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#e57648] dark:bg-slate-900/70 dark:text-slate-200"
          >
            {theme === "dark" ? "Mode jour" : "Mode nuit"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Déconnexion
          </button>
        </div>
      </div>

      {error && <p className="mx-auto mt-4 w-full max-w-6xl text-sm text-rose-600">{error}</p>}

      <div className="mx-auto mt-4 grid w-full max-w-6xl gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="order-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:order-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Liste</p>
            {loadingList && <span className="text-xs text-slate-500 dark:text-slate-400">Chargement...</span>}
          </div>
          <div className="mt-4 grid gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher nom, prénom ou ID"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={scoreMin}
                onChange={(event) => setScoreMin(event.target.value)}
                placeholder="Score min"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={scoreMax}
                onChange={(event) => setScoreMax(event.target.value)}
                placeholder="Score max"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">Statut: Tous</option>
              <option value="to_review">Statut: À relire</option>
              <option value="in_progress">Statut: En cours</option>
              <option value="validated">Statut: validé</option>
            </select>
            <select
              value={testTypeFilter}
              onChange={(event) => setTestTypeFilter(event.target.value as TestTypeFilter)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">Type: Tous</option>
              <option value="test-accueil">Type: Test accueil</option>
              <option value="stagiaire">Type: Stagiaire</option>
              <option value="technicien">Type: Technicien</option>
              <option value="service-administratif">Type: Service administratif</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="recent">Tri: Plus récent</option>
              <option value="score-desc">Tri: Score décroissant</option>
              <option value="score-asc">Tri: Score croissant</option>
              <option value="date-desc">Tri: Date décroissante</option>
              <option value="date-asc">Tri: Date croissante</option>
            </select>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">{tests.length}/{totalCount} résultats</p>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Réinitialiser
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Par page
              </label>
              <select
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Affichage {pageStart}-{pageEnd} sur {totalCount}
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            {tests.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => token && fetchDetail(item.id)}
                className={`flex flex-col rounded-xl border px-3 py-2 text-left text-sm transition ${
                  item.id === selectedId
                    ? "border-[#e57648] bg-[#e57648]/10 text-[#e57648]"
                    : "border-slate-200 text-slate-700 hover:border-[#e57648] dark:border-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="font-semibold">{item.nom} {item.prénom}</span>
                  <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {getTestTypeLabel(item.testType)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getResultBadgeClass(item.isValidated)}`}
                    >
                      {item.isValidated ? "Résultat validé" : "Résultat non validé"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeClass(item.workflowStatus)}`}
                    >
                      {getStatusLabel(item.workflowStatus)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">ID {item.id} · {item.date || "-"} · Score {item.score20 ?? "-"}</span>
                {item.workflowStatus === "validated" && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.validatedBy ? `validé par ${item.validatedBy}` : "validé"}
                    {item.validatedAt ? ` · ${new Date(item.validatedAt).toLocaleString("fr-FR")}` : ""}
                  </span>
                )}
              </button>
            ))}
            {totalCount === 0 && !loadingList && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Aucun test enregistre.</p>
            )}
            {totalCount > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Precedent
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Suivant
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="order-1 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6 lg:order-2">
          {!detail && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sélectionnez un test pour commencer.</p>
          )}
          {detail && (
            <>
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedLabel}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Test #{detail.id} · {detail.date || "-"} · {getTestTypeLabel(detail.testType)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="w-full rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d7653b] sm:w-auto"
                >
                  Generer PDF
                </button>
              </div>

              {loadingDetail && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Chargement...</p>}

              <div className="mt-6 grid gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Validation admin</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Résultat pédagogique: {isValidated ? "validé" : "Non validé"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Statut workflow: {getStatusLabel(workflowStatus)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Les boutons Résultat modifient la décision pédagogique. Les boutons Workflow pilotent l&apos;avancement du dossier.
                  </p>
                  {workflowStatus === "validated" && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {validatedBy ? `validé par ${validatedBy}` : "validé"}
                      {validatedAt ? ` le ${new Date(validatedAt).toLocaleString("fr-FR")}` : ""}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWorkflowStatusChange("to_review")}
                      disabled={saving}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Workflow: À relire
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWorkflowStatusChange("in_progress")}
                      disabled={saving}
                      className="rounded-xl border border-amber-500 bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                    >
                      Workflow: En cours
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleWorkflowStatusChange("validated")}
                      disabled={saving || !animateurSignature.trim()}
                      className="rounded-xl border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                    >
                      Workflow: Clôturer
                    </button>
                  </div>
                  {!animateurSignature.trim() && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      Signature animateur requise pour clôturer le workflow.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleValidationDecision(true)}
                      disabled={saving}
                      className="rounded-xl border border-emerald-500 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                    >
                      Résultat: validé
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleValidationDecision(false)}
                      disabled={saving}
                      className="rounded-xl border border-rose-500 bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
                    >
                      Résultat: Non validé
                    </button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={correctionPresented}
                      onChange={(event) => setCorrectionPresented(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Correction présentée
                  </label>
                </div>
                <LazySignaturePad
                  label="Signature animateur"
                  value={animateurSignature}
                  onChange={setAnimateurSignature}
                />
                <LazyPdfPreviewPanel
                  loadingPreview={loadingPreview}
                  previewError={previewError}
                  pdfPreviewUrl={pdfPreviewUrl}
                  onRefresh={() => {
                    if (detail) {
                      void fetchPdfPreview(detail.id, true);
                    }
                  }}
                />
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Observations animateur</p>
                  {autoSaving && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enregistrement automatique...</p>
                  )}
                  <textarea
                    value={observations}
                    onChange={(event) => setObservations(event.target.value)}
                    className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Ajouter une observation..."
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl border border-[#e57648] bg-[#e57648] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d7653b] disabled:opacity-60"
                  >
                    {saving ? "Sauvegarde..." : "Enregistrer signatures"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
