"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatCurrency, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { Button, Card, CardBody, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui";
import { ClientStatusBadge } from "@/components/StatusBadge";

export default function DashboardPage() {
  const { data: clients, loading } = useApi(() => api.clients(1), []);
  const items = clients?.items ?? [];
  const firstClientId = items[0]?.id;
  const { data: overview } = useApi(
    () => (firstClientId ? api.analytics(firstClientId) : Promise.resolve(null)),
    [firstClientId],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="לוח בקרה"
        subtitle="סקירת פעילות הסוכנות"
        actions={
          <Link href="/clients/new">
            <Button>+ לקוח חדש</Button>
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="ברוכים הבאים ל-CampaignOS AI"
          description="כדי להתחיל, צרו את הלקוח הראשון שלכם, מלאו פרופיל מותג, וייצרו פרסונות וקמפיינים בעזרת AI."
          action={
            <Link href="/clients/new">
              <Button>צור לקוח ראשון</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="סה״כ הוצאה (30 ימים)"
              value={overview ? formatCurrency(overview.totalSpend * 100, overview.currency) : "—"}
            />
            <StatCard label="לידים" value={overview ? formatNumber(overview.totalLeads) : "—"} accent="green" />
            <StatCard label="CPL ממוצע" value={overview ? formatMoney(overview.avgCpl, overview.currency) : "—"} />
            <StatCard label="קמפיינים פעילים" value={overview ? formatNumber(overview.activeCampaigns) : "0"} />
          </div>

          {overview && overview.actionList.length > 0 && (
            <Card className="mb-6">
              <CardBody>
                <h2 className="mb-3 text-lg font-semibold text-slate-900">מה לעשות עכשיו</h2>
                <ul className="space-y-2">
                  {overview.actionList.slice(0, 5).map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      {a.title}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <h2 className="mb-3 text-lg font-semibold text-slate-900">הלקוחות שלי</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((c: any) => (
              <Link key={c.id} href={`/clients/${c.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-sm text-slate-500">{c.industry ?? "—"}</div>
                      </div>
                      <ClientStatusBadge status={c.status} />
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      <span>{formatNumber(c.campaignCount)} קמפיינים</span>
                      <span className={c.metaConnected ? "text-green-600" : "text-slate-400"}>
                        {c.metaConnected ? "● Meta מחובר" : "○ Meta לא מחובר"}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
