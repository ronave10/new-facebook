"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Card, EmptyState, Select, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  NEW: "חדש",
  CONTACTED: "נוצר קשר",
  QUALIFIED: "מתאים",
  DISQUALIFIED: "לא מתאים",
  CONVERTED: "הומר",
};
const STATUS_TONE: Record<string, "gray" | "blue" | "green" | "red" | "amber" | "indigo"> = {
  NEW: "blue",
  CONTACTED: "amber",
  QUALIFIED: "indigo",
  DISQUALIFIED: "red",
  CONVERTED: "green",
};

export function LeadsInbox({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { data, loading, reload } = useApi(() => api.leads(clientId), [clientId]);
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    try {
      await api.simulateLead(clientId);
      toast("ליד לדוגמה נקלט", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "נכשל", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(leadId: string, status: string) {
    try {
      await api.updateLeadStatus(leadId, status);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "עדכון נכשל", "error");
    }
  }

  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;
  const leads = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">לידים שנקלטו מטופסי Lead Ads (webhook)</div>
        <Button variant="secondary" onClick={simulate} loading={busy}>
          + סימולציית ליד (דמו)
        </Button>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="אין לידים עדיין"
          description="כשלקוח ישאיר פרטים בטופס ליד, הוא ייקלט כאן אוטומטית דרך ה-webhook."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start font-medium">שם</th>
                <th className="px-4 py-3 text-start font-medium">אימייל</th>
                <th className="px-4 py-3 text-start font-medium">טלפון</th>
                <th className="px-4 py-3 text-start font-medium">התקבל</th>
                <th className="px-4 py-3 text-start font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{l.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">
                    {l.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">
                    {l.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(l.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[l.status] ?? "gray"}>{STATUS_LABELS[l.status] ?? l.status}</Badge>
                      <Select
                        value={l.status}
                        onChange={(e) => setStatus(l.id, e.target.value)}
                        className="max-w-[130px] py-1.5 text-xs"
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
