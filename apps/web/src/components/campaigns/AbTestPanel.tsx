"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardBody, EmptyState, Select, Spinner } from "@/components/ui";

/**
 * A/B significance panel: shows the two compared variants, their conversion rates
 * with Wilson confidence intervals, a two-proportion z-test verdict, a
 * days-to-significance projection, and a picker to compare any two variants.
 */
export function AbTestPanel({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .campaignAbTest(campaignId, a || undefined, b || undefined)
      .then((res) => {
        if (!alive) return;
        setData(res);
        // seed the selectors with the compared pair on first load
        if (res?.available && !a && !b) {
          setA(res.variant?.id ?? "");
          setB(res.control?.id ?? "");
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, a, b]);

  if (loading && !data) return <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />;
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
  const roster: { id: string; label: string }[] = data.roster ?? [];

  return (
    <div className="space-y-4">
      {roster.length > 2 && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs text-slate-500">וריאציה A</label>
              <Select value={a} onChange={(e) => setA(e.target.value)}>
                {roster.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === b}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="pb-2 text-slate-400">מול</div>
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs text-slate-500">וריאציה B</label>
              <Select value={b} onChange={(e) => setB(e.target.value)}>
                {roster.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === a}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          </CardBody>
        </Card>
      )}

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
          <span dir="ltr" title="רווח סמך 95% להפרש המוחלט בין הוריאציות">
            ΔCI₉₅ = <b className="tabular">[{(data.diffCiLower * 100).toFixed(2)}, {(data.diffCiUpper * 100).toFixed(2)}]</b> pp
          </span>
          {data.projectedDaysToSignificance != null && data.projectedDaysToSignificance > 0 && (
            <span>
              עד הכרעה: <b className="tabular">~{data.projectedDaysToSignificance} ימים</b>
            </span>
          )}
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
              <div className="mt-0.5 text-xs text-slate-400 tabular" dir="ltr" title="רווח סמך Wilson 95%">
                CI₉₅ {pct(v.ciLower)} – {pct(v.ciUpper)}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular">
                {v.successes.toLocaleString()} / {v.trials.toLocaleString()}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        מבחן z לשתי פרופורציות ברמת {data.level === "AD" ? "מודעה" : "קבוצת מודעות"}, רווחי סמך בשיטת Wilson. מובהקות ב-95% · נצפו {data.daysObserved} ימים · {data.variantCount} וריאציות.
      </p>
    </div>
  );
}
