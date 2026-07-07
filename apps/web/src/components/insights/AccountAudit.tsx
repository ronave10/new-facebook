"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, EmptyState, Spinner } from "@/components/ui";
import { SeverityBadge } from "@/components/StatusBadge";

const GRADE_COLOR: Record<string, string> = {
  A: "#16A34A",
  B: "#65A30D",
  C: "#D97706",
  D: "#EA580C",
  F: "#DC2626",
};

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = GRADE_COLOR[grade] ?? "#4F46E5";
  return (
    <div className="relative h-44 w-44" dir="ltr">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#E2E8F0" strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold tabular text-slate-900">{score}</div>
        <div className="text-sm text-slate-400">מתוך 100</div>
        <div className="mt-1 text-lg font-bold" style={{ color }}>
          ציון {grade}
        </div>
      </div>
    </div>
  );
}

export function AccountAudit({ clientId }: { clientId: string }) {
  const { data, loading, error } = useApi(() => api.accountAudit(clientId), [clientId]);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  async function exportReport() {
    setExporting(true);
    try {
      const html = await api.auditReportHtml(clientId);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const win = window.open(url, "_blank");
      if (!win) toast("החלון נחסם — אשרו חלונות קופצים כדי לצפות בדוח", "error");
      // Revoke after the tab has had time to load the document.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הפקת הדוח נכשלה", "error");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />;
  if (error || !data) return <EmptyState title="לא ניתן להריץ בדיקה" description={error ?? "ודאו שהלקוח מחובר ומסונכרן."} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">בדיקת בריאות דטרמיניסטית על נתוני 14 הימים האחרונים</div>
        <Button variant="secondary" onClick={exportReport} loading={exporting}>
          📄 הפקת דוח PDF
        </Button>
      </div>
      <Card>
        <CardBody className="flex flex-col items-center gap-6 md:flex-row md:items-center">
          <ScoreGauge score={data.score} grade={data.grade} />
          <div className="flex-1">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">בריאות חשבון המודעות</h3>
            <div className="space-y-2.5">
              {data.categories.map((c: any) => (
                <div key={c.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {c.label} <span className="text-xs text-slate-400">({Math.round(c.weight * 100)}%)</span>
                    </span>
                    <span className="tabular font-medium text-slate-800">{c.score}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.score}%`,
                        background: c.score >= 70 ? "#16A34A" : c.score >= 45 ? "#D97706" : "#DC2626",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <div>
        <h3 className="mb-3 font-semibold text-slate-900">ממצאים לפי עדיפות ({data.findings.length})</h3>
        {data.findings.length === 0 ? (
          <EmptyState title="לא נמצאו בעיות 🎉" description="החשבון עומד בכל בדיקות הבריאות." />
        ) : (
          <div className="space-y-3">
            {data.findings.map((f: any, i: number) => (
              <Card key={i}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <SeverityBadge severity={f.severity} />
                    <div>
                      <div className="font-semibold text-slate-900">{f.title}</div>
                      <p className="mt-1 text-sm text-slate-600">{f.detail}</p>
                      <p className="mt-1.5 text-sm text-brand-700">✔ {f.fix}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
