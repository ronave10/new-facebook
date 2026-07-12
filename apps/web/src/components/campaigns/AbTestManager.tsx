"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, EmptyState, Input, Label, Select, Spinner, Textarea } from "@/components/ui";

const STATUS_HE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-600" },
  PENDING_APPROVAL: { label: "ממתין לאישור", cls: "bg-amber-100 text-amber-700" },
  RUNNING: { label: "רץ", cls: "bg-emerald-100 text-emerald-700" },
  CONCLUDED: { label: "הסתיים", cls: "bg-blue-100 text-blue-700" },
  CANCELLED: { label: "בוטל", cls: "bg-slate-100 text-slate-400" },
};

interface Ad {
  id: string;
  name: string;
  hook?: string | null;
}

export function AbTestManager({ campaign }: { campaign: any }) {
  const campaignId = campaign.id as string;
  const { toast } = useToast();
  const [tests, setTests] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const ads: Ad[] = (campaign.adSets ?? []).flatMap((s: any) => s.ads ?? []);
  const adLabel = (a: Ad) => a.hook || a.name;

  const [form, setForm] = useState({
    name: "",
    hypothesis: "",
    metric: "CVR",
    cellAId: ads[0]?.id ?? "",
    cellBId: ads[1]?.id ?? "",
  });
  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function load() {
    try {
      setTests(await api.abTests(campaignId));
    } catch {
      setTests([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function create() {
    if (form.name.trim().length < 2) return toast("יש להזין שם למבחן", "error");
    if (form.cellAId === form.cellBId) return toast("יש לבחור שתי וריאציות שונות", "error");
    setCreating(true);
    try {
      await api.createAbTest(campaignId, {
        name: form.name.trim(),
        hypothesis: form.hypothesis.trim() || undefined,
        metric: form.metric,
        level: "AD",
        cellAId: form.cellAId,
        cellBId: form.cellBId,
      });
      toast("מבחן נוצר כטיוטה", "success");
      setShowForm(false);
      setForm((f) => ({ ...f, name: "", hypothesis: "" }));
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setCreating(false);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    try {
      await fn();
      toast(msg, "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הפעולה נכשלה", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (tests === null) return <Spinner className="mx-auto my-10 h-6 w-6 text-brand-600" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">מבחני A/B מנוהלים</h3>
          <p className="text-xs text-slate-500">השקה חיה ל-Meta Experiments — כל השקה עוברת אישור לפני הרצה.</p>
        </div>
        {ads.length >= 2 && (
          <Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "ביטול" : "➕ מבחן חדש"}
          </Button>
        )}
      </div>

      {ads.length < 2 && (
        <EmptyState title="נדרשות לפחות 2 מודעות" description="ייצר מודעות בקמפיין כדי להריץ מבחן A/B." />
      )}

      {showForm && ads.length >= 2 && (
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Label>שם המבחן</Label>
              <Input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="לדוגמה: הוק כאב מול הוק הצעה" />
            </div>
            <div>
              <Label>השערה</Label>
              <Textarea rows={2} value={form.hypothesis} onChange={(e) => setF("hypothesis", e.target.value)} placeholder="אנחנו מאמינים ש… כי…" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>מדד</Label>
                <Select value={form.metric} onChange={(e) => setF("metric", e.target.value)}>
                  <option value="CVR">יחס המרה (CVR)</option>
                  <option value="CTR">שיעור קליקים (CTR)</option>
                </Select>
              </div>
              <div>
                <Label>וריאציה A</Label>
                <Select value={form.cellAId} onChange={(e) => setF("cellAId", e.target.value)}>
                  {ads.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.id === form.cellBId}>
                      {adLabel(a)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>וריאציה B</Label>
                <Select value={form.cellBId} onChange={(e) => setF("cellBId", e.target.value)}>
                  {ads.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.id === form.cellAId}>
                      {adLabel(a)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={create} loading={creating}>
                צור מבחן
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tests.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">טרם נוצרו מבחנים מנוהלים לקמפיין זה.</p>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => {
            const st = STATUS_HE[t.status] ?? STATUS_HE.DRAFT;
            const r = t.result;
            return (
              <Card key={t.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{t.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {t.cellALabel} <span className="text-slate-300">מול</span> {t.cellBLabel} · מדד {t.metric}
                      </div>
                      {t.hypothesis && <p className="mt-1 text-sm text-slate-600">{t.hypothesis}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {t.status === "DRAFT" && (
                        <Button
                          variant="primary"
                          onClick={() => act(t.id, () => api.requestAbLaunch(t.id), "נשלח לאישור לפני השקה")}
                          loading={busyId === t.id}
                        >
                          השק (דרוש אישור)
                        </Button>
                      )}
                      {(t.status === "RUNNING" || t.status === "CONCLUDED") && (
                        <Button variant="secondary" onClick={() => act(t.id, () => api.refreshAbTest(t.id), "התוצאות עודכנו")} loading={busyId === t.id}>
                          רענן תוצאות
                        </Button>
                      )}
                      {(t.status === "DRAFT" || t.status === "PENDING_APPROVAL") && (
                        <Button variant="ghost" onClick={() => act(t.id, () => api.cancelAbTest(t.id), "המבחן בוטל")} loading={busyId === t.id}>
                          בטל
                        </Button>
                      )}
                    </div>
                  </div>

                  {r && (
                    <div className={`mt-3 rounded-xl border p-3 text-sm ${r.isSignificant ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="font-medium text-slate-800">
                          {r.isSignificant ? `🏆 מנצח: ${r.variant.label}` : "אין עדיין הכרעה מובהקת"}
                        </span>
                        <span>ביטחון <b className="tabular">{r.confidencePct?.toFixed(1)}%</b></span>
                        <span>שיפור <b className="tabular">{r.relativeLiftPct?.toFixed(0)}%</b></span>
                        <span className="tabular" dir="ltr">
                          {(r.variant.rate * 100).toFixed(2)}% vs {(r.control.rate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">{r.recommendation}</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
