"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatCurrency, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardBody, EmptyState, PageHeader, Select, Spinner, StatCard, Tabs } from "@/components/ui";
import { SpendChart } from "@/components/insights/SpendChart";
import { AccountAudit } from "@/components/insights/AccountAudit";

function AnalyticsInner() {
  const params = useSearchParams();
  const { data: clientsData } = useApi(() => api.clients(1), []);
  const clients = clientsData?.items ?? [];
  const [clientId, setClientId] = useState<string>("");
  const [preset, setPreset] = useState("last_30d");
  const [view, setView] = useState("performance");

  useEffect(() => {
    const pre = params.get("clientId");
    if (pre) setClientId(pre);
    else if (clients.length && !clientId) setClientId(clients[0].id);
  }, [clients, params]); // eslint-disable-line

  const { data: overview, loading } = useApi(
    () => (clientId ? api.analytics(clientId, preset) : Promise.resolve(null)),
    [clientId, preset],
  );
  const { data: campaigns } = useApi(() => (clientId ? api.campaigns(clientId) : Promise.resolve(null)), [clientId]);
  const topCampaign = campaigns?.items?.[0];
  const { data: series } = useApi(
    () => (topCampaign ? api.timeseries(topCampaign.id) : Promise.resolve([])),
    [topCampaign?.id],
  );

  return (
    <div>
      <PageHeader
        title="אנליטיקס"
        subtitle="ביצועי הקמפיינים של הלקוח"
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
            <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="max-w-[130px]">
              <option value="last_7d">7 ימים</option>
              <option value="last_14d">14 ימים</option>
              <option value="last_30d">30 ימים</option>
            </Select>
          </div>
        }
      />

      {!clientId ? (
        <EmptyState title="בחרו לקוח" description="בחרו לקוח מהרשימה כדי לצפות בנתוני הביצועים." />
      ) : (
        <>
          <Tabs
            active={view}
            onChange={setView}
            tabs={[
              { key: "performance", label: "ביצועים" },
              { key: "audit", label: "בריאות החשבון" },
            ]}
          />

          {view === "audit" ? (
            <AccountAudit clientId={clientId} />
          ) : loading ? (
            <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />
          ) : !overview ? (
            <EmptyState title="אין נתונים" description="ודאו שהלקוח מחובר ל-Meta ושבוצע סנכרון." />
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <StatCard label="הוצאה" value={formatCurrency(overview.totalSpend * 100, overview.currency)} />
                <StatCard label="לידים" value={formatNumber(overview.totalLeads)} accent="green" />
                <StatCard label="CPL" value={formatMoney(overview.avgCpl, overview.currency)} />
                <StatCard label="CTR" value={formatPercent(overview.avgCtr)} />
                <StatCard label="CPC" value={formatMoney(overview.avgCpc, overview.currency)} />
                <StatCard label="קליקים" value={formatNumber(overview.totalClicks)} />
              </div>

              <Card className="mb-6">
                <CardBody>
                  <h3 className="mb-4 font-semibold text-slate-900">מגמת הוצאה ולידים</h3>
                  <SpendChart data={(series ?? []).map((r: any) => ({ date: r.date, spend: r.spend, leads: r.leads }))} />
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RankCard title="קמפיינים מובילים" items={overview.bestCampaigns} currency={overview.currency} good />
                <RankCard title="קמפיינים חלשים" items={overview.worstCampaigns} currency={overview.currency} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RankCard({ title, items, currency, good }: { title: string; items: any[]; currency: string; good?: boolean }) {
  return (
    <Card>
      <CardBody>
        <h3 className="mb-3 font-semibold text-slate-900">{title}</h3>
        {items.length === 0 ? (
          <div className="text-sm text-slate-400">אין נתונים</div>
        ) : (
          <ul className="space-y-2">
            {items.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{c.name}</span>
                <span className={`tabular font-medium ${good ? "text-green-600" : "text-red-600"}`}>
                  {c.metric} {formatMoney(c.value, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Spinner className="mx-auto my-20 h-8 w-8 text-brand-600" />}>
      <AnalyticsInner />
    </Suspense>
  );
}
