"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, EmptyState } from "@/components/ui";

export function ResearchPanel({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await api.runResearch(clientId);
      setData(res);
      toast(`נמצאו ${res.competitorAds?.length ?? 0} מודעות מתחרים`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "המחקר נכשל", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">מחקר מתחרים מבוסס Meta Ad Library + ניתוח AI</div>
        <Button onClick={run} loading={busy}>
          ✨ הרץ מחקר מתחרים
        </Button>
      </div>

      {!data ? (
        <EmptyState
          title="מחקר מתחרים"
          description="סוכן המחקר יאסוף מודעות אמיתיות של מתחרים מ-Meta Ad Library, ינתח את הזוויות וההבטחות שלהם, ויציע הזדמנויות בידול."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h3 className="mb-2 font-semibold text-slate-900">סיכום שוק</h3>
              <p className="text-sm text-slate-700">{data.marketSummary}</p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InsightList title="תובנות על המתחרים" items={data.competitorInsights} icon="🔍" />
            <InsightList title="הזדמנויות בידול" items={data.opportunities} icon="💡" accent />
          </div>

          <Card>
            <CardBody>
              <h3 className="mb-2 font-semibold text-slate-900">זוויות מומלצות</h3>
              <div className="flex flex-wrap gap-2">
                {(data.recommendedAngles ?? []).map((a: string, i: number) => (
                  <span key={i} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                    {a}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>

          {data.competitorAds?.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold text-slate-900">מודעות מתחרים שנמצאו ({data.competitorAds.length})</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.competitorAds.map((ad: any, i: number) => (
                  <Card key={i}>
                    <CardBody>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">{ad.pageName}</span>
                        {ad.snapshotUrl && (
                          <a href={ad.snapshotUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline" dir="ltr">
                            צפה במקור ↗
                          </a>
                        )}
                      </div>
                      {ad.title && <div className="text-sm font-medium text-slate-700" dir="auto">{ad.title}</div>}
                      <p className="mt-1 text-sm text-slate-600" dir="auto">
                        {ad.body}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InsightList({ title, items, icon, accent }: { title: string; items: string[]; icon: string; accent?: boolean }) {
  return (
    <Card>
      <CardBody>
        <h3 className="mb-2 font-semibold text-slate-900">{title}</h3>
        <ul className="space-y-1.5 text-sm text-slate-700">
          {(items ?? []).map((x, i) => (
            <li key={i} className="flex gap-2">
              <span>{icon}</span>
              <span className={accent ? "text-brand-700" : ""}>{x}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
