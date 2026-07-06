"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CAMPAIGN_GOALS, CAMPAIGN_GOAL_LABELS_HE } from "@campaignos/shared";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, Input, Label, PageHeader, Select, Spinner } from "@/components/ui";

function NewCampaignInner() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useSearchParams();
  const preClient = params.get("clientId") ?? "";
  const { data: clientsData } = useApi(() => api.clients(1), []);
  const clients = clientsData?.items ?? [];

  const [form, setForm] = useState({
    clientId: preClient,
    name: "",
    goal: "LEADS",
    budgetType: "DAILY",
    budgetShekels: 150,
    countries: "IL",
    ageMin: 25,
    ageMax: 55,
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.clientId || form.name.length < 2) {
      toast("יש לבחור לקוח ולהזין שם קמפיין", "error");
      return;
    }
    setSaving(true);
    try {
      const campaign = await api.createCampaignDraft({
        clientId: form.clientId,
        name: form.name,
        goal: form.goal,
        budgetType: form.budgetType,
        budgetAmount: Math.round(form.budgetShekels * 100),
        targetingDraft: {
          countries: form.countries.split(",").map((c) => c.trim()),
          ageMin: form.ageMin,
          ageMax: form.ageMax,
        },
      });
      toast("טיוטת הקמפיין נוצרה", "success");
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="קמפיין חדש" subtitle="יצירת טיוטת קמפיין" />
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label>לקוח</Label>
            <Select value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">בחר לקוח…</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>שם הקמפיין</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="לדוגמה: לידים - מנוי חודשי" />
          </div>
          <div>
            <Label>מטרה</Label>
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set("goal", g)}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    form.goal === g ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {CAMPAIGN_GOAL_LABELS_HE[g]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>סוג תקציב</Label>
              <Select value={form.budgetType} onChange={(e) => set("budgetType", e.target.value)}>
                <option value="DAILY">יומי</option>
                <option value="LIFETIME">כולל</option>
              </Select>
            </div>
            <div>
              <Label>תקציב (₪)</Label>
              <Input type="number" value={form.budgetShekels} onChange={(e) => set("budgetShekels", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>מדינות</Label>
              <Input dir="ltr" value={form.countries} onChange={(e) => set("countries", e.target.value)} />
            </div>
            <div>
              <Label>גיל מ-</Label>
              <Input type="number" value={form.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
            </div>
            <div>
              <Label>גיל עד</Label>
              <Input type="number" value={form.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            💡 Advantage+ Audience יופעל כברירת מחדל. ניתן לייצר אסטרטגיה ומודעות עם AI לאחר יצירת הטיוטה.
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} loading={saving}>
              יצירת טיוטה
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<Spinner className="mx-auto my-20 h-8 w-8 text-brand-600" />}>
      <NewCampaignInner />
    </Suspense>
  );
}
