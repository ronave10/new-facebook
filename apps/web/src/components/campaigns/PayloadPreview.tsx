"use client";

import { useState } from "react";

const ACTION_LABELS: Record<string, string> = {
  create_campaign: "יצירת קמפיין",
  create_ad_set: "יצירת קבוצת מודעות",
  create_creative: "יצירת קריאייטיב",
  create_ad: "יצירת מודעה",
  activate: "הפעלה",
};

/**
 * Renders the exact ordered list of Meta API calls that publish will make.
 * This is the safety contract: the user sees precisely what will be sent.
 */
export function PayloadPreview({ steps }: { steps: any }) {
  const [openAll, setOpenAll] = useState(false);

  // Budget-change approvals carry an object preview, not a step array.
  if (steps && !Array.isArray(steps) && steps.metaCampaignId) {
    const inc = steps.changePct >= 0;
    return (
      <div className="rounded-xl border border-slate-200 p-4 text-sm">
        <div className="mb-2 font-medium text-slate-800">
          {inc ? "הגדלת תקציב" : "הקטנת תקציב"} ב-{Math.abs(steps.changePct)}%
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <span className="tabular">₪{(steps.currentBudget / 100).toLocaleString("he-IL")}</span>
          <span className="text-slate-400">←</span>
          <span className={`tabular font-semibold ${inc ? "text-green-600" : "text-amber-600"}`}>
            ₪{(steps.newBudget / 100).toLocaleString("he-IL")}
          </span>
          <span className="text-xs text-slate-400">({steps.budgetType === "DAILY" ? "יומי" : "כולל"})</span>
        </div>
        <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(steps, null, 2)}
        </pre>
      </div>
    );
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    return <div className="text-sm text-slate-500">אין תוכן לתצוגה מקדימה.</div>;
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {steps.length} קריאות ל-Meta יישלחו בסדר הבא. הכול נוצר במצב <strong>מושהה</strong> ומופעל רק לאחר אישור.
        </div>
        <button onClick={() => setOpenAll((v) => !v)} className="text-xs font-medium text-brand-600">
          {openAll ? "כווץ הכל" : "הצג הכל כ-JSON"}
        </button>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <PayloadStep key={i} step={s} defaultOpen={openAll} />
        ))}
      </ol>
    </div>
  );
}

function PayloadStep({ step, defaultOpen }: { step: any; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="rounded-xl border border-slate-200">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {step.step}
        </span>
        <span className="text-sm text-slate-700">
          <span className="font-medium">{ACTION_LABELS[step.action] ?? step.action}</span>
          {step.label && <span className="text-slate-500"> — {step.label}</span>}
        </span>
        <span className="ms-auto text-slate-400">{open || defaultOpen ? "▾" : "◂"}</span>
      </button>
      {(open || defaultOpen) && (
        <pre dir="ltr" className="mx-3 mb-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(step.spec, null, 2)}
        </pre>
      )}
    </li>
  );
}
