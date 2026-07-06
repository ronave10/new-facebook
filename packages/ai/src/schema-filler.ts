import { z, ZodType } from "zod";

/**
 * Best-effort deterministic value that satisfies an arbitrary zod schema.
 * Used by MockAiProvider as a fallback when a task-specific fixture does not
 * exist, so mock output ALWAYS validates against the caller's schema.
 */
export function fillSchema<T>(schema: ZodType<T>, seed = "mock"): T {
  return build(schema as unknown as z.ZodTypeAny, seed, 0) as T;
}

function build(schema: z.ZodTypeAny, seed: string, depth: number): unknown {
  if (depth > 8) return null;
  const def = schema._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case z.ZodFirstPartyTypeKind.ZodString: {
      // honor a few common checks
      const checks = (def.checks ?? []) as { kind: string; value?: unknown }[];
      if (checks.some((c) => c.kind === "email")) return `${seed}@example.com`;
      if (checks.some((c) => c.kind === "url")) return "https://example.com";
      if (checks.some((c) => c.kind === "uuid")) return "00000000-0000-4000-8000-000000000000";
      return `דוגמה ${seed}`;
    }
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return 1;
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return true;
    case z.ZodFirstPartyTypeKind.ZodDate:
      return new Date(0);
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return def.value;
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return (def.values as string[])[0];
    case z.ZodFirstPartyTypeKind.ZodNativeEnum: {
      const values = Object.values(def.values as Record<string, unknown>);
      return values[0];
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return build(def.innerType, seed, depth + 1);
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return def.defaultValue();
    case z.ZodFirstPartyTypeKind.ZodArray: {
      // produce a small non-empty array to satisfy .min(n) where reasonable
      const min = (def.minLength?.value as number | undefined) ?? 1;
      const count = Math.max(min, 1);
      return Array.from({ length: count }, (_, i) =>
        build(def.type, `${seed}-${i}`, depth + 1),
      );
    }
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const obj: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(shape)) {
        obj[key] = build(child, `${seed}-${key}`, depth + 1);
      }
      return obj;
    }
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = def.options as z.ZodTypeAny[];
      return build(options[0], seed, depth + 1);
    }
    case z.ZodFirstPartyTypeKind.ZodRecord:
      return {};
    case z.ZodFirstPartyTypeKind.ZodAny:
    case z.ZodFirstPartyTypeKind.ZodUnknown:
      return {};
    default:
      return null;
  }
}
