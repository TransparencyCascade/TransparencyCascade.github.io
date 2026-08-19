---
title: "What Is a Cryptocurrency?"
description: "A plain, operational introduction to cryptocurrency — what it is, how a transaction works, why holders are pseudonymous, and why the questions worth asking about it are about oversight and accountability, not about the technology itself. The starting point for the rest of this reference section."
date: 2026-05-14
lastmod: 2026-05-14
---

**Status.** Last reviewed 2026-05-14. This is the orientation page for the rest of this reference section. It covers only what a reader needs to parse our reporting; for deeper treatment of the technology itself, follow the outbound links.

**Definition.** A cryptocurrency is a digital asset recorded on a shared ledger that no single party owns or edits. Ownership is established by control of a cryptographic key, not by an account at an institution. Transfers settle directly between parties, are recorded permanently, and — once confirmed — cannot be reversed. There is no central administrator to call, no chargeback, no account freeze in the ordinary sense. Those properties are what make cryptocurrency useful for some purposes and consequential for others; the rest of this section is about the consequences.

---

## The mechanic

Strip away the marketing and a cryptocurrency is four things working together.

**A ledger.** Conventional money lives as entries in bank ledgers — your balance is your bank's record of what it owes you. A cryptocurrency lives as entries in a *shared* ledger, maintained simultaneously by many independent computers, with no single institution holding the master copy. The ledger is the asset. There is no coin; there is only the record of who controls what.

**A blockchain.** The shared ledger is updated in batches called blocks, each cryptographically linked to the one before it — a "blockchain." The linking is what makes the history hard to alter after the fact: changing an old entry would break every block since. This is why "who can update the ledger" is a real and contested question rather than a trivial one. The answer to that question is what proof-of-work and proof-of-stake (below) are about.

**A key, and an address.** Control of a cryptocurrency is control of a *private key* — a secret number. Whoever holds the key can move the asset; whoever does not, cannot, regardless of any other claim. The public counterpart of the key is an *address*, a string of characters that funds are sent to. An address is not a name. It is not tied, by the technology itself, to a legal identity. This is the single most important fact for our reporting: **cryptocurrency holders are pseudonymous by default.** Who holds a token, where they are, and what interest they represent is not disclosed by the instrument.

**Irreversible settlement.** Once a transaction is confirmed into the blockchain, it is final. There is no issuing bank to reverse it, no administrator to claw it back. Stated neutrally, this is a feature: settlement is fast and certain. Stated completely, it is also why fraud recovery is hard, why a stolen key is a total loss, and why the instrument is attractive for moving money that the sender does not want subject to reversal, freezing, or — in some cases — tracing.

None of this is an argument for or against the technology. It is the set of properties every later page in this section depends on.

---

## Coins, tokens, and the asset classes

"Cryptocurrency" is a single word covering instruments with little in common beyond the underlying ledger technology. The distinctions our reporting leans on:

- **A coin** is the native asset of its own blockchain — Bitcoin on the Bitcoin network, Ether on Ethereum. **A token** is an asset issued *on top of* an existing blockchain, using that blockchain's infrastructure. Most of the instruments in our reporting — stablecoins, memecoins, governance tokens — are tokens, typically on Ethereum or Solana.
- **Store-of-value coins.** Bitcoin is the canonical case: a fixed supply, no central issuer, valued primarily as something to hold. It does not promise a dollar value and fluctuates by design.
- **Smart-contract platforms.** Ethereum and Solana are blockchains that can run programs ("smart contracts"). They are the infrastructure most tokens are built on. The asset class includes the platform's own coin plus the ecosystem of tokens and applications running on it.
- **[Stablecoins](/crypto/stablecoin/).** Tokens engineered to hold a constant value against a reference asset — almost always the U.S. dollar — backed by a reserve. This is the asset class most of our regulatory reporting concerns.
- **[Memecoins](/crypto/memecoin/).** Tokens with no claim to utility or backing, valued purely on attention. The $TRUMP and $MELANIA coins are memecoins.
- **Governance tokens.** Tokens that confer voting rights over a crypto protocol's decisions. World Liberty Financial's WLFI token is a governance token; the [USD1](/crypto/usd1/) it governs is a stablecoin.

A reader who internalizes only one thing here: **these are different instruments with different mechanics, different risks, and different policy problems.** Treating "crypto" as one undifferentiated thing is the most common way the public conversation goes wrong.

---

## Proof-of-work and proof-of-stake

Because the ledger is shared and no institution owns it, a cryptocurrency needs a rule for *who gets to add the next block* — and a way to make cheating expensive. The two dominant answers are proof-of-work and proof-of-stake. The distinction matters to our reporting for two reasons: energy, and concentration.

**Proof-of-work** requires participants ("miners") to spend real computational effort — and therefore real electricity — competing to add each block. Bitcoin uses proof-of-work. The security model is that attacking the network would cost more in hardware and power than it could yield. The cost is literal: Bitcoin's annual electricity consumption is comparable to that of a mid-sized country, a figure tracked by the [Cambridge Centre for Alternative Finance](https://ccaf.io/) and the [Digiconomist Bitcoin Energy Consumption Index](https://digiconomist.net/bitcoin-energy-consumption/). Proof-of-work mining is now an industrial activity, concentrated among large firms — which is why publicly traded miners (MARA Holdings, others) appear in our reporting on appointee financial holdings.

