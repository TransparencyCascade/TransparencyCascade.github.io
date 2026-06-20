---
title: "Make Yourself Expensive: Shrinking Your Data Footprint"
description: "A practical, sourced field guide to reducing your exposure to the surveillance economy — what actually works, what is oversold, and how individual privacy hygiene becomes collective power. Why removing your data from brokers is the highest-leverage move, why free do-it-yourself beats the paid services, and what the privacy tools really protect."
date: 2026-06-20
lastmod: 2026-06-20
---

**Status.** Last reviewed 2026-06-20. **Next review trigger:** a material change to the Consumer Reports data-removal study, the status of the *Fourth Amendment Is Not For Sale Act* or surveillance-advertising legislation, or any tool below changing ownership, pricing, or privacy policy. Privacy tooling moves fast; if you are reading this long after the date above, treat the specific product names as a starting point and verify before relying on them.

---

In the summer of 2025, a man assassinated the Speaker of the Minnesota House, Melissa Hortman, and her husband in their home. When investigators searched his vehicle, they found a notebook. In it was a list of eleven people-search and data-broker websites — Spokeo, TruePeopleSearch, Intelius among them — annotated with what each one cost and what information each one required. Beside that list was a roster of more than forty officials. Next to Hortman's name was her home address.

The brokers did not pull the trigger. They sold the man the door.

This is the part of the surveillance story that usually gets left out, because it doesn't fit on a screen. We talk about algorithms and feeds and AI as if the harm were abstract. But the same infrastructure that decides which posts you see also assembles, packages, and sells the precise coordinates of your life to anyone with a credit card — including the government. **The data broker is the hinge between the abstract surveillance you feel and the physical harm you don't see coming.**

So when readers ask, after the reporting, *what can I actually do?* — this is the honest answer. Not "nothing, the system is too big." And not "download these five apps and you're safe," which is a lie the privacy industry is happy to sell you. The honest answer is a strategy, and it starts with understanding what kind of business you're up against.

## Surveillance is a volume business

The companies doing this don't make money off you specifically. They make money off *everyone*, at scale, cheaply. The whole apparatus runs on volume economics: collect everything, sell it in bulk, keep the marginal cost of each record near zero. That's the weakness. **You don't have to make the surveillance machine blind. You just have to make it expensive.**

Every record you remove raises their cost to supply you. Every percentage point of accuracy you degrade raises their cost to use you. Every assertion of refusal you put on the record raises their cost to ignore you. None of these, alone, frees you. Together, they're a margin squeeze on a market that only works because the margins are thin.

That's the frame. Here is the field guide — five moves, from what you can do this afternoon to what we have to build together.

---

## Move 1: Remove your data (and the surprise about how)

This is the highest-leverage thing an individual can do, because broker data is what feeds everything downstream — the government purchases, the targeting, the notebook in the killer's car.

