"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Card, CardBody, ConfirmDialog, EmptyState, Input, Label, Modal, Select, Spinner } from "@/components/ui";
import { formatNumber } from "@/lib/format";

const SUBTYPE_LABELS: Record<string, string> = {
  WEBSITE: "מבקרי אתר",
  ENGAGEMENT: "מעורבות",
  CUSTOM: "רשימת לקוחות",
  LOOKALIKE: "Lookalike",
};
const SUBTYPE_TONE: Record<string, "blue" | "amber" | "green" | "indigo" | "gray"> = {
  WEBSITE: "blue",
  ENGAGEMENT: "amber",
  CUSTOM: "gray",
  LOOKALIKE: "indigo",
};

export function AudiencesManager({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { data, loading, reload } = useApi(() => api.audiences(clientId), [clientId]);
  const [createOpen, setCreateOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const audiences = data ?? [];

  async function sync() {
    setBusy(true);
    try {
      await api.syncAudiences(clientId);
      toast("קהלים סונכרנו מ-Meta", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "סנכרון נכשל", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteAudience(id);
      toast("הקהל נמחק", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "מחיקה נכשלה", "error");
    } finally {
      setRemoveId(null);
    }
  }

  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">קהלי רימרקטינג ו-Lookalike ליצירת קהלים לקמפיינים</div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={sync} loading={busy}>
            סנכרן מ-Meta
          </Button>
          <Button onClick={() => setCreateOpen(true)}>+ קהל חדש</Button>
        </div>
      </div>

      {audiences.length === 0 ? (
        <EmptyState
          title="אין קהלים"
          description="צרו קהל רימרקטינג (מבקרי אתר / מעורבות) או Lookalike להרחבת ההגעה."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {audiences.map((a: any) => (
            <Card key={a.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <Badge tone={SUBTYPE_TONE[a.subtype] ?? "gray"}>{SUBTYPE_LABELS[a.subtype] ?? a.subtype}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {a.approximateCount ? `~${formatNumber(a.approximateCount)} אנשים` : "בהערכה"}
                    {a.ratio ? ` · ${Math.round(a.ratio * 100)}%` : ""}
                  </div>
                </div>
                <button onClick={() => setRemoveId(a.id)} className="text-sm text-red-500 hover:underline">
                  מחק
                </button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <CreateAudienceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clientId={clientId}
        existing={audiences}
        onCreated={() => {
          setCreateOpen(false);
          reload();
        }}
      />

      <ConfirmDialog
        open={!!removeId}
        onClose={() => setRemoveId(null)}
        onConfirm={() => removeId && remove(removeId)}
        title="מחיקת קהל"
        message="האם למחוק את הקהל מ-Meta? פעולה זו אינה הפיכה."
        confirmLabel="מחק"
        destructive
      />
    </div>
  );
}

function CreateAudienceModal({
  open,
  onClose,
  clientId,
  existing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  existing: any[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", subtype: "WEBSITE", originAudienceId: "", ratio: 1 });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const nonLookalike = existing.filter((a) => a.subtype !== "LOOKALIKE");

  async function submit() {
    setBusy(true);
    try {
      await api.createAudience(clientId, {
        name: form.name,
        subtype: form.subtype,
        ...(form.subtype === "LOOKALIKE"
          ? { originAudienceId: form.originAudienceId, ratio: form.ratio / 100 }
          : {}),
      });
      toast("הקהל נוצר ב-Meta", "success");
      onCreated();
      setForm({ name: "", subtype: "WEBSITE", originAudienceId: "", ratio: 1 });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="יצירת קהל חדש">
      <div className="space-y-4">
        <div>
          <Label>שם הקהל</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="לדוגמה: מבקרי אתר 30 יום" />
        </div>
        <div>
          <Label>סוג קהל</Label>
          <Select value={form.subtype} onChange={(e) => set("subtype", e.target.value)}>
            <option value="WEBSITE">מבקרי אתר (פיקסל)</option>
            <option value="ENGAGEMENT">מעורבות עם העמוד</option>
            <option value="LOOKALIKE">Lookalike (קהל דומה)</option>
          </Select>
        </div>
        {form.subtype === "LOOKALIKE" && (
          <>
            <div>
              <Label>קהל מקור</Label>
              <Select value={form.originAudienceId} onChange={(e) => set("originAudienceId", e.target.value)}>
                <option value="">בחר קהל מקור…</option>
                {nonLookalike.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>גודל (% מהאוכלוסייה) — {form.ratio}%</Label>
              <input
                type="range"
                min={1}
                max={10}
                value={form.ratio}
                onChange={(e) => set("ratio", Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-400">1% = דומה מאוד, קטן · 10% = רחב יותר</div>
            </div>
          </>
        )}
        <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          💡 יצירת הקהל היא פעולת כתיבה ל-Meta ותירשם ב-Audit Log. הקהל אינו מוציא תקציב עד שיחובר לקמפיין.
        </div>
        <div className="flex justify-start gap-2">
          <Button onClick={submit} loading={busy} disabled={form.name.length < 2}>
            צור קהל
          </Button>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
        </div>
      </div>
    </Modal>
  );
}
