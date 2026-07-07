"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, CardBody, EmptyState, Spinner } from "@/components/ui";

/**
 * A/B significance panel: shows the two highest-traffic variants in the campaign,
 * their conversion rates, and a two-proportion z-test verdict from marketing-core.
 */
export function AbTestPanel({ campaignId }: { campaignId: string }) {
  const { data, loading } = useApi(() => api.campaignAbTest(campaignId), [campaignId]);

  if (loading) return <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />;
  if (!data || data.available === false) {
    return (
      <EmptyState
        title="בדיקת A/B"
        description={data?.message ?? "אין עדיין מספיק וריאציות עם דאטה להשוואה. הרץ את הקמפיין וסנכרן נתונים."}
      />
    );
  }

  const winnerId = data.winnerId as string | null;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-5 ${
          data.isSignificant ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">
            {data.isSignificant ? "✅ יש מנצח מובהק" : data.sufficientSample ? "⏳ אין הבדל מובהק עדיין" : "⏳ אוסף דאטה"}
          </div>
          <div className="text-xs text-slate-500">מדד: {data.metric}</div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-700">
          <span>
            ביטחון: <b className="tabular">{data.confidencePct?.toFixed(1)}%</b>
          </span>
          <span dir="ltr">
            p = <b className="tabular">{data.pValue}</b>
          </span>
          <span>
            שיפור יחסי: <b className="tabular">{data.relativeLiftPct?.toFixed(0)}%</b>
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">{data.recommendation}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[data.variant, data.control].map((v: any) => (
          <Card key={v.id} className={winnerId === v.id ? "ring-2 ring-emerald-400" : ""}>
            <CardBody>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-900" dir="auto">
                  {v.label}
                </span>
                {winnerId === v.id && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    מנצח 🏆
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-brand-700 tabular">{pct(v.rate)}</div>
              <div className="mt-1 text-xs text-slate-500 tabular">
                {v.successes.toLocaleString()} / {v.trials.toLocaleString()}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        מבחן z לשתי פרופורציות ברמת {data.level === "AD" ? "מודעה" : "קבוצת מודעות"}. מובהקות ב-95% ({data.variantCount} וריאציות נבחנו).
      </p>
    </div>
  );
}
