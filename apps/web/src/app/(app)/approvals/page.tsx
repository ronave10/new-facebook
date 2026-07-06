"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { APPROVAL_ACTION_LABELS_HE } from "@campaignos/shared";
import { Button, Card, CardBody, EmptyState, Modal, PageHeader, Spinner } from "@/components/ui";
import { ApprovalStatusBadge } from "@/components/StatusBadge";
import { PayloadPreview } from "@/components/campaigns/PayloadPreview";
import { formatDateTime } from "@/lib/format";

export default function ApprovalsPage() {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { data, loading, reload } = useApi(() => api.approvals("PENDING"), []);
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const canApprove = hasPermission("campaign.approve");

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      approve ? await api.approve(id) : await api.reject(id);
      toast(approve ? "אושר" : "נדחה", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "פעולה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  const approvals = data ?? [];

  return (
    <div>
      <PageHeader title="אישורים" subtitle="בקשות אישור לפרסום קמפיינים" />
      {loading ? (
        <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />
      ) : approvals.length === 0 ? (
        <EmptyState title="אין בקשות אישור ממתינות" description="כשקמפיין יישלח לאישור, הוא יופיע כאן." />
      ) : (
        <div className="space-y-3">
          {approvals.map((a: any) => (
            <Card key={a.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{a.entityName ?? a.entityId}</div>
                  <div className="text-sm text-slate-500">
                    {APPROVAL_ACTION_LABELS_HE[a.action as never]} · ביקש: {a.requestedByName ?? "—"} · {formatDateTime(a.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ApprovalStatusBadge status={a.status} />
                  <Button variant="secondary" onClick={() => setPreview(a)}>
                    צפה במה יישלח
                  </Button>
                  {canApprove && (
                    <>
                      <Button onClick={() => decide(a.id, true)} loading={busy}>
                        אשר
                      </Button>
                      <Button variant="danger" onClick={() => decide(a.id, false)} loading={busy}>
                        דחה
                      </Button>
                    </>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title="תצוגה מקדימה — מה יישלח ל-Meta" maxWidth="max-w-3xl">
        {preview && <PayloadPreview steps={preview.payloadPreview} />}
      </Modal>
    </div>
  );
}
