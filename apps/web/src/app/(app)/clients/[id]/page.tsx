"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, ConfirmDialog, EmptyState, PageHeader, Spinner, Tabs } from "@/components/ui";
import { ClientStatusBadge, MetaStatusBadge, CampaignStatusBadge } from "@/components/StatusBadge";
import { MediaLibrary } from "@/components/clients/MediaLibrary";
import { LeadsInbox } from "@/components/clients/LeadsInbox";
import { formatNumber } from "@/lib/format";

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "overview");
  const { data: client, loading, reload } = useApi(() => api.client(id), [id]);

  if (loading || !client) {
    return (
      <div className="flex justify-center py-20 text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={client.industry ?? undefined}
        actions={<ClientStatusBadge status={client.status} />}
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "סקירה" },
          { key: "brand", label: "פרופיל מותג" },
          { key: "personas", label: "פרסונות" },
          { key: "media", label: "מדיה" },
          { key: "leads", label: "לידים" },
          { key: "meta", label: "חיבור Meta" },
          { key: "campaigns", label: "קמפיינים" },
        ]}
      />

      {tab === "overview" && <OverviewTab client={client} />}
      {tab === "brand" && <BrandTab client={client} onSaved={reload} />}
      {tab === "personas" && <PersonasTab clientId={id} />}
      {tab === "media" && <MediaLibrary clientId={id} />}
      {tab === "leads" && <LeadsInbox clientId={id} />}
      {tab === "meta" && <MetaTab clientId={id} />}
      {tab === "campaigns" && <CampaignsTab clientId={id} />}
    </div>
  );
}