**Proof-of-stake** replaces computational effort with financial stake. Participants ("validators") lock up a quantity of the cryptocurrency as collateral; the right to add blocks, and the rewards for doing so, scale with the amount staked. Ethereum moved from proof-of-work to proof-of-stake in 2022, cutting its energy use by an estimated 99%-plus. The security model is that a validator who cheats loses their stake. The structural tradeoff is concentration: **proof-of-stake ties influence over the network directly to wealth in the network.** Whoever holds the most stake has the most control — a property that matters when a single foreign-state-linked entity holds, for example, 49% of a governance token, as documented on the [USD1](/crypto/usd1/) page.

For deeper technical treatment of either mechanism, the explainers at [learnmeabitcoin.com](https://learnmeabitcoin.com/) and the Ethereum Foundation's documentation are good starting points. For our purposes, the operative facts are: proof-of-work costs energy and has produced an industrial mining sector; proof-of-stake costs less energy but binds control to wealth.

---

## Why this is a capture story, not a tech story

It would be possible to write about cryptocurrency purely as technology — and many good resources do. That is not what this section does, and the reason is the mission of this publication.

Transparency Cascade Press reports on **institutional capture**: the process by which the institutions meant to constrain private power are reorganized to serve it. Cryptocurrency enters that story not because the technology is good or bad, but because of three properties established above:

- It moves value **outside the banking system's supervisory perimeter** — the disclosure, examination, and consumer-protection regimes that apply to ordinary dollars do not automatically follow a token.
- It moves value **pseudonymously** — who is paying whom, and from what jurisdiction, is not disclosed by the instrument.
- It moves value **irreversibly** — settlement is final, which is a feature for legitimate commerce and an attraction for money that does not want to be subject to reversal or tracing.

A financial instrument with those three properties is not inherently a capture vehicle. It becomes one when it is held, issued, or regulated by people positioned to convert those properties into private advantage — and when the oversight machinery that would otherwise constrain it is dismantled or routed around. That is the story our reporting documents: not the technology, but the **systems that connect to it** — the regulators, the charters, the legislation, the disclosure rules, the conflicts of interest.

The rest of this section is the vocabulary for reading that story. The position throughout is consistent and worth stating plainly: cryptocurrency is a legitimate financial technology, and reasonable regulation of all currency and currency-exchange systems is a precondition for democratic accountability. The question worth asking about any crypto instrument is not whether it should exist — it is whether the oversight that applies to functionally similar instruments applies to it too, and if not, who benefits from the gap.

---

## Common confusions

- **"Cryptocurrency" is not one thing.** Bitcoin, a stablecoin, and a memecoin share ledger technology and almost nothing else — different mechanics, different backing, different risks, different policy problems. Most public confusion starts here.
- **"Decentralized" is a spectrum, not a fact.** A network can be decentralized in some respects (no single administrator) and highly concentrated in others (a few miners, or a few large stakeholders, holding effective control). When a project describes itself as "decentralized," the operative question is *decentralized in which respect, and concentrated in which*.
- **Pseudonymous is not the same as anonymous.** Blockchain transactions are public and permanent; addresses can sometimes be linked to identities through analysis. But the instrument does not *disclose* identity the way a bank account does — the burden is on an outside investigator, not built into the system.
- **A blockchain being "immutable" does not make what's recorded on it true.** The ledger reliably records that a transaction happened. It says nothing about whether the transaction was lawful, who really controlled the wallets, or what the payment was for.

---

## Where this shows up in the reporting

Every page in this section builds on the mechanics above. Our investigative reporting — on the World Liberty Financial trust-bank charter, the GENIUS Act, the crypto-holding appointee cluster — assumes a reader who understands that crypto holders are pseudonymous, that settlement is irreversible, and that "crypto" is a category of very different instruments. This page is where that understanding starts.

---

## Sources and further reading

**On the technology itself (outbound — not our core, but worth your time):**

- *The Crypto Story* — Matt Levine (Bloomberg Businessweek, October 2022) — the best long-form mechanical primer for adults
- [learnmeabitcoin.com](https://learnmeabitcoin.com/) — hands-on technical explainers
- [Cambridge Centre for Alternative Finance](https://ccaf.io/) — the citable data on crypto energy consumption and mining
- [Digiconomist Bitcoin Energy Consumption Index](https://digiconomist.net/bitcoin-energy-consumption/) — proof-of-work energy tracking

**Capture Cascade Context:**

- [Pattern — Regulatory Capture](https://capturecascade.org/tags/regulatory-capture/)

**Related concept pages:**

- [Stablecoin](/crypto/stablecoin/)
- [USD1](/crypto/usd1/)
- [Memecoin](/crypto/memecoin/)
- [The GENIUS Act](/crypto/genius-act/)
- [National trust bank charter](/crypto/national-trust-bank-charter/)
- [The OCC](/crypto/occ/)
- [The Crypto Cluster](/crypto/the-crypto-cluster/)
