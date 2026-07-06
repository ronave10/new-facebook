"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi(() => api.auditLogs(page), [page]);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 30;

  return (
    <div>
      <PageHeader title="פעילות" subtitle="יומן פעולות רגישות במערכת" />
      {loading ? (
        <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />
      ) : items.length === 0 ? (
        <EmptyState title="אין פעילות" description="פעולות רגישות יירשמו כאן." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-start font-medium">זמן</th>
                <th className="px-5 py-3 text-start font-medium">פעולה</th>
                <th className="px-5 py-3 text-start font-medium">ישות</th>
                <th className="px-5 py-3 text-start font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">{formatDateTime(l.createdAt)}</td>
                  <td className="px-5 py-3">
                    <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                      {l.action}
                    </code>
                  </td>
                  <td className="px-5 py-3 text-slate-500" dir="ltr">
                    {l.entityType ? `${l.entityType}:${(l.entityId ?? "").slice(0, 8)}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-400" dir="ltr">
                    {l.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            הקודם
          </Button>
          <span className="text-sm text-slate-500">
            עמוד {page} מתוך {Math.ceil(total / pageSize)}
          </span>
          <Button variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total}>
            הבא
          </Button>
        </div>
      )}
    </div>
  );
}