function OverviewTab({ client }: { client: any }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900">פרטי עסק</h3>
          <dl className="space-y-2 text-sm">
            <Row label="אתר" value={client.website ?? "—"} ltr />
            <Row label="אזור" value={client.activityArea ?? "—"} />
            <Row label="מטבע" value={client.currency} />
            <Row label="מדינה" value={client.country} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900">סטטיסטיקה</h3>
          <dl className="space-y-2 text-sm">
            <Row label="קמפיינים" value={formatNumber(client.campaignCount)} />
            <Row label="פרסונות" value={formatNumber(client.personaCount)} />
            <Row label="Meta" value={client.metaConnected ? "מחובר" : "לא מחובר"} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900">פעולות מהירות</h3>
          <div className="flex flex-col gap-2">
            <Link href={`/campaigns/new?clientId=${client.id}`}>
              <Button className="w-full">+ קמפיין חדש</Button>
            </Link>
            <Link href={`/analytics?clientId=${client.id}`}>
              <Button variant="secondary" className="w-full">
                צפייה באנליטיקס
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${ltr ? "truncate" : ""}`} dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function BrandTab({ client, onSaved }: { client: any; onSaved: () => void }) {
  const bp = client.brandProfile;
  if (!bp) return <EmptyState title="אין פרופיל מותג" description="ניתן לערוך את הפרופיל דרך אשף הלקוח." />;
  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h3 className="mb-3 font-semibold text-slate-900">פרופיל מותג</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-sm">
            <div>
              <div className="text-slate-500">מוצר מרכזי</div>
              <div className="text-slate-800">{bp.mainProduct ?? "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">טווח מחיר</div>
              <div className="text-slate-800">{bp.priceRange ?? "—"}</div>
            </div>
            <ListBlock title="יתרונות" items={bp.keyBenefits} />
            <ListBlock title="כאבי לקוח" items={bp.customerPains} />
            <ListBlock title="התנגדויות" items={bp.commonObjections} />
            <div>
              <div className="text-slate-500">בידול</div>
              <div className="text-slate-800">{bp.differentiation ?? "—"}</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: unknown }) {
  const arr = Array.isArray(items) ? (items as string[]) : [];
  return (
    <div>
      <div className="text-slate-500">{title}</div>
      {arr.length ? (
        <ul className="list-inside list-disc text-slate-800">
          {arr.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <div className="text-slate-400">—</div>
      )}
    </div>
  );
}

function PersonasTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { data, loading, reload } = useApi(() => api.personas(clientId), [clientId]);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      await api.generatePersonas(clientId, 3);
      toast("פרסונות נוצרו בהצלחה!", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירת פרסונות נכשלה", "error");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;
  const personas = data ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={generate} loading={generating}>
          ✨ צור פרסונות עם AI
        </Button>
      </div>
      {personas.length === 0 ? (
        <EmptyState title="אין פרסונות עדיין" description="לחצו על ״צור פרסונות עם AI״ כדי לייצר 3 אווטארים על בסיס פרופיל המותג." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {personas.map((p: any) => (
            <Card key={p.id}>
              <CardBody>
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">{p.ageRange} · {p.lifeSituation}</div>
                <PersonaList title="כאבים" items={p.pains} />
                <PersonaList title="רצונות" items={p.desires} />
                <PersonaList title="זוויות קמפיין" items={p.campaignAngles} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaList({ title, items }: { title: string; items: unknown }) {
  const arr = Array.isArray(items) ? (items as string[]) : [];
  if (!arr.length) return null;
  return (
    <div className="mt-2">
      <div className="text-xs font-medium text-slate-400">{title}</div>
      <ul className="list-inside list-disc text-sm text-slate-700">
        {arr.slice(0, 3).map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function MetaTab({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { data, loading, reload } = useApi(() => api.metaConnections(clientId), [clientId]);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      const res = await api.metaConnectStart(clientId);
      if (res.mode === "oauth" && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        toast("חשבון Meta חובר (מצב דמו)", "success");
        reload();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "חיבור נכשל", "error");
    } finally {
      setBusy(false);
    }
  }

  async function selectAccount(adAccountId: string) {
    try {
      await api.metaSelectAdAccount(adAccountId, clientId);
      toast("חשבון המודעות נבחר", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "בחירה נכשלה", "error");
    }
  }

  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;
  const connections = data ?? [];

  return (
    <div className="space-y-4">
      {connections.length === 0 ? (
        <Card>
          <CardBody className="text-center">
            <p className="mb-4 text-sm text-slate-600">חברו את חשבון ה-Meta Ads של הלקוח כדי למשוך נתונים ולפרסם קמפיינים.</p>
            <Button onClick={connect} loading={busy} className="bg-[#1877F2] hover:bg-[#1568d8]">
              חבר חשבון Meta Ads
            </Button>
          </CardBody>
        </Card>
      ) : (
        connections.map((conn: any) => (
          <Card key={conn.id}>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{conn.metaUserName ?? "חשבון Meta"}</div>
                  <div className="text-xs text-slate-500">{conn.scopes.join(", ")}</div>
                </div>
                <MetaStatusBadge status={conn.status} />
              </div>
              <div className="text-sm font-medium text-slate-700">חשבונות מודעות</div>
              <div className="mt-2 space-y-2">
                {conn.adAccounts.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{a.name}</div>
                      <div className="text-xs text-slate-400" dir="ltr">
                        act_{a.accountId} · {a.currency}
                      </div>
                    </div>
                    {a.isSelected ? (
                      <span className="text-xs font-semibold text-green-600">✓ נבחר</span>
                    ) : (
                      <Button variant="secondary" onClick={() => selectAccount(a.id)}>
                        בחר
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {conn.pages.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                  עמודים: {conn.pages.map((p: any) => p.name).join(", ")}
                </div>
              )}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function CampaignsTab({ clientId }: { clientId: string }) {
  const { data, loading } = useApi(() => api.campaigns(clientId), [clientId]);
  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;
  const items = data?.items ?? [];
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Link href={`/campaigns/new?clientId=${clientId}`}>
          <Button>+ קמפיין חדש</Button>
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState title="אין קמפיינים" description="צרו קמפיין ראשון ללקוח זה." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-start font-medium">שם</th>
                <th className="px-5 py-3 text-start font-medium">סטטוס</th>
                <th className="px-5 py-3 text-start font-medium">מודעות</th>
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
                  <td className="px-5 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3 tabular text-slate-600">{c.adCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
