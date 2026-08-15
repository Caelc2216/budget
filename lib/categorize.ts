import { prisma } from "./db";

/**
 * Pick a category id for a transaction based on merchant rules.
 * Longer patterns win (more specific), so "chick fil a" beats a bare "a".
 * Special case: Amazon's recurring ~$8 charge is a subscription, not shopping.
 */
export async function categorize(
  description: string,
  amountCents: number
): Promise<string | null> {
  const text = description.toLowerCase();

  // Amazon Prime-style recurring charge heuristic from the user's history.
  if (
    (text.includes("amazon") || text.includes("amzn")) &&
    Math.abs(amountCents) === 800
  ) {
    const subs = await prisma.category.findUnique({ where: { name: "Subscriptions" } });
    if (subs) return subs.id;
  }

  const abs = Math.abs(amountCents);
  const rules = await prisma.merchantRule.findMany();
  const matches = rules.filter(
    (r) =>
      text.includes(r.pattern) &&
      (r.minAmountCents == null || abs >= r.minAmountCents) &&
      (r.maxAmountCents == null || abs < r.maxAmountCents)
  );

  // Prefer the most specific rule: an amount-bounded rule beats a general one,
  // then a longer (more specific) pattern wins.
  matches.sort((a, b) => {
    const aBounded = a.minAmountCents != null || a.maxAmountCents != null ? 1 : 0;
    const bBounded = b.minAmountCents != null || b.maxAmountCents != null ? 1 : 0;
    if (aBounded !== bBounded) return bBounded - aBounded;
    return b.pattern.length - a.pattern.length;
  });

  return matches.length > 0 ? matches[0].categoryId : null;
}
