"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, Input, Label } from "@/components/ui";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("owner@demo.co.il");
  const [password, setPassword] = useState("Demo1234!");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "התחברות נכשלה", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">
            CO
          </div>
          <h1 className="text-2xl font-bold text-slate-900">CampaignOS AI</h1>
          <p className="mt-1 text-sm text-slate-500">התחברות למערכת ניהול הקמפיינים</p>
        </div>
        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">אימייל</Label>
                <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">סיסמה</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                התחברות
              </Button>
            </form>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              חשבון דמו: <span dir="ltr">owner@demo.co.il / Demo1234!</span>
            </div>
            <p className="mt-4 text-center text-sm text-slate-500">
              אין לך חשבון?{" "}
              <Link href="/register" className="font-semibold text-brand-600 hover:underline">
                הרשמה
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
