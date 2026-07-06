"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RECOMMENDATION_TYPE_LABELS_HE } from "@campaignos/shared";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { SeverityBadge } from "@/components/StatusBadge";

function RecommendationsInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: clientsData } = useApi(() => api.clients(1), []);
  const clients = clientsData?.items ?? [];
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pre = params.get("clientId");
    if (pre) setClientId(pre);
    else if (clients.length && !clientId) setClientId(clients[0].id);
  }, [clients, params]); // eslint-disable-line

  const { data, loading, reload } = useApi(
    () => (clientId ? api.recommendations(clientId) : Promise.resolve([])),
    [clientId],
  );

  async function generate() {
    setBusy(true);
    try {
      await api.generateRecommendations(clientId);
      toast("המלצות נוצרו", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: string) {
    try {
      await api.decideRecommendation(id, decision);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "פעולה נכשלה", "error");
    }
  }

  const recs = (data ?? []).slice().sort((a: any, b: any) => sev(b.severity) - sev(a.severity));

  return (
    <div>
      <PageHeader
        title="מה לעשות עכשיו"
        subtitle="המלצות אופטימיזציה מבוססות AI"
        actions={
          <div className="flex gap-2">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="max-w-[180px]">
              <option value="">בחר לקוח</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button onClick={generate} loading={busy} disabled={!clientId}>
              ✨ צור המלצות
            </Button>
          </div>
        }
      />

      {loading ? (
        <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />
      ) : recs.length === 0 ? (
        <EmptyState title="אין המלצות" description="ייצרו המלצות אופטימיזציה על בסיס ביצועי הקמפיינים." />
      ) : (
        <div className="space-y-3">
          {recs.map((r: any) => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={r.severity} />
                      <span className="text-xs text-slate-400">{RECOMMENDATION_TYPE_LABELS_HE[r.type as never]}</span>
                    </div>
                    <div className="mt-1.5 font-semibold text-slate-900">{r.title}</div>
                    <p className="mt-1 text-sm text-slate-600">{r.body}</p>
                  </div>
                  {r.status === "NEW" && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="secondary" onClick={() => decide(r.id, "APPLIED")}>
                        בוצע
                      </Button>
                      <Button variant="ghost" onClick={() => decide(r.id, "DISMISSED")}>
                        התעלם
                      </Button>
                    </div>
                  )}
                  {r.status !== "NEW" && <span className="text-xs text-slate-400">{r.status}</span>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function sev(s: string): number {
  return { CRITICAL: 3, WARNING: 2, SUGGESTION: 1, INFO: 0 }[s] ?? 0;
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<Spinner className="mx-auto my-20 h-8 w-8 text-brand-600" />}>
      <RecommendationsInner />
    </Suspense>
  );
}
