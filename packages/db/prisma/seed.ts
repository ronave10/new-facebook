/* eslint-disable no-console */
// Deterministic demo seed for CampaignOS AI.
// Run: pnpm db:seed  (requires DATABASE_URL)

import { PrismaClient } from "@prisma/client";
import { createHash, scryptSync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// argon2 lives in apps/api; the seed uses a marker hash that the API refuses to
// verify UNLESS SEED_PLAIN_PASSWORDS=1, in which case we store an argon2-like
// placeholder. To keep the seed dependency-free we hash with scrypt and the API
// auth service recognizes the "scrypt$" prefix (dev only).
function scryptHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

async function main() {
  console.log("Seeding CampaignOS demo data…");

  const org = await prisma.organization.upsert({
    where: { slug: "demo-agency" },
    update: {},
    create: { name: "סוכנות דמו", slug: "demo-agency", plan: "pro" },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.co.il" },
    update: {},
    create: {
      email: "owner@demo.co.il",
      passwordHash: scryptHash("Demo1234!"),
      name: "דנה כהן",
    },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@demo.co.il" },
    update: {},
    create: {
      email: "manager@demo.co.il",
      passwordHash: scryptHash("Demo1234!"),
      name: "יוסי לוי",
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: { role: "AGENCY_OWNER" },
    create: { organizationId: org.id, userId: owner.id, role: "AGENCY_OWNER" },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: manager.id } },
    update: { role: "ACCOUNT_MANAGER" },
    create: { organizationId: org.id, userId: manager.id, role: "ACCOUNT_MANAGER" },
  });

  const existing = await prisma.client.findFirst({
    where: { organizationId: org.id, name: "קליניקת חיוכים" },
  });
  const client =
    existing ??
    (await prisma.client.create({
      data: {
        organizationId: org.id,
        name: "קליניקת חיוכים",
        industry: "רפואת שיניים אסתטית",
        website: "https://smiles.example.co.il",
        activityArea: "גוש דן",
        status: "ACTIVE",
        createdById: owner.id,
      },
    }));

  await prisma.clientBrandProfile.upsert({
    where: { clientId: client.id },
    update: {},
    create: {
      organizationId: org.id,
      clientId: client.id,
      campaignGoal: "LEADS",
      mainProduct: "יישור שיניים שקוף",
      priceRange: "8,000–16,000 ₪",
      keyBenefits: ["תוצאה תוך 6–12 חודשים", "ללא ברזלים", "מימון עד 24 תשלומים"],
      differentiation: "מרפאה עם רופא מומחה ליישור בלבד, מעל 2,000 מטופלים",
      customerPains: ["בושה לחייך בצילומים", "פחד מכאב", "מחיר גבוה"],
      commonObjections: ["יקר לי", "אין לי זמן לטיפולים", "זה כואב?"],
      proofs: [
        { type: "reviews", description: "4.9 בגוגל, 320 ביקורות" },
        { type: "before_after", description: "גלריית לפני/אחרי של 50 מטופלים" },
      ],
      brandTone: "professional",
      restrictions: {
        forbiddenWords: ["הבטחה", "ללא כאב מוחלט"],
        forbiddenPromises: ["תוצאה מובטחת"],
        regulatoryNotes: "פרסום רפואי — נדרש איפוק, ללא הבטחת תוצאה",
        sensitiveTopics: ["בריאות"],
      },
    },
  });

  const personaCount = await prisma.customerPersona.count({ where: { clientId: client.id } });
  if (personaCount === 0) {
    await prisma.customerPersona.createMany({
      data: [
        {
          organizationId: org.id,
          clientId: client.id,
          name: "מיכל, 32, לפני חתונה",
          ageRange: "28–35",
          lifeSituation: "מתחתנת בעוד 8 חודשים, עובדת הייטק",
          pains: ["מתביישת בחיוך בצילומים"],
          desires: ["חיוך מושלם לאלבום החתונה"],
          fears: ["שזה לא יספיק בזמן"],
          objections: ["כמה זה באמת עולה?"],
          emotionalTriggers: ["דדליין החתונה", "צילומים"],
          conversionDrivers: ["הדמיה חינם", "התחייבות ללו\"ז"],
          distrustTriggers: ["הבטחות מוגזמות"],
          copyStyle: "רגשי-אישי עם דדליין",
          creativeStyle: "לפני/אחרי, וידאו עדות",
          matchingOffers: ["בדיקת התאמה + הדמיה ללא עלות"],
          campaignAngles: ["חיוך עד החתונה", "8 חודשים זה מספיק"],
          source: "MANUAL",
        },
        {
          organizationId: org.id,
          clientId: client.id,
          name: "אבי, 45, מנהל בכיר",
          ageRange: "40–52",
          lifeSituation: "מנהל, פוגש לקוחות כל יום",
          pains: ["חיוך עקום פוגע בביטחון מול לקוחות"],
          desires: ["מראה מקצועי ומטופח"],
          fears: ["ברזלים לא מתאימים לגיל שלו"],
          objections: ["אין לי זמן למרפאות"],
          emotionalTriggers: ["סטטוס", "רושם ראשוני"],
          conversionDrivers: ["טיפול דיסקרטי", "מעט פגישות"],
          distrustTriggers: ["מבצעים זולים"],
          copyStyle: "ישיר, סטטוס, יוקרתי",
          creativeStyle: "צילומי תדמית נקיים",
          matchingOffers: ["מסלול אקספרס למנהלים"],
          campaignAngles: ["שקוף. דיסקרטי. מהיר."],
          source: "MANUAL",
        },
      ],
    });
  }

  const campaignExists = await prisma.campaign.findFirst({
    where: { organizationId: org.id, name: "לידים — יישור שקוף Q3" },
  });
  const campaign =
    campaignExists ??
    (await prisma.campaign.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        name: "לידים — יישור שקוף Q3",
        goal: "LEADS",
        metaObjective: "OUTCOME_LEADS",
        status: "DRAFT",
        budgetType: "DAILY",
        budgetAmount: 15000, // 150.00 ILS
        currency: "ILS",
        createdById: owner.id,
        targetingDraft: { countries: ["IL"], ageMin: 25, ageMax: 55 },
      },
    }));

  // 30 days of demo performance snapshots
  const snapCount = await prisma.performanceSnapshot.count({
    where: { organizationId: org.id, entityId: campaign.id },
  });
  if (snapCount === 0) {
    const rows = [];
    for (let i = 30; i >= 1; i--) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      // deterministic pseudo-random from date
      const seed = parseInt(sha256(`snap-${i}`).slice(0, 6), 16) / 0xffffff;
      const spend = 120 + Math.round(seed * 60);
      const impressions = 5000 + Math.round(seed * 4000);
      const clicks = 90 + Math.round(seed * 80);
      const leads = 2 + Math.round(seed * 5);
      rows.push({
        organizationId: org.id,
        clientId: client.id,
        level: "CAMPAIGN" as const,
        entityId: campaign.id,
        metaEntityId: "mock_23850000000001",
        date,
        granularity: "DAY" as const,
        spend,
        impressions,
        reach: Math.round(impressions * 0.8),
        clicks,
        ctr: Number(((clicks / impressions) * 100).toFixed(4)),
        cpc: Number((spend / clicks).toFixed(4)),
        cpm: Number(((spend / impressions) * 1000).toFixed(4)),
        leads,
        conversions: leads,
        cpl: Number((spend / leads).toFixed(4)),
        raw: {},
      });
    }
    await prisma.performanceSnapshot.createMany({ data: rows });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorId: owner.id,
      actorType: "SYSTEM",
      action: "seed.run",
      metadata: { note: "demo seed" },
    },
  });

  console.log("Seed complete:");
  console.log("  owner@demo.co.il / Demo1234!  (בעל סוכנות)");
  console.log("  manager@demo.co.il / Demo1234! (מנהל תיקים)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
