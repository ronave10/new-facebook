"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatNumber } from "@/lib/format";
import { Button, Card, EmptyState, Input, PageHeader, Spinner } from "@/components/ui";
import { ClientStatusBadge } from "@/components/StatusBadge";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const { data, loading } = useApi(() => api.clients(1, search || undefined), [search]);
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="לקוחות"
        subtitle="ניהול תיקי הלקוחות של הסוכנות"
        actions={
          <Link href="/clients/new">
            <Button>+ לקוח חדש</Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-xs">
        <Input placeholder="חיפוש לקוח…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-brand-600">
          <Spinner className="h-7 w-7" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="אין לקוחות עדיין"
          description="צרו את הלקוח הראשון כדי להתחיל לבנות פרופיל, פרסונות וקמפיינים."
          action={
            <Link href="/clients/new">
              <Button>צור לקוח</Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-start font-medium">שם</th>
                <th className="px-5 py-3 text-start font-medium">תחום</th>
                <th className="px-5 py-3 text-start font-medium">סטטוס</th>
                <th className="px-5 py-3 text-start font-medium">Meta</th>
                <th className="px-5 py-3 text-start font-medium">קמפיינים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{c.industry ?? "—"}</td>
                  <td className="px-5 py-3">
                    <ClientStatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3">
                    <span className={c.metaConnected ? "text-green-600" : "text-slate-400"}>
                      {c.metaConnected ? "מחובר" : "לא מחובר"}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular text-slate-600">{formatNumber(c.campaignCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
