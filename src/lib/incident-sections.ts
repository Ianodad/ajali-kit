// The incident hub checklist, per SPEC section 5 (F2) and section 6 (S07):
// "Photos, Damage review, Other party, Police report, Witnesses, My account, Claim pack."
export const INCIDENT_SECTIONS = [
  { slug: "photos", title: "Photos" },
  { slug: "damage", title: "Damage review" },
  { slug: "other-party", title: "Other party" },
  { slug: "police", title: "Police report" },
  { slug: "witnesses", title: "Witnesses" },
  { slug: "account", title: "My account" },
  { slug: "pack", title: "Claim pack" },
] as const;
