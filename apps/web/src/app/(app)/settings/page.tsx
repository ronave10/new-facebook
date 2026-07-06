"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { ROLE_LABELS_HE } from "@campaignos/shared";
import { Button, Card, CardBody, Input, Label, PageHeader, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const { toast } = useToast();
  const { session, hasPermission } = useAuth();
  const { data: org, loading } = useApi(() => api.getOrg(), []);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = hasPermission("org.manage");

  useEffect(() => {
    if (org) setName(org.name);
  }, [org]);

  async function save() {
    setSaving(true);
    try {
      await api.updateOrg(name);
      toast("נשמר", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "שמירה נכשלה", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !org) return <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="הגדרות"
        subtitle="הגדרות הסוכנות"
        actions={
          <Link href="/settings/team">
            <Button variant="secondary">צוות והרשאות</Button>
          </Link>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label>שם הסוכנות</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">מסלול</div>
              <div className="font-medium text-slate-800">{org.plan}</div>
            </div>
            <div>
              <div className="text-slate-500">התפקיד שלך</div>
              <div className="font-medium text-slate-800">{session ? ROLE_LABELS_HE[session.role] : "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">חברי צוות</div>
              <div className="font-medium text-slate-800">{org.memberCount}</div>
            </div>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>
                שמור
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
