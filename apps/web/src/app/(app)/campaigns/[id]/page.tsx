"use client";

import { use, useState } from "react";
import { CAMPAIGN_GOAL_LABELS_HE } from "@campaignos/shared";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, ConfirmDialog, EmptyState, PageHeader, Spinner, Tabs } from "@/components/ui";
import { CampaignStatusBadge, ApprovalStatusBadge } from "@/components/StatusBadge";
import { AdPreviewCard } from "@/components/campaigns/AdPreviewCard";
import { PayloadPreview } from "@/components/campaigns/PayloadPreview";
import { AbTestPanel } from "@/components/campaigns/AbTestPanel";
import { AbTestManager } from "@/components/campaigns/AbTestManager";
import { formatCurrency } from "@/lib/format";

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState("details");
  const { data: campaign, loading, reload } = useApi(() => api.campaign(id), [id]);

  if (loading || !campaign) {
    return <Spinner className="mx-auto my-20 h-8 w-8 text-brand-600" />;
  }

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.client?.name} · ${CAMPAIGN_GOAL_LABELS_HE[campaign.goal as never]}`}
        actions={<CampaignStatusBadge status={campaign.status} />}
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "פרטים" },
          { key: "strategy", label: "אסטרטגיה" },
          { key: "ads", label: "מודעות" },
          { key: "abtest", label: "A/B" },
          { key: "review", label: "אישור ופרסום" },
        ]}
      />
      {tab === "details" && <DetailsTab campaign={campaign} />}
      {tab === "strategy" && <StrategyTab campaign={campaign} onDone={reload} />}
      {tab === "ads" && <AdsTab campaign={campaign} onDone={reload} />}
      {tab === "abtest" && (
        <div className="space-y-8">
          <AbTestManager campaign={campaign} />
          <div className="border-t border-slate-200 pt-6">
            <h3 className="mb-1 font-semibold text-slate-900">ניתוח מהיר</h3>
            <p className="mb-4 text-xs text-slate-500">מובהקות סטטיסטית על סמך נתוני הביצועים שנמשכו — ללא הרצת מבחן ייעודי.</p>
            <AbTestPanel campaignId={campaign.id} />
          </div>
        </div>
      )}
      {tab === "review" && <ReviewTab campaign={campaign} onDone={reload} />}
    </div>
  );
}

function DetailsTab({ campaign }: { campaign: any }) {
  return (
    <Card>
      <CardBody>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">מטרה</dt>
            <dd className="font-medium text-slate-800">{CAMPAIGN_GOAL_LABELS_HE[campaign.goal as never]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Meta Objective</dt>
            <dd className="font-medium text-slate-800" dir="ltr">
              {campaign.metaObjective}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">תקציב</dt>
            <dd className="font-medium text-slate-800">
              {formatCurrency(campaign.budgetAmount, campaign.currency)} / {campaign.budgetType === "DAILY" ? "יום" : "כולל"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">מזהה Meta</dt>
            <dd className="font-medium text-slate-800" dir="ltr">
              {campaign.metaCampaignId ?? "—"}
            </dd>
          </div>
        </dl>
        {campaign.lastError && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">שגיאה אחרונה: {campaign.lastError}</div>
        )}
      </CardBody>
    </Card>
  );
}

function StrategyTab({ campaign, onDone }: { campaign: any; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const strategy = campaign.strategy;

  async function generate() {
    setBusy(true);
    try {
      await api.generateStrategy(campaign.id);
      toast("אסטרטגיה נוצרה", "success");
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={generate} loading={busy}>
          ✨ {strategy ? "צור מחדש" : "צור אסטרטגיה עם AI"}
        </Button>
      </div>
      {!strategy ? (
        <EmptyState title="אין אסטרטגיה" description="ייצרו אסטרטגיית קמפיין חכמה על בסיס פרופיל הלקוח והתקציב." />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h3 className="mb-2 font-semibold text-slate-900">סיכום</h3>
              <p className="text-sm text-slate-700">{strategy.summary}</p>
            </CardBody>
          </Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardBody>
                <h3 className="mb-3 font-semibold text-slate-900">חלוקת תקציב</h3>
                {(strategy.budgetSplit as any[])?.map((b, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">{b.name}</span>
                      <span className="tabular font-medium">{b.sharePct}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-brand-500" style={{ width: `${b.sharePct}%` }} />
                    </div>
                    <div className="text-xs text-slate-400">{b.rationale}</div>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h3 className="mb-3 font-semibold text-slate-900">חוקי אופטימיזציה</h3>
                <RuleList title="מתי לכבות" items={(strategy.rules as any)?.killRules} />
                <RuleList title="מתי להגדיל" items={(strategy.rules as any)?.scaleRules} />
                <RuleList title="מתי לרענן" items={(strategy.rules as any)?.refreshRules} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-400">{title}</div>
      <ul className="list-inside list-disc text-sm text-slate-700">
        {items.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function AdsTab({ campaign, onDone }: { campaign: any; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const adSets = campaign.adSets ?? [];
  const allAds = adSets.flatMap((as: any) => as.ads);

  async function generate() {
    setBusy(true);
    try {
      await api.generateAds(campaign.id, [], 6);
      toast("מודעות נוצרו בהצלחה", "success");
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={generate} loading={busy}>
          ✨ {allAds.length ? "צור מודעות נוספות" : "צור מודעות עם AI"}
        </Button>
      </div>
      {allAds.length === 0 ? (
        <EmptyState title="אין מודעות" description="ייצרו זוויות, קופי ומודעות מלאות לכל פרסונה בעזרת AI." />
      ) : (
        <div className="space-y-6">
          {adSets.map((as: any) => (
            <div key={as.id}>
              <h3 className="mb-3 font-semibold text-slate-800">{as.name}</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {as.ads.map((ad: any) => (
                  <AdPreviewCard key={ad.id} ad={ad} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewTab({ campaign, onDone }: { campaign: any; onDone: () => void }) {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const approvals = campaign.approvals ?? [];
  const latest = approvals[0];
  const canApprove = hasPermission("campaign.approve");
  const canPublish = hasPermission("campaign.publish");

  async function act(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast(successMsg, "success");
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הפעולה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">מצב הקמפיין</h3>
              <p className="text-sm text-slate-500">
                תקציב יומי {formatCurrency(campaign.budgetAmount, campaign.currency)} ≈{" "}
                {formatCurrency((campaign.budgetAmount ?? 0) * 30, campaign.currency)} לחודש
              </p>
            </div>
            <CampaignStatusBadge status={campaign.status} />
          </div>

          <div className="flex flex-wrap gap-2">
            {(campaign.status === "DRAFT" || campaign.status === "ERROR") && (
              <Button onClick={() => act(() => api.requestApproval(campaign.id), "נשלח לאישור")} loading={busy}>
                שלח לאישור
              </Button>
            )}
            {campaign.status === "PENDING_APPROVAL" && latest && canApprove && (
              <>
                <Button onClick={() => act(() => api.approve(latest.id), "הקמפיין אושר")} loading={busy}>
                  אשר
                </Button>
                <Button variant="danger" onClick={() => act(() => api.reject(latest.id), "הקמפיין נדחה")} loading={busy}>
                  דחה
                </Button>
              </>
            )}
            {campaign.status === "APPROVED" && canPublish && (
              <Button onClick={() => setConfirmPublish(true)} loading={busy}>
                🚀 פרסם עכשיו
              </Button>
            )}
            {campaign.status === "PUBLISHED" && canPublish && (
              <Button variant="secondary" onClick={() => act(() => api.pauseCampaign(campaign.id), "הקמפיין הושהה")} loading={busy}>
                השהה קמפיין
              </Button>
            )}
          </div>

          {campaign.status === "PENDING_APPROVAL" && !canApprove && (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              הקמפיין ממתין לאישור מנהל. אין לך הרשאת אישור.
            </div>
          )}
          {campaign.status === "PUBLISHED" && (
            <div className="mt-3 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
              ✓ הקמפיין פורסם ב-Meta (מזהה <span dir="ltr">{campaign.metaCampaignId}</span>)
            </div>
          )}
        </CardBody>
      </Card>

      {latest && (
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">מה יישלח ל-Meta</h3>
              <ApprovalStatusBadge status={latest.status} />
            </div>
            <PayloadPreview steps={latest.payloadPreview as any[]} />
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => {
          setConfirmPublish(false);
          act(() => api.publish(campaign.id), "הקמפיין פורסם!");
        }}
        title="פרסום קמפיין חי"
        message="פעולה זו תיצור את הקמפיין ב-Meta ותפעיל אותו. התקציב יתחיל להתבזבז. יש להקליד ״אישור״ כדי להמשיך."
        confirmLabel="פרסם עכשיו"
        destructive
        requireKeyword="אישור"
      />
    </div>
  );
}
