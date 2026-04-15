"use client";

type PdfPreviewPanelProps = {
  loadingPreview: boolean;
  previewError: string | null;
  pdfPreviewUrl: string | null;
  onRefresh: () => void;
};

export default function PdfPreviewPanel({
  loadingPreview,
  previewError,
  pdfPreviewUrl,
  onRefresh,
}: PdfPreviewPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prévisualisation PDF</p>
        <button
          type="button"
          onClick={onRefresh}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-auto sm:py-1.5"
        >
          Actualiser
        </button>
      </div>
      {loadingPreview && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Chargement de la prévisualisation...</p>}
      {previewError && <p className="mt-3 text-sm text-rose-600">{previewError}</p>}
      {!loadingPreview && !previewError && pdfPreviewUrl && (
        <iframe
          title="Prévisualisation du PDF"
          src={pdfPreviewUrl}
          className="mt-3 h-[62vh] min-h-[380px] w-full rounded-xl border border-slate-200 dark:border-slate-700 sm:h-[720px]"
        />
      )}
      {!loadingPreview && !previewError && !pdfPreviewUrl && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">La prévisualisation apparaîtra ici.</p>
      )}
    </div>
  );
}
