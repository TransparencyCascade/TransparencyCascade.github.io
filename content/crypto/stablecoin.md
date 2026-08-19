---
title: "Stablecoin"
description: "A cryptocurrency engineered to hold a constant value relative to a reference asset — and the financial instrument whose reserve, redemption, and supervisory questions sit at the center of the 2025–2026 crypto regulatory fight."
date: 2026-05-13
lastmod: 2026-05-13
---

**Status.** Last reviewed 2026-05-13. Next review trigger: WLTC Holdings preliminary-decision issuance; any further GENIUS Act rulemaking by Treasury or the OCC.

**Definition.** A stablecoin is a cryptocurrency engineered to maintain a constant value relative to a reference asset — almost always the U.S. dollar. The issuer accepts dollars from a customer, mints a corresponding quantity of tokens, and contracts (with varying degrees of legal force) to redeem those tokens for dollars on demand. The customer's claim is against the issuer, not against the bank holding the issuer's reserves and not against any government insurance fund. Stablecoins are the asset class through which the U.S. dollar circulates on public blockchains, and the asset class to which most of the 2025–2026 federal regulatory architecture has been calibrated.

---

## The mechanic

A stablecoin is a liability. The token in a customer's wallet represents the issuer's promise to redeem one token for one dollar. The economic question that defines a stablecoin is *what backs that promise*.

Three reserve models account for nearly all stablecoin supply:

