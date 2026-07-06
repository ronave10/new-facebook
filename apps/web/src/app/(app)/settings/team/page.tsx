"use client";

import { useState } from "react";
import { ORG_ROLES, ROLE_LABELS_HE } from "@campaignos/shared";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, ConfirmDialog, Input, Label, Modal, PageHeader, Select, Spinner } from "@/components/ui";

export default function TeamPage() {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { data, loading, reload } = useApi(() => api.members(), []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const canManage = hasPermission("member.manage");

  const [invite, setInvite] = useState({ name: "", email: "", password: "", role: "ACCOUNT_MANAGER" });

  async function addMember() {
    try {
      await api.addMember(invite);
      toast("החבר נוסף", "success");
      setInviteOpen(false);
      setInvite({ name: "", email: "", password: "", role: "ACCOUNT_MANAGER" });
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הוספה נכשלה", "error");
    }
  }

  async function remove(id: string) {
    try {
      await api.removeMember(id);
      toast("החבר הוסר", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הסרה נכשלה", "error");
    } finally {
      setRemoveId(null);
    }
  }

  async function changeRole(id: string, role: string) {
    try {
      await api.updateMember(id, { role });
      toast("התפקיד עודכן", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "עדכון נכשל", "error");
    }
  }

  if (loading) return <Spinner className="mx-auto my-16 h-7 w-7 text-brand-600" />;
  const members = data ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="צוות והרשאות"
        subtitle="ניהול חברי הסוכנות ותפקידיהם"
        actions={canManage && <Button onClick={() => setInviteOpen(true)}>+ הוסף חבר</Button>}
      />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-5 py-3 text-start font-medium">שם</th>
              <th className="px-5 py-3 text-start font-medium">אימייל</th>
              <th className="px-5 py-3 text-start font-medium">תפקיד</th>
              {canManage && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m: any) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{m.name}</td>
                <td className="px-5 py-3 text-slate-500" dir="ltr">
                  {m.email}
                </td>
                <td className="px-5 py-3">
                  {canManage ? (
                    <Select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} className="max-w-[180px]">
                      {ORG_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS_HE[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    ROLE_LABELS_HE[m.role as never]
                  )}
                </td>
                {canManage && (
                  <td className="px-5 py-3 text-end">
                    <button onClick={() => setRemoveId(m.id)} className="text-sm text-red-500 hover:underline">
                      הסר
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="הוספת חבר צוות">
        <div className="space-y-4">
          <div>
            <Label>שם</Label>
            <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          </div>
          <div>
            <Label>אימייל</Label>
            <Input type="email" dir="ltr" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div>
            <Label>סיסמה זמנית</Label>
            <Input type="text" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} />
          </div>
          <div>
            <Label>תפקיד</Label>
            <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS_HE[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-start gap-2">
            <Button onClick={addMember}>הוסף</Button>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              ביטול
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeId}
        onClose={() => setRemoveId(null)}
        onConfirm={() => removeId && remove(removeId)}
        title="הסרת חבר צוות"
        message="האם להסיר את החבר מהסוכנות? לא ניתן להסיר את בעל הסוכנות האחרון."
        confirmLabel="הסר"
        destructive
      />
    </div>
  );
}