Here is the surprise, and it is well-documented. In 2024, *Consumer Reports* (working with the security firm Tall Poppy) ran a controlled study of paid data-removal services — the ones advertised on every podcast. Over four months, [the paid services as a group removed only about 35% of participants' personal records](https://innovation.consumerreports.org/new-report-data-defense-evaluating-people-search-site-removal-services/), and the report's blunt conclusion was that doing it yourself is more effective than the services. Submitting opt-outs by hand removed **70%** of records. Exactly one paid service kept pace — Optery, at 68%, essentially tying the manual effort — with EasyOptOuts close behind around 65%. The rest trailed badly; the worst names you would recognize cleared single digits. So the honest takeaway is not "every service is useless," it is sharper than that: **the free do-it-yourself route matches the single best paid service and beats all the others** — and the marketing spend and the removal rate are, if anything, inversely correlated.

**What does it actually do?** It removes you from the people-search sites that resell your address, relatives, and phone number. **What does it not do?** It does not reach every broker, and the sites re-scrape and re-list you, so this is maintenance, not a one-time fix. Do it, then do it again in a few months.

**The free tools that make this doable:**

- [**Permission Slip**, from Consumer Reports](https://www.consumerreports.org/electronics/privacy/take-control-of-online-data-with-apps-a5151057853/) — a free iOS and Android app. You swipe through companies and tap to send "do not sell" and deletion requests. The same nonprofit that proved the paid services underperform built a free tool that does the work. Start here.
- For the technically comfortable, open-source projects exist that batch and automate removal requests across hundreds of brokers — search current ones rather than trusting a name from a guide, since these tools change hands and quality varies; the [Privacy Guides community](https://www.privacyguides.org/) is a reliable place to find a currently-maintained one.
- The community-maintained [**"Big Ass Data Broker Opt-Out List"**](https://github.com/yaelwrites/Big-Ass-Data-Broker-Opt-Out-List) is the canonical do-it-yourself map — kept current by regular people as brokers change their forms.

The political point hiding here: **the nonprofit and open-source world already built the public-good version. The subscription services are selling you something that is free and, on the evidence, worse.**

---

## Move 2: Shrink your footprint (and the honest limits)

These are the baseline switches everyone should make. Each comes with what it *doesn't* do, because that is exactly where the privacy industry misleads you.

**Email — Proton over Gmail.** Gmail's business model is reading you; Proton's is not, and your message contents are end-to-end encrypted. That is a real upgrade. But — and the Freedom of the Press Foundation is blunt about this — [Proton "is simply not made to protect your identity."](https://freedom.press/digisec/blog/proton-mail-is-not-for-anonymity/) It operates under Swiss law and can be compelled to hand over the data it does hold: IP logs, payment information, your recovery email. It has done exactly that, including in documented activist cases. **Proton fixes the content and the business model. It does not make you anonymous.**

**Messaging — Signal.** Many apps encrypt your messages now. The reason [Signal](https://ssd.eff.org/) is the standard is not just content — it is *metadata*. Signal is built to collect and keep almost none of it. WhatsApp uses the same encryption but is owned by Meta and harvests the metadata around your messages. *What* you said versus the record of *who you talked to, when, and how often* — that second thing is often more revealing, and Signal is designed not to have it.

**Browser — Firefox, hardened, for most people.** It is independent, built by a nonprofit, not Chromium-based, and has no crypto side-business. Turn on Enhanced Tracking Protection and you are most of the way there. Brave blocks more aggressively by default and scores well on privacy tests — but know its baggage: [in 2020 it was caught silently inserting its own affiliate codes into the crypto-exchange URLs users typed](https://www.coindesk.com/business/2020/06/08/brave-browsers-affiliate-link-controversy-explained), which it apologized for and corrected, and it still runs a cryptocurrency rewards scheme. Both are reasons to know what you are installing, not necessarily to avoid it. For maximum anonymity, that is Tor's job.

**Search — DuckDuckGo or Startpage over Google.** Better, with an asterisk: DuckDuckGo was [caught allowing some Microsoft trackers to run](https://techcrunch.com/2022/08/05/duckduckgo-microsoft-tracking-scripts/) in its browser under a search deal, then changed it after backlash. Better than Google. Not immaculate.

**VPNs — mostly oversold.** A VPN hides your browsing from your internet provider and encrypts your traffic in transit. That is it. It does *not* make you anonymous, does *not* stop tracking that doesn't rely on your IP address, and does *not* protect you from malware or phishing. It moves your trust from your internet provider to the VPN company — which sees all your traffic. *Consumer Reports* found [12 of 16 VPNs made misleading claims](https://www.consumerreports.org/vpn-services/) like "complete anonymity." If you use one, the vetted picks are Mullvad, IVPN, and Mozilla VPN. But do not mistake a VPN for a force field.

---

## Move 3: Build the capability (this is where it stops being about you)

Here is the lever the 70%-versus-35% finding actually points to. If doing it yourself works better than paying, then the thing standing between most people and real protection is not a product. **It is an hour of someone's time and knowing where to start.**

That is a solvable problem, and a *collective* one. The opt-out treadmill is a tax the broker market imposes on your attention — and the way you lower a tax for everyone is to teach people to do the thing, together.

This is the part of the work that happens in church basements and library meeting rooms and union halls — the face-to-face resistance the surveillance machine is worst at fighting. An algorithm can flood a forum with a thousand convincing posts. It cannot sit down next to your neighbor and walk her through a data-broker opt-out. People can.

You do not have to invent this. The infrastructure exists:

- The **Electronic Frontier Foundation** runs [Surveillance Self-Defense](https://ssd.eff.org/) and security trainings built for at-risk communities — the model for a local data-detox clinic.
- EFF's annual **"Opt-Out October"** is a ready-made campaign to localize.
- Permission Slip and the Big-Ass list are your curriculum.

Don't just protect yourself. Host the room where ten of your neighbors protect themselves, and send each of them home able to teach ten more.

---

## Move 4: Close the loophole (the law the brokers count on you ignoring)

Everything so far is defense. But there is a specific legal hole that makes the government-surveillance side of this possible, and it can be closed.

In 2018, the Supreme Court ruled in *Carpenter v. United States* that the government needs a **warrant** to obtain long stretches of your phone's location data — even though a third party (your carrier) holds it. It was a genuine crack in the old rule that anything you hand a company loses its constitutional protection.

Here is the hole: *Carpenter* limits what the government can *compel*. It says nothing clear about what the government can *buy*. So agencies buy it. [Federal agencies have purchased Americans' location, utility, and flight records from data brokers](https://www.brennancenter.org/our-work/research-reports/closing-data-broker-loophole) without warrants — the data laundered through a middleman, the warrant requirement evaporating. Immigration enforcement has used broker purchases specifically as a way *around* sanctuary-law limits.

There is a model for closing this exactly — the **Fourth Amendment Is Not For Sale Act**, which would ban the government from buying the data it would otherwise need a warrant to get. The House [passed it with a bipartisan majority, 219–199, in April 2024](https://www.aclu.org/press-releases/house-passes-fourth-amendment-is-not-for-sale-act); the Senate never took it up, and when that Congress ended the bill died with it. As of this writing it has not been reintroduced. That it cleared the House once, on a bipartisan vote, and then simply lapsed is the whole story in miniature: the fix is popular, written, and proven votable — and it is sitting on the shelf for lack of pressure. The loophole is a *choice*, and choices can be pressured.

**And there is a move you can make right now that is more than symbolic.** Asserting your non-consent explicitly — telling platforms and data collectors, on the record, that you do not agree to this — is not a magic spell that creates a constitutional right. Do not let anyone tell you it is. But it is a *signal of refusal*, and we have watched refusal signals become law. The "Global Privacy Control" — a browser setting that says "do not sell my data" — began as a voluntary, symbolic flag with no legal force. Then California made honoring it mandatory, and [the state's first major privacy enforcement action, a $1.2 million settlement with Sephora](https://oag.ca.gov/news/press-releases/attorney-general-bonta-announces-settlement-sephora-part-ongoing-enforcement), was for ignoring those signals. Symbolic to enforceable, in a few years.

So when you assert non-consent, you are doing three real things: building the record that your data was never given *voluntarily* (the soft spot in the law the brokers rely on), raising awareness, and adding to the pressure that shifts what courts treat as a "reasonable expectation of privacy." That standard is not fixed. *Carpenter* moved it. You are not claiming a right you do not have. You are doing the thing that creates it.

---

## Move 5: Turn off the engine (the upstream fix)

The opt-out treadmill exists because there is an industry whose entire product is the surveillance that generates the data. You can spend the rest of your life removing yourself from brokers who re-list you next quarter — or the law can ban the business model that makes the data in the first place.

That is what surveillance-advertising legislation does. The **Banning Surveillance Advertising Act**, introduced in Congress, would [prohibit advertisers from targeting you using your personal data](https://iapp.org/news/b/us-lawmakers-introduce-banning-surveillance-advertising-act) — explicitly including data bought from brokers — while still allowing ads based on what you are actually reading. It attacks the supply at its source. It has been introduced, not passed; it is the model for the fix, not yet the fix. Knowing it exists is the first step to demanding it.

---

## What this adds up to

Start this afternoon: download Permission Slip, do an opt-out pass, switch your email and your default search. Tell yourself the truth about the limits — none of these tools is a force field, and anyone selling you one is selling you something.

Then go past yourself. Teach a room of neighbors to do what you just did. Learn the name of the bill that would close the loophole, and the one that would turn off the engine, so that when the moment comes to push, you are not starting from zero.

The surveillance economy runs on one thing: the cheap, frictionless, unconsented harvest of human life as data. The way you fight an extraction economy is not by perfecting your own hygiene. It is by raising the cost of extraction until it is not worth it, and by demanding the law that makes it illegal.

The resistance to this is going to be physical and relational — face to face, in rooms, between people who can do for each other what no algorithm can do for anyone. The tools buy you a little room. Teaching multiplies it. And the politics, eventually, closes the door.

Make yourself expensive. Then go make the whole thing expensive, together.

---

## Where this connects to our reporting

This guide is the practical companion to our reporting on data colonialism and the surveillance economy — the detention-and-datacenter buildout, the data-broker-to-government pipeline, and the recordless rooms where the people who build the apparatus meet the officials who are supposed to govern it. The harm is documented; this page is what to do about it.

## Sources

- [Data Defense: Evaluating People-Search Site Removal Services](https://innovation.consumerreports.org/new-report-data-defense-evaluating-people-search-site-removal-services/) (Consumer Reports, 2024) — the 35%-paid vs. 70%-DIY finding
- [Proton Mail Is Not for Anonymity](https://freedom.press/digisec/blog/proton-mail-is-not-for-anonymity/) (Freedom of the Press Foundation)
- [Brave Browser's Affiliate Link Controversy](https://www.coindesk.com/business/2020/06/08/brave-browsers-affiliate-link-controversy-explained) (CoinDesk, 2020)
- [DuckDuckGo removes carve-out for Microsoft tracking scripts](https://techcrunch.com/2022/08/05/duckduckgo-microsoft-tracking-scripts/) (TechCrunch, 2022)
- [What Consumer Reports found about VPNs](https://www.consumerreports.org/vpn-services/) (Consumer Reports)
- [Closing the Data Broker Loophole](https://www.brennancenter.org/our-work/research-reports/closing-data-broker-loophole) (Brennan Center for Justice)
- [House Passes Fourth Amendment Is Not For Sale Act](https://www.aclu.org/press-releases/house-passes-fourth-amendment-is-not-for-sale-act) (ACLU)
- [Attorney General Bonta Announces Settlement with Sephora](https://oag.ca.gov/news/press-releases/attorney-general-bonta-announces-settlement-sephora-part-ongoing-enforcement) (California Department of Justice) — Global Privacy Control enforcement
- [US Lawmakers Introduce Banning Surveillance Advertising Act](https://iapp.org/news/b/us-lawmakers-introduce-banning-surveillance-advertising-act) (IAPP)
- [EFF Surveillance Self-Defense](https://ssd.eff.org/) — the canonical free guide
- [Permission Slip by Consumer Reports](https://www.consumerreports.org/electronics/privacy/take-control-of-online-data-with-apps-a5151057853/) — free opt-out app
- [Big Ass Data Broker Opt-Out List](https://github.com/yaelwrites/Big-Ass-Data-Broker-Opt-Out-List) — community do-it-yourself map

---

*Adheres to our [editorial policies](/about/editorial-policies/). Corrections and source questions: [contact@transparencycascade.org](mailto:contact@transparencycascade.org).*
