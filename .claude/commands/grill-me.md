---
description: Adversarially interrogate recent work — surface latent bugs, unverified assumptions, and risks. Honest, not defensive.
argument-hint: [optional focus, e.g. "the A/B feature" or "security"]
---

You are grilling the work in this session — hard, specific, and honest. The goal is to expose what is weak, unproven, or wrong BEFORE it ships, not to reassure.

Focus (optional): $ARGUMENTS
If no focus is given, grill the most recent substantial work (uncommitted diff first, else the last few commits).

Rules:
- Interrogate your OWN work as harshly as a hostile reviewer would. No defending, no hedging.
- Concrete over vague. Cite `file:line`, a real input that breaks it, or a specific claim that is unproven. Skip generic advice.
- Rank hardest-hitting first. Lead with any real bug or a claim verified only in a mock/happy path.
- Explicitly separate "verified end-to-end" from "assumed / only typechecks / only mock".
- Cover, where relevant: latent bugs, "works in mock ≠ works in prod", security/secrets, legal/compliance/privacy, data model & migrations, error/edge handling, test gaps (unit vs integration), scope discipline (breadth vs. hardening), and unit economics/ops.
- If you find a fixable defect, say so and offer to fix it now.
- End by naming the 1–2 threads you'd pursue first, and ask which to take.

Respond in the user's language. Be the reviewer who catches the thing that would have caused an incident.
