// Freelance tax set-asides.
// Money moved into the "Freelance Taxes" account is reserved to pay taxes, so it
// isn't really income: it's the one kind of transfer that counts, and it is
// subtracted from income totals.
//
// A transfer is a set-aside when either:
//   - it lands (positive amount) in an account whose name contains
//     "freelance tax", regardless of category, or
//   - no such account is tracked, and it's an outgoing transfer from any
//     account whose description mentions "freelance tax".
// When the Freelance Taxes account is tracked, only its deposit side is counted
// so a transfer seen from both ends isn't subtracted twice.

const FREELANCE_TAX = /freelance\s*tax/i;

export function isFreelanceTaxAccount(name: string): boolean {
  return FREELANCE_TAX.test(name);
}

// Returns a function giving the set-aside amount (positive cents) for a
// transaction, or 0 if it isn't a set-aside.
export function freelanceTaxSetAside(accounts: { id: string; name: string }[]) {
  const taxAccountIds = new Set(
    accounts.filter((a) => isFreelanceTaxAccount(a.name)).map((a) => a.id)
  );

  return (t: {
    accountId: string;
    description: string;
    amountCents: number;
    kind: string | undefined;
  }): number => {
    if (taxAccountIds.size > 0) {
      return taxAccountIds.has(t.accountId) && t.amountCents > 0 ? t.amountCents : 0;
    }
    return t.kind === "transfer" && t.amountCents < 0 && FREELANCE_TAX.test(t.description)
      ? -t.amountCents
      : 0;
  };
}
