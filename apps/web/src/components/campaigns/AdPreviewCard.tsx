"use client";

import { VARIANT_STYLE_LABELS_HE } from "@campaignos/shared";

export function AdPreviewCard({ ad }: { ad: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Facebook-feed-style header */}
      <div className="flex items-center gap-2 p-3">
        <div className="h-9 w-9 rounded-full bg-brand-100" />
        <div>
          <div className="text-sm font-semibold text-slate-800">העמוד שלך</div>
          <div className="text-xs text-slate-400">ממומן · Meta</div>
        </div>
      </div>
      <div className="px-3 pb-2 text-sm text-slate-800" dir="auto">
        {ad.primaryText}
      </div>
      {/* creative placeholder */}
      <div className="flex aspect-[1.91/1] items-center justify-center bg-gradient-to-bl from-brand-50 to-slate-100 px-4 text-center text-xs text-slate-400">
        {ad.creative?.brief?.concept ?? "קריאייטיב"}
      </div>
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800" dir="auto">
            {ad.headline}
          </div>
          <div className="truncate text-xs text-slate-500" dir="auto">
            {ad.description}
          </div>
        </div>
        <button className="shrink-0 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {ad.cta ?? "מידע נוסף"}
        </button>
      </div>
      {/* meta info */}
      <div className="space-y-1.5 border-t border-slate-100 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {ad.persona?.name && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{ad.persona.name}</span>}
          {ad.angle && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{ad.angle}</span>}
          {ad.variantStyle && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
              {VARIANT_STYLE_LABELS_HE[ad.variantStyle as never]}
            </span>
          )}
        </div>
        {typeof ad.confidenceScore === "number" && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400">ביטחון</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-500" style={{ width: `${ad.confidenceScore}%` }} />
            </div>
            <span className="tabular text-slate-500">{ad.confidenceScore}</span>
          </div>
        )}
        {ad.whyItWorks && <div className="text-slate-500">💡 {ad.whyItWorks}</div>}
        {ad.complianceNotes && <div className="text-slate-400">⚖️ {ad.complianceNotes}</div>}
      </div>
    </div>
  );
}
