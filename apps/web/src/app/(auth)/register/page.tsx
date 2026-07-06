"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, Input, Label } from "@/components/ui";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", organizationName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast("נרשמת בהצלחה!", "success");
      router.push("/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "הרשמה נכשלה", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">פתיחת חשבון סוכנות</h1>
          <p className="mt-1 text-sm text-slate-500">התחילו לנהל קמפיינים ללקוחות שלכם</p>
        </div>
        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>שם מלא</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div>
                <Label>שם הסוכנות</Label>
                <Input value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} required />
              </div>
              <div>
                <Label>אימייל</Label>
                <Input type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
              <div>
                <Label>סיסמה (לפחות 8 תווים)</Label>
                <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                יצירת חשבון
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-semibold text-brand-600 hover:underline">
                התחברות
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
