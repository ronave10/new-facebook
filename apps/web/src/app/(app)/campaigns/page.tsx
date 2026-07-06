"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPAIGN_GOAL_LABELS_HE, CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS_HE } from "@campaignos/shared";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatCurrency } from "@/lib/format";
import { Button, Card, EmptyState, PageHeader, Select, Spinner } from "@/components/ui";
import { CampaignStatusBadge } from "@/components/StatusBadge";

export default function CampaignsPage() {
  const [status, setStatus] = useState("");
  const { data, loading } = useApi(() => api.campaigns(undefined, status || undefined), [status]);
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title="קמפיינים" subtitle="כל הקמפיינים בכל הלקוחות" />

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CAMPAIGN_STATUS_LABELS_HE[s]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />
      ) : items.length === 0 ? (
        <EmptyState title="אין קמפיינים" description="צרו קמפיין דרך עמוד הלקוח." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-start font-medium">שם</th>
                <th className="px-5 py-3 text-start font-medium">לקוח</th>
                <th className="px-5 py-3 text-start font-medium">מטרה</th>
                <th className="px-5 py-3 text-start font-medium">תקציב</th>
                <th className="px-5 py-3 text-start font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{c.clientName}</td>
                  <td className="px-5 py-3 text-slate-600">{CAMPAIGN_GOAL_LABELS_HE[c.goal as never]}</td>
                  <td className="px-5 py-3 tabular text-slate-600">{formatCurrency(c.budgetAmount, c.currency)}/יום</td>
                  <td className="px-5 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
