---
title: "The Agent Is the User"
description: "We ran hallway usability testing on the AI agents doing our research, and asked them to file bug reports. Half of one repo's commit history came out of it — including a defect that would have attributed one federal contractor's money to another."
date: 2026-08-27
lastmod: 2026-08-27
draft: true
---

**Status.** Draft — hold until the Our Rescue investigation publishes. Last reviewed 2026-08-19.

---

A tool we built to keep us from publishing false things published a false thing to us.

It was a research client, three days old. Asked about a private-equity firm's federal appointees, it returned thirty-five rows. Every row was titled `(unnamed appointee)`. Every row pointed at the same URL. Thirty-five identical placeholders, presented as a successful broad result.

Nothing in the output said the data was wrong. It looked like a hit.

The agent that hit it did not shrug and move on. It wrote this down:

> **Friction:** looked like a broad successful hit. Nothing in the output said the data was wrong — this is exactly the silent-wrong-answer class the tool exists to prevent, appearing inside the tool.
> **Had to figure out:** that `--no-cache` returned correct data, which localised it to a poisoned cache entry rather than the parser.
> **Would have helped:** the tool refusing to cache a payload where every row shares one placeholder identity; and cached results disclosing their age.
> **Severity:** blocked

That is a usability bug report. It has an expected, a got, a diagnosis, a proposed fix, and a graded severity. It was written by the thing using the software.

## The claim

Software built for AI agents is mostly built the way software has always been built: for a human, with an API bolted on so a machine can reach it. The machine is treated as plumbing — a caller, an integration, a consumer of endpoints.

We think that is the wrong model, and we have spent a year finding out what happens when you reject it.

**Treat the agent as a user.** Not a client, not an integration — a user, with the whole apparatus that word implies. Users get error messages written for them. Users get documentation that answers what they actually ask. Users get *usability testing*, because the maintainer cannot see where they stumble and the only signal is what they report.

Agents stumble constantly. They almost never say so.

## Why agents are worse reporters than humans, and why that matters

A human who hits a confusing flag sighs, tries three things, and often tells someone. The sigh is signal. The complaint is signal. Even the abandonment is signal — people churn, and churn is measurable.

An agent does none of that. It reads the help text, infers a workaround, executes the workaround, and completes the task. The work gets done. The defect is invisible. Nobody churns, nobody complains, and the maintainer's dashboard shows a green run.

This is the failure mode we now design against, and it is written into the skill we use:

> A silent workaround is the most expensive failure mode. It hides the defect *and* costs you the detour. Report friction even when you routed around it, especially then: the fact that you *could* work around it is why nobody has fixed it yet.

The instruction sounds trivial. It is not. Left alone, a capable agent will route around almost any defect and hand you a finished result, and you will conclude your tooling is fine.

## Hallway testing, for agents

Hallway usability testing is the cheapest technique in the field: grab whoever is walking past, hand them the thing, watch where they stumble. No lab, no recruitment, no panel. The value is entirely in observing a real attempt by someone who was not there when you designed it.

So we wrote the agent version. Finish a task with a tool, then file what happened: the exact command copied not remembered, what you expected, what you got, where you stuck, what you had to look up, what would have saved you, what carried its weight, and a severity — **blocked, slowed, annoyed, cosmetic**.

Three rules did the heavy lifting, and each came from getting it wrong first.

**Copy the command, do not reconstruct it.** Two agents independently reported that a tool "exits 0 on failure." It does not. They had piped output to `head`, so the exit code they read was `head`'s. The lesson generalizes past agents: separate what you *observed* from what you *concluded*, because a confident wrong diagnosis costs more than a vague right one.

**Commit your own entry.** An agent assumed a maintainer would fold its report in later and left three entries — forty-five lines of field data — uncommitted, one crash from gone. A report is only evidence once it is durable.

**Missing capability is a finding.** "This beat needs X and the tool has no X" is worth as much as a bug. Several sources now in the tool exist because an agent said it needed one.

## What it produced

One repository, one month, thirty-four entries from seven different model identifiers. Forty-four graded severities: two blocked, twenty-six slowed, sixteen annoyed.

Thirteen of that repository's sixty-five commits exist to record those entries. Twenty-six more are fixes and documentation corrections, six of them tracked directly to a report and marked resolved in the log itself. **Half the commit history is either the field notes or the repairs they caused.**

The sharpest one arrived within an hour of a command shipping. The tool queries federal contracting records; a `--detail` flag fetches one award by its identifier. An agent noticed that `--detail` silently ignored the search query sitting next to it.

Pass a mistyped vendor name with a valid award ID and you get **a different company's record**, with no warning.

On a beat that reports where federal money goes, that is a defect that attributes one contractor's contract to another. It would have produced a correction, or worse, a retraction. It was not a crash, it violated no test, and it would have survived indefinitely, because the tool did exactly what it was told and the output looked right.

The maintainer's commit message names the real cause:

> The cause was my CLI design — I bolted `--detail` onto a subcommand with a required positional query it does not use.

That is a usability defect producing a correctness failure. Unit tests do not find those. Users do.

## The counter-argument

"You are not testing usability. You are prompting a language model to generate plausible bug reports."

It is a fair objection and the numbers answer it. The reports are reproducible: each carries the literal command, and the maintainer re-ran them. They are falsifiable, and some were falsified — the `exits 0` report was wrong, diagnosed, and the correction became a rule. They produced code, not sentiment: six defects tracked to a specific report and marked fixed in the log. And they surfaced things a human tester would have missed, because a human would not have run twelve parallel workers against one shared rate limiter and discovered the contention.

The stronger version of the objection is that this only shows agents are good at *writing bug reports*, not that they are *users*. We would accept a narrower claim: agents are a user population whose friction is invisible by default and becomes visible for the price of asking. Whether that makes them users in the full sense is a philosophical question. The commits do not care.

## What it changes about how you build

If the agent is a user, some things follow that are not obvious from the plumbing model.

**Errors are interface.** A traceback is not an error message to something that must decide whether to retry, change approach, or stop. Typed errors are not a nicety; they are the difference between an agent recovering and an agent inventing a workaround you never see.

**Exit codes are interface.** In our search client, an unhandled crash used to exit with the same code as a verified negative finding — and the README told callers to treat that code as "publishable." A crash could have been read as a certified finding. We only caught it because a reader traced the code path as a caller would.

**Documentation is interface, and it is instruction rather than reference.** The file an agent reads before acting has more leverage than the file it reads after. We found a rule about protecting investigative subjects living in the log agents *append to* rather than the guide they *read first* — which meant the instruction arrived after the mistake.

**Ask.** The whole technique is one instruction attached to the end of a task. It is the cheapest thing in this essay and it produced the most.

## Why a newsroom is writing this

Transparency Cascade Press is an investigative outfit. We report on institutional capture — where federal money goes, who ends up holding it, and which accountability channel quietly closed while nobody was looking.

That work runs on infrastructure that did not exist, so we built it: a knowledge base where every claim traces to the commit that introduced it, and a research client that distinguishes *we searched properly and it is not there* from *the door was shut in our face*. Both are open source. Both are used, daily, against live reporting.

And both are largely built by agents. One of those repositories has a single human author and 667 of 691 commits carrying an agent co-author. If we are going to work that way — and we are — then the quality of that work depends on whether the tools are any good for the things doing it.

Which is a usability question. So we ran usability testing.

---

*The skill is open source, and works against any tool: [ramm-agent-skills](https://github.com/markramm/ramm-agent-skills). The research client and its full feedback log are at [cascade-search](https://github.com/markramm/cascade-search) — thirty-four entries, unedited, including the ones that were wrong.*