- **Fiat-reserved.** The issuer holds a reserve of cash and short-term U.S. Treasury bills approximately equal to the outstanding token supply. The dominant fiat-reserved coins are [USDT (Tether)](https://tether.to/) and [USDC](https://www.circle.com/en/usdc), together comprising the large majority of stablecoin market capitalization. Tether is issued from offshore jurisdictions; Circle (USDC) is U.S.-domiciled and an applicant in the 2025–2026 OCC trust-bank cohort.
- **Crypto-collateralized.** The issuer holds a reserve of other cryptocurrencies, typically over-collateralized to absorb price volatility. The canonical example is [DAI](https://makerdao.com/), issued by the MakerDAO smart-contract system. This model has shrunk in relative share since 2022.
- **Algorithmic.** The issuer holds little or no reserve and relies on smart-contract incentives to maintain the peg. The canonical example is [TerraUSD (UST)](https://capturecascade.org/event/2022-05-09--terra-luna-collapse/), which lost its peg in May 2022 and collapsed to near zero in a week, erasing approximately $40 billion in market capitalization. The algorithmic model is largely discredited but not legally prohibited.

The fiat-reserved model is the only one of operational policy interest in the United States as of 2026. The economics of the model are simple: the issuer takes in dollars at par, invests the reserve in short-duration Treasuries (currently yielding 4–5%), and keeps the yield. **Stablecoin issuance is, structurally, a leveraged play on the Treasury-bill curve, conducted under the legal description of a payments product.** Tether's reported 2024 net income exceeded $13 billion on a balance sheet of roughly $140 billion in reserves; Circle's S-1 filings disclose a comparable yield-capture model at smaller scale.

The redemption question is operational, not theoretical. A customer holds tokens; the issuer holds Treasuries. The promise is one-to-one redemption on demand. In a run scenario the issuer must liquidate Treasuries faster than the redemption flow, in a market that may itself be stressed. No federal facility stands behind that liquidation. The 2023 [USDC depeg event](https://www.bloomberg.com/news/articles/2023-03-11/circle-s-usdc-stablecoin-breaks-1-peg-after-firm-discloses-svb-exposure), when Circle disclosed Silicon Valley Bank exposure and USDC fell to roughly $0.87 before the FDIC's SVB intervention, is the closest the system has come to testing the model under stress.

---

## What this instrument effectively removes

A dollar-pegged stablecoin, as it currently operates in the United States, has the structural effect of removing several obligations and protections that would attach to functionally similar dollar products under different legal descriptions:

- **FDIC deposit insurance.** A stablecoin balance is a claim on the issuer, not an insured deposit. Customer losses in an issuer failure are not covered by the [FDIC's $250,000 per-depositor guarantee](https://www.fdic.gov/resources/deposit-insurance/) that attaches to a bank checking or savings account holding the same dollar amount.
- **Money-market-fund disclosure and SEC oversight.** A fiat-reserved stablecoin economically resembles a [2a-7 money-market fund](https://www.sec.gov/rules/final/2014/33-9616.pdf) — short-duration assets, par-redemption promise — but is not regulated as one. Issuers are not subject to the SEC's portfolio composition rules, stress-testing requirements, or the disclosure regime applied to MMFs under Investment Company Act Rule 2a-7.
- **Bank-level reserve, capital, and liquidity requirements.** A stablecoin issuer holds no capital ratio under [Basel III](https://www.bis.org/bcbs/basel3.htm) as implemented in U.S. banking regulation. It is not subject to the Liquidity Coverage Ratio, the Net Stable Funding Ratio, or stress-testing under the Dodd-Frank framework.
- **Bank Secrecy Act and FinCEN reporting at the depositor level.** A bank that opens a deposit account collects customer identifying information under the [Customer Identification Program rule](https://www.fincen.gov/resources/statutes-regulations/cdd-final-rule). A stablecoin transferred between two self-custodied wallets generates no such record, and the BSA/FinCEN obligations of stablecoin issuers and intermediaries remain a contested perimeter the [GENIUS Act](/crypto/genius-act/) and 2025–2026 Treasury rulemakings are actively reshaping.
- **State money-transmitter consumer protections.** A stablecoin issuer holding a [national trust bank charter](/crypto/national-trust-bank-charter/) is exempt from the 50-state money-transmitter regime under which most issuers historically operated, and from the consumer-protection requirements those state regimes layer on top of federal law.

The list describes legal outcomes, not strategy. Whether the issuer or the policy architecture *intended* these removals is a separate question; the structural map is what it is.

---

## Legitimate use

Dollar-pegged stablecoins are now the dominant rail for dollar-denominated remittances in jurisdictions with capital controls or limited correspondent-banking access (Argentina, Turkey, Nigeria, Venezuela). They are the default settlement collateral in crypto-derivatives markets. They have become a non-trivial source of demand for short-duration U.S. Treasury bills — Tether and Circle's combined Treasury holdings exceed those of several mid-sized sovereign holders — and the U.S. Treasury Department, in its 2024 and 2025 Quarterly Refunding Committee minutes, has identified stablecoin-issuer demand as a structural support for the front of the Treasury curve. The mechanics described above operate the same way regardless of who the issuer is, how the reserve is supervised, or what dollar volume flows through any specific token. The policy question is about the supervisory perimeter, not about whether the instrument should exist.

## Why it's in the fight

Three threads converge on stablecoins in the 2025–2026 regulatory record.

**First, the GENIUS Act.** The [Guiding and Establishing National Innovation for U.S. Stablecoins Act](/crypto/genius-act/), signed into law in 2025, is the first federal statute to specifically regulate stablecoin issuance. The Act distinguishes "permitted payment stablecoin issuers" from unauthorized issuers, assigns supervisory authority to a combination of federal and state regulators depending on issuer type and size, and sets reserve-asset requirements. The statute's implementing rules are still being written. The substantive policy debate is whether the Act's reserve and supervision regime is sufficient to prevent a run that could propagate into the Treasury market, given that stablecoin issuers are now among the larger buyers of short-duration Treasury bills.

**Second, the OCC trust-bank cohort.** Between December 2025 and April 2026, the OCC conditionally approved [national trust bank charters](/crypto/national-trust-bank-charter/) for nine crypto-native applicants, several of them stablecoin issuers (Circle, Paxos, Ripple). The charter, as currently configured, permits stablecoin issuance and reserve custody under OCC supervision alone — outside the FDIC perimeter and outside CFPB direct examination.

**Third, USD1 and the WLTC application.** On January 7, 2026, WLTC Holdings — a subsidiary of [World Liberty Financial](https://capturecascade.org/actors/world-liberty-financial/), approximately 75% Trump-family controlled — applied for the same charter, with the proposed bank's sole purpose being issuance, redemption, and custody of [USD1](/crypto/usd1/), the Trump-family stablecoin. The application is, structurally, a test of whether the trust-bank chartering track applies to a sitting president's family financial vehicle. As of May 13, 2026, the OCC has not issued a preliminary decision, and Senator Elizabeth Warren has not received confirmation that the application discloses the approximately 49% [Aryam Investment 1](https://capturecascade.org/actors/aryam-investment/) stake — a UAE-state-linked holding that OCC regulations require to be disclosed.

**The policy question stablecoins raise is not whether private dollar-substitutes should exist — they do, and the technology is now load-bearing for a non-trivial share of dollar circulation outside the United States. The question is whether the supervisory perimeter applied to functionally similar dollar products — insured deposits, money-market funds, payments processors — should also apply to stablecoins, or whether the asset class is permitted to operate in a regulatory zone its size and function would not, in any other context, allow.** That question is being answered, in operational terms, by chartering decisions and rulemakings issued faster than the Senate Banking Committee can review them.

The Foreign Emoluments Clause (Article I, Section 9, Clause 8) is the constitutional provision that was intended to make a sitting president's family's issuance of a foreign-state-backed dollar substitute impossible. As of May 2026, no executive-branch or Article III enforcement of that clause has been mounted against WLFI or USD1. The architecture is on the record; the constitutional check designed to prevent it has not been invoked.

---

## Common confusions

- **Not the same as a central bank digital currency (CBDC).** A CBDC is a liability of the central bank — the digital equivalent of physical cash. The United States has no CBDC, and the 2025 Treasury policy direction explicitly forecloses one. A stablecoin is a liability of a private issuer.
- **Not the same as a cryptocurrency in the speculative sense.** Bitcoin, Ethereum, and the broader asset class fluctuate against the dollar by design. A stablecoin is engineered to *not* fluctuate. The two asset classes share infrastructure (wallets, exchanges, public blockchains) but have opposite economic functions.
- **Not the same as a tokenized bank deposit.** A bank-issued tokenized deposit is FDIC-insured, sits on the bank's balance sheet, and is regulated as a deposit. A stablecoin is not a deposit, regardless of how its marketing materials describe it.
- **Not all "stablecoins" are economically equivalent.** Tether, USDC, DAI, and a defunct algorithmic coin like UST share a name and a peg target but have radically different reserve models, transparency regimes, and failure modes. Treating "stablecoins" as a single asset class for policy purposes obscures the relevant differences.

---

## Where this shows up in the reporting

- *The Precedent Corridor: How the OCC Built a Trust-Charter Track for the President's Family* — the eight pre-WLTC conditional approvals, several of them stablecoin issuers, as precedent infrastructure.
- *The Rollback Wave* — the April 1, 2026 amendment to 12 CFR 5.20 as the sixth coordinated administrative action, removing the textual hook a court could have used to vacate a stablecoin-issuer trust-bank approval.

---

## Sources

**Primary Statute and Regulation:**

- Guiding and Establishing National Innovation for U.S. Stablecoins Act (GENIUS Act), Pub. L. 119-XX (2025)
- [12 CFR 5.20](https://www.ecfr.gov/current/title-12/chapter-I/part-5/subpart-A/section-5.20) — OCC national bank chartering regulation
- [Investment Company Act Rule 2a-7](https://www.sec.gov/rules/final/2014/33-9616.pdf) — SEC money-market fund regulation (functional comparator)
- [12 CFR 9](https://www.ecfr.gov/current/title-12/chapter-I/part-9) — Fiduciary activities of national banks

**Issuer Disclosures:**

- Tether reserve attestation reports (most recent quarterly attestation, BDO Italia)
- Circle Internet Financial S-1 filings (SEC EDGAR)

**Reporting and Reference:**

- *Circle's USDC Stablecoin Breaks $1 Peg After Firm Discloses SVB Exposure* (Bloomberg, March 11, 2023)
- *Tether reports $13 billion 2024 net income* (Financial Times, 2025 reporting)
- *The Crypto Story* — Matt Levine (Bloomberg Businessweek, October 2022) — long-form mechanical primer
- Cambridge Centre for Alternative Finance — *Global Cryptoasset Benchmarking Study* (most recent edition)

**Capture Cascade Context:**

- [Pattern — Regulatory Capture](https://capturecascade.org/tags/regulatory-capture/)
- [Event — Terra/Luna Collapse, May 2022](https://capturecascade.org/event/2022-05-09--terra-luna-collapse/)
- [Actor — World Liberty Financial](https://capturecascade.org/actors/world-liberty-financial/)
- [Actor — Aryam Investment 1](https://capturecascade.org/actors/aryam-investment/)

**Related concept pages:**

- [National trust bank charter](/crypto/national-trust-bank-charter/)
- [USD1](/crypto/usd1/)
- [GENIUS Act](/crypto/genius-act/)
