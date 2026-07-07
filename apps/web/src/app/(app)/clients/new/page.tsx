"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND_TONES_HE, CAMPAIGN_GOAL_LABELS_HE, CAMPAIGN_GOALS } from "@campaignos/shared";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, Input, Label, PageHeader, Select, Stepper, TagListInput, Textarea } from "@/components/ui";

const STEPS = ["פרטי העסק", "מטרה והצעה", "בידול וכאבים", "הוכחות וטון", "הגבלות וסיכום"];

export default function NewClientWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    activityArea: "",
    currency: "ILS",
    country: "IL",
    campaignGoal: "LEADS" as string,
    mainProduct: "",
    priceRange: "",
    keyBenefits: [] as string[],
    differentiation: "",
    customerPains: [] as string[],
    commonObjections: [] as string[],
    proofs: [] as { type: string; description: string }[],
    brandTone: "professional",
    forbiddenWords: [] as string[],
    forbiddenPromises: [] as string[],
    regulatoryNotes: "",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function magicFill() {
    const url = form.website.trim();
    if (!url) {
      toast("יש להזין כתובת אתר תחילה", "error");
      return;
    }
    setExtracting(true);
    try {
      const dna = await api.extractBrand(url);
      setForm((f) => ({
        ...f,
        industry: f.industry || dna.suggestedIndustry || "",
        mainProduct: dna.mainProduct || f.mainProduct,
        keyBenefits: dna.keyBenefits?.length ? dna.keyBenefits : f.keyBenefits,
        differentiation: dna.differentiation || f.differentiation,
        customerPains: dna.customerPains?.length ? dna.customerPains : f.customerPains,
        commonObjections: dna.commonObjections?.length ? dna.commonObjections : f.commonObjections,
        brandTone: dna.brandTone || f.brandTone,
      }));
      toast("הפרופיל מולא אוטומטית מהאתר — עברו ואשרו את הפרטים ✨", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "מילוי אוטומטי נכשל", "error");
    } finally {
      setExtracting(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const client = await api.createClient({
        name: form.name,
        industry: form.industry || undefined,
        website: form.website || undefined,
        activityArea: form.activityArea || undefined,
        currency: form.currency,
        country: form.country,
        language: "he",
        brandProfile: {
          campaignGoal: form.campaignGoal as never,
          mainProduct: form.mainProduct || undefined,
          priceRange: form.priceRange || undefined,
          keyBenefits: form.keyBenefits,
          differentiation: form.differentiation || undefined,
          customerPains: form.customerPains,
          commonObjections: form.commonObjections,
          proofs: form.proofs,
          brandTone: form.brandTone,
          restrictions: {
            forbiddenWords: form.forbiddenWords,
            forbiddenPromises: form.forbiddenPromises,
            sensitiveTopics: [],
            regulatoryNotes: form.regulatoryNotes || undefined,
          },
        },
      });
      toast("הלקוח נוצר בהצלחה!", "success");
      router.push(`/clients/${client.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "יצירת הלקוח נכשלה", "error");
    } finally {
      setSaving(false);
    }
  }

  const canNext = step === 0 ? form.name.trim().length >= 2 : true;

  return (
    <div className="max-w-2xl">
      <PageHeader title="לקוח חדש" subtitle="בניית פרופיל לקוח מלא בעזרת אשף" />
      <Card>
        <CardBody>
          <Stepper steps={STEPS} current={step} />

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>שם העסק *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="לדוגמה: קליניקת חיוכים" />
              </div>
              <div>
                <Label>תחום</Label>
                <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="רפואת שיניים, פיטנס, נדל״ן…" />
              </div>
              <div>
                <Label>אתר</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" className="flex-1" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
                  <Button type="button" variant="secondary" onClick={magicFill} loading={extracting} disabled={!form.website.trim()}>
                    ✨ מילוי אוטומטי
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">הדבק כתובת אתר וה-AI ימלא את פרופיל המותג אוטומטית</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>אזור פעילות</Label>
                  <Input value={form.activityArea} onChange={(e) => set("activityArea", e.target.value)} placeholder="גוש דן / ארצי" />
                </div>
                <div>
                  <Label>מטבע</Label>
                  <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="ILS">₪ שקל</option>
                    <option value="USD">$ דולר</option>
                    <option value="EUR">€ יורו</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>מטרת הקמפיין</Label>
                <div className="flex flex-wrap gap-2">
                  {CAMPAIGN_GOALS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set("campaignGoal", g)}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        form.campaignGoal === g ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {CAMPAIGN_GOAL_LABELS_HE[g]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>מוצר / שירות מרכזי</Label>
                <Textarea rows={2} value={form.mainProduct} onChange={(e) => set("mainProduct", e.target.value)} />
              </div>
              <div>
                <Label>טווח מחיר</Label>
                <Input value={form.priceRange} onChange={(e) => set("priceRange", e.target.value)} placeholder="199–299 ₪ / לפי הצעת מחיר" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>יתרונות מרכזיים</Label>
                <TagListInput values={form.keyBenefits} onChange={(v) => set("keyBenefits", v)} placeholder="הוסף יתרון…" />
              </div>
              <div>
                <Label>במה אתם מבדילים מהמתחרים?</Label>
                <Textarea rows={2} value={form.differentiation} onChange={(e) => set("differentiation", e.target.value)} />
              </div>
              <div>
                <Label>כאבים של הלקוח הסופי</Label>
                <TagListInput values={form.customerPains} onChange={(v) => set("customerPains", v)} placeholder="הוסף כאב…" />
              </div>
              <div>
                <Label>התנגדויות נפוצות</Label>
                <TagListInput values={form.commonObjections} onChange={(v) => set("commonObjections", v)} placeholder="הוסף התנגדות…" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label>טון מותג</Label>
                <div className="flex flex-wrap gap-2">
                  {BRAND_TONES_HE.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set("brandTone", t.value)}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        form.brandTone === t.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <ProofsEditor proofs={form.proofs} onChange={(v) => set("proofs", v)} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label>מילים אסורות</Label>
                <TagListInput values={form.forbiddenWords} onChange={(v) => set("forbiddenWords", v)} placeholder="מילה אסורה…" />
              </div>
              <div>
                <Label>הבטחות אסורות</Label>
                <TagListInput values={form.forbiddenPromises} onChange={(v) => set("forbiddenPromises", v)} placeholder="הבטחה אסורה…" />
              </div>
              <div>
                <Label>הערות רגולציה</Label>
                <Textarea rows={2} value={form.regulatoryNotes} onChange={(e) => set("regulatoryNotes", e.target.value)} placeholder="לדוגמה: פרסום רפואי — ללא הבטחת תוצאה" />
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-800">{form.name || "—"}</div>
                <div>{form.industry} · {CAMPAIGN_GOAL_LABELS_HE[form.campaignGoal as never]}</div>
                <div className="mt-1 text-xs">{form.keyBenefits.length} יתרונות · {form.customerPains.length} כאבים · {form.proofs.length} הוכחות</div>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between">
            <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              הקודם
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                הבא
              </Button>
            ) : (
              <Button onClick={submit} loading={saving}>
                יצירת הלקוח
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ProofsEditor({ proofs, onChange }: { proofs: { type: string; description: string }[]; onChange: (v: any) => void }) {
  const [type, setType] = useState("reviews");
  const [desc, setDesc] = useState("");
  return (
    <div>
      <Label>הוכחות (ביקורות, תוצאות, מקרי הצלחה)</Label>
      <div className="flex gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-[130px]">
          <option value="reviews">ביקורות</option>
          <option value="results">תוצאות</option>
          <option value="case_study">מקרה הצלחה</option>
          <option value="before_after">לפני/אחרי</option>
        </Select>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="תיאור ההוכחה…" />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (desc.trim()) {
              onChange([...proofs, { type, description: desc.trim() }]);
              setDesc("");
            }
          }}
        >
          הוסף
        </Button>
      </div>
      {proofs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {proofs.map((p, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span>
                <span className="text-slate-400">{p.type}:</span> {p.description}
              </span>
              <button onClick={() => onChange(proofs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
