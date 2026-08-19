---
title: "National Trust Bank Charter"
description: "A federal banking license issued by the OCC that authorizes custody and movement of customer assets but not deposit-taking — and the regulatory perimeter it sits outside."
date: 2026-05-13
lastmod: 2026-05-13
---

**Status.** Last reviewed 2026-05-13. Next review trigger: WLTC Holdings preliminary-decision issuance (120-day window opened May 7, 2026).

**Definition.** A national trust bank charter is a federal banking license issued by the [Office of the Comptroller of the Currency](https://www.occ.gov/) (OCC), the bureau of the Treasury Department that charters national banks. The charter authorizes the holder to custody and move customer assets in a fiduciary capacity. It does *not* authorize taking deposits, and the holder is therefore not insured by the FDIC and not subject to the prudential regime that applies to full-service national banks.

The statutory authority is [12 U.S.C. § 27(a)](https://www.law.cornell.edu/uscode/text/12/27). The implementing regulation is [12 CFR 5.20](https://www.ecfr.gov/current/title-12/chapter-I/part-5/subpart-A/section-5.20). The decision document the OCC issues is a Conditional Approval, commonly cited as a CD-series document (e.g., CD-1367).

---

## The mechanic

A national trust bank exists to hold and administer assets that belong to someone else. Historically the canonical use cases were corporate trust services (paying bondholders, custodying securities for a mutual fund), employee-benefit trusts, and personal-trust administration. The longstanding institutional holders are entities like BNY Mellon, State Street, and Northern Trust — operations whose business model is fees for custody and administration, not interest-rate spread on deposits.

What the charter confers:

- **Federal preemption** of most state banking and money-transmitter licensing. A national trust bank operates under one federal supervisor — the OCC — rather than the patchwork of 50 state regulators that govern non-bank financial firms.
- **Custody authority** for fiduciary assets, including (under the OCC's 2020 interpretive letters) digital assets and stablecoin reserves.
- **Trust-company powers** as defined by the chartering state's law of reference, plus the powers enumerated in 12 CFR 9.

What the charter does not confer:

- **Deposit-taking.** A trust bank cannot accept demand deposits insured by the FDIC. This is the single most important boundary of the charter, and the source of most of its regulatory advantages.
- **Access to the Federal Reserve's discount window**, except under narrow conditions. Trust banks generally cannot rely on the central-bank liquidity backstop that depository institutions can.
- **Authority to lend in the ordinary commercial sense.** Trust banks can extend credit incidental to fiduciary activities; they cannot run a loan book.

The supervisory regime is correspondingly narrower. A national trust bank is examined by the OCC on a cycle and against a set of criteria calibrated to fiduciary risk, not to deposit-taking risk. It is not examined by the FDIC. It is not subject to the [Community Reinvestment Act](https://www.ffiec.gov/cra/) examination process. The Consumer Financial Protection Bureau's direct supervisory authority over the entity is limited.

---

## What this charter effectively removes

The national trust bank charter, when held by a stablecoin issuer or crypto custody firm, has the structural effect of removing several obligations that would otherwise attach to the entity:

- **FDIC deposit-insurance regime and its examination authority.** Because a trust bank does not take deposits, it sits outside [12 U.S.C. § 1813](https://www.law.cornell.edu/uscode/text/12/1813) coverage and the corresponding FDIC examination cycle. The federal supervisor of last resort for the entity is the OCC, alone.
- **Community Reinvestment Act obligations** ([12 U.S.C. § 2901 et seq.](https://www.law.cornell.edu/uscode/text/12/chapter-30)), which attach to depository institutions. A stablecoin issuer holding a trust-bank charter is not assessed against CRA lending-to-underserved-communities metrics — obligations the issuer's business model could not in practice meet.
- **State money-transmitter licensing in 50 jurisdictions.** A national charter preempts most state licensing of money transmission. For a stablecoin issuer, this collapses what would otherwise be a 50-state licensing effort (the regime [Circle](https://capturecascade.org/actors/circle/), [Paxos](https://capturecascade.org/actors/paxos/), and others operated under before 2025) into a single federal supervisor.
- **CFPB consumer-protection examination authority** for non-bank financial entities. A trust-bank designation shifts consumer-facing complaint and examination authority into the OCC's framework, which historically focuses on safety-and-soundness rather than consumer harm in the CFPB's sense.

These are not allegations. They are descriptions of which obligations attach to which entity types under existing federal law. The structural fact is that, for a stablecoin issuer, the national trust bank charter is the lowest-obligation federal banking license currently available.

---

## Why it's in the fight

Between December 12, 2025 and April 2, 2026, the OCC under Comptroller [Jonathan Gould](https://capturecascade.org/actors/jonathan-gould/) granted conditional national trust bank charters to nine crypto-native applicants: Circle, Ripple, BitGo, Fidelity Digital Assets, and Paxos on a single day in December 2025; Bridge, Protego, and Crypto.com in February 2026; and Coinbase on April 2, 2026. No crypto-native applicant had previously held the charter as a fully operational trust bank.

On January 7, 2026, [WLTC Holdings LLC](https://capturecascade.org/actors/world-liberty-financial/) — a subsidiary of World Liberty Financial, approximately 75% owned by entities controlled by the Trump family through DT Marks DeFi LLC and affiliated structures — filed for the same charter. The proposed bank would issue, redeem, and custody USD1, the Trump-family dollar-pegged stablecoin. The 120-day decision window opened May 7, 2026.

On March 2, 2026, the OCC published a [final rule at 91 FR 9977](https://www.federalregister.gov/) amending 12 CFR 5.20. Effective April 1, 2026, the regulation no longer authorizes charters for "fiduciary activities" — it authorizes them for "the operations of a trust company and activities related thereto." The OCC characterized this as alignment with the underlying statute, 12 U.S.C. § 27(a). The substantive effect of the amendment was to remove the specific textual hook that the [National Community Reinvestment Coalition](https://ncrc.org/) and the [Americans for Financial Reform Education Fund](https://ourfinancialsecurity.org/) had identified, in their February 9, 2026 comment letters, as the basis for an Administrative Procedure Act challenge to a WLTC approval.

**The amendment did not resolve the policy debate over whether stablecoin issuance is appropriately housed in a trust-bank structure. It resolved the regulatory-text question on a schedule aligned to the WLTC decision clock.**

The supervisory perimeter described above is therefore not a stable feature of the law. It is a perimeter under active construction.

---

## Common confusions

- **Not the same as an FDIC bank charter.** A national trust bank holds no FDIC insurance, accepts no deposits, and is not examined by the FDIC. Customer-asset custody is not deposit-taking, and the customer-protection regime is not the same.
- **Not the same as a state trust charter.** State charters (Wyoming SPDI, New York limited-purpose trust company) confer different authorities, are subject to different preemption results, and answer to a different supervisor.
- **Not the same as a state money-transmitter license.** Money-transmitter licenses are state-level, much weaker, and the regime most crypto firms operated under before 2025. The national trust bank charter preempts that regime.
- **"Conditional approval" is not full operational status.** The OCC's CD-series conditional approvals require the applicant to satisfy enumerated conditions before commencing business. Eight of the nine 2025–2026 crypto-native approvals were conditional, not final.

---

## Where this shows up in the reporting

- *The Precedent Corridor: How the OCC Built a Trust-Charter Track for the President's Family* — the eight pre-WLTC conditional approvals as precedent infrastructure, and the April 1, 2026 regulatory amendment as the sixth action in the [Rollback Wave](https://capturecascade.org/tags/regulatory-capture/) sequence.
- *The Rollback Wave* — six coordinated administrative actions removing oversight surfaces aligned to the Trump-family financial architecture; the 12 CFR 5.20 amendment is action six.

---

## Sources

**Primary Statute and Regulation:**

- [12 U.S.C. § 27(a)](https://www.law.cornell.edu/uscode/text/12/27) — National bank chartering authority
- [12 CFR 5.20](https://www.ecfr.gov/current/title-12/chapter-I/part-5/subpart-A/section-5.20) — OCC implementing regulation
- [12 CFR 9](https://www.ecfr.gov/current/title-12/chapter-I/part-9) — Fiduciary activities of national banks
- OCC Final Rule 91 FR 9977 — National Bank Chartering Amendment (Federal Register, March 2, 2026)
- OCC Bulletin 2026-4 — National Bank Chartering Final Rule (OCC, February 27, 2026)

**Comment Record:**

- NCRC Comment Letter on WLTC Charter Application (regulations.gov docket OCC-2026-0100-0004, February 9, 2026)
- AFREF Comment Letter on WLTC Charter Application (regulations.gov docket OCC-2026-0100-0004, February 9, 2026)

**Reporting:**

- *Eleven Companies, Eighty-Three Days: The Race for a Federal Crypto Banking License* (FinTech Weekly, April 2026)
- *Coinbase Receives Conditional OCC Approval for National Trust Bank Charter* (American Banker, April 2, 2026)
- *Warren grills Gould over World Liberty charter application* (Banking Dive, February 27, 2026)
- *World Liberty Financial Announces WLTC Holdings National Trust Bank Charter Application* (BusinessWire, January 7, 2026)

**Capture Cascade Context:**

- [Pattern — Regulatory Capture](https://capturecascade.org/tags/regulatory-capture/)
- [Actor — Jonathan Gould](https://capturecascade.org/actors/jonathan-gould/)
- [Actor — World Liberty Financial](https://capturecascade.org/actors/world-liberty-financial/)
