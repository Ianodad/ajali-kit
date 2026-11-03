# Ajali Kit: 3-day hackathon build plan

Meta Global AI Developer Hackathon (Cerebral Valley), Indie track.
Builder: Ian Adera (Nairobi, EAT, UTC+3). Builds with Claude Code (Opus leads, Sonnet works).
Written: Sun Nov 1, 2026, about 8:45 AM EAT.

## 1. The deadline, in Ian's time

| What | Official time | Ian's time (EAT) | Source |
| --- | --- | --- | --- |
| Project submission due | Wed Nov 4, 9:00 PM ET | Thu Nov 5, 5:00 AM EAT | Event page schedule and host emails |
| Last day to claim the $150 Meta Model API credits | Wed Nov 4, 9:00 PM ET | Thu Nov 5, 5:00 AM EAT | Host email, Oct 26 |
| Judging | Nov 4 to Nov 8 | | Event page schedule |
| Closing ceremony, winners | Nov 9 | | Event page schedule |

**Our internal deadline: submit by Wed Nov 4, 10:00 PM EAT.** That leaves 7 hours of buffer for upload problems, a broken deploy, or a power or network cut. Do not plan around any grace period.

Time left from now: about 92 hours. Realistic focused build time: about 30 to 36 hours, given sleep, work and other deadlines (UNICEF closes Mon Nov 2, Claude Max renews Nov 3).

## 2. How the project is judged (from the official rules)

| Criterion | Weight | What it means for Ajali Kit |
| --- | --- | --- |
| Impact | 30% | Real problem, real users. Kenyan motorists lose days and money assembling claim packs. Say it plainly in the video, with Ian's insurance background as the reason he knows the pain. Must fit a theme: "Build for Your World" fits exactly. |
| Use of Meta AI tooling | 25% | Go beyond one chat call. Muse Spark finds and labels damage (with box coordinates), SAM 3.1 turns those boxes into pixel-accurate masks, Muse Spark reads documents into structured JSON, and Muse Spark checks the story against the photos for contradictions. That chain is the "unexpected capability". |
| Technical depth and execution | 20% | Clean, typed, tested pipeline. Mock mode, retries, error states, local-first storage. |
| Demo | 25% | Live app that holds up, plus a high-quality demo video. The demo is a quarter of the score, so Day 3 is mostly demo. |

Indie track summary on the event page: "Judged on creativity, technical ambition, and whether it works."

## 3. Scope

### MVP (must ship, this is what the demo shows)

1. **Safety first screen**: are you safe, anyone hurt, emergency numbers, then start a claim.
2. **New incident**: time and GPS location captured automatically, editable.
3. **Guided damage photos**: a shot list (wide shots of both cars, close-ups of damage, other car's plate, scene). Photos stay on the phone.
4. **AI damage analysis on each damage photo**:
   - Muse Spark (`muse-spark-1.3`) finds each damaged area, names the car part, the damage type and an indicative severity, with a box.
   - SAM 3.1 (`sam-3.1`) segments the whole vehicle (concept prompt "car") and refines each damage box into a precise mask (box prompts).
   - The app shows a coloured mask overlay and a damage list, and the user can confirm, edit or remove each item.
5. **Other party and documents**: photograph the other driver's licence, logbook or insurance certificate, and Muse Spark extracts the fields into a form the user checks.
6. **Police report helper**: guidance, plus fields for the OB number, station, officer and date.
7. **Witnesses**: name, phone, short statement (typed).
8. **Claim draft**: Muse Spark writes a factual first-person account, a damage schedule, a missing-items checklist and consistency warnings (for example "you said you were hit from behind, but damage is on the front").
9. **PDF claim pack**: cover page, incident details, account, annotated photos with masks, damage schedule, other party, police, witnesses, checklist, declaration.
10. **Share**: device share sheet (Web Share API with the PDF file), download, or email with a prefilled subject.
11. **Mock mode**: every AI call has a fixture response, so the UI can be built and demoed without spending credits or when the API is down.

### Stretch (only after MVP is deployed and the demo is recorded once)

In priority order:
1. Voice statement: record the driver's account and transcribe it (Muse Voice Transcribe or Muse Spark audio input; check docs first).
2. Privacy redaction: SAM 3.1 concept prompts "face" (bystanders) and optionally "license plate" for a shareable public copy of photos.
3. Walk-around video: SAM 3.1 video tracking of the damaged car in a 10 second clip.
4. Swahili: draft the account in Swahili or English, and accept a Swahili statement.
5. Insurer view: a read-only claims officer page with a triage summary (needs server storage, so it is last).
6. Offline queue: capture offline, run AI when back online.

### Not in scope (say so in the write-up)

- Repair cost estimates or claim values. The app never invents prices.
- Liability decisions. The app records facts. It does not decide who was at fault.
- Direct submission into any insurer system. The pack is shared by the user.
- User accounts and login.
- Payments of any kind.

## 4. Day-by-day plan

Times are EAT. Blocks are targets, not promises. Each block ends with something Ian can see working.

### Day 0: Sun Nov 1 (today), setup and skeleton

| Block | Who | Tasks | Done when |
| --- | --- | --- | --- |
| Now to 11:00 | Ian | 1. Claim the $150 credits through the Meta credits form (Ian himself, per host rules). 2. Sign in to the Meta Model API dashboard, add a card (required before any API call works), set a spend-limit notification at about $100. 3. Create an API key and put it in `.env.local` as `MODEL_API_KEY`. Never paste it into chat. | Key works with a one-line curl test (see SPEC section 10.1). Credits may arrive in batches, so check the Billing page. |
| 11:00 to 13:00 | Claude Code | Phase 0 and Phase 1 of SPEC section 14: scaffold the Next.js PWA, mock mode, design tokens, app shell, local storage. | `npm run dev` shows the home screen on Ian's phone over the local network. |
| 14:00 to 17:00 | Claude Code | Phase 2: safety screen, new incident, guided photo capture, photo storage. | Ian can create an incident and take 6 photos that survive a page reload. |
| 17:00 to 19:00 | Claude Code + Ian | Phase 3a: real API smoke tests in `scripts/` (one Muse Spark image call, one SAM concept call, one SAM box call) on 3 test car photos. | Scripts print parsed damage JSON and mask counts. Cost of the day noted from the Billing page. |
| Evening | Ian | Collect demo photos: a real damaged car (his own, a friend's, or a garage that agrees). Get consent from anyone whose car, plate or face is in shot. Also photos of a sample licence and logbook that are Ian's own or clearly fake. | 10 to 20 usable photos in `demo-assets/` (not committed if they contain real personal data). |

### Day 1: Mon Nov 2, the AI pipeline (core of the score)

Note: UNICEF closes today. Ian should block the time he needs for that first.

| Block | Who | Tasks | Done when |
| --- | --- | --- | --- |
| Morning | Claude Code | Phase 3b: `/api/analyze-photo` (Muse Spark damage JSON), `/api/segment` (SAM concept and box prompts), parser integration, mask overlay on canvas. | A damage photo shows coloured masks and a labelled damage list within about 10 seconds. |
| Midday | Claude Code | Phase 3c: damage review screen (confirm, edit, delete, add a missed area by drawing a box, which goes to SAM as a box prompt). | User corrections are saved and shown in the list. |
| Afternoon | Claude Code | Phase 4: document capture and `/api/extract-document` (licence, logbook, insurance certificate) with structured output; other party form; police helper; witnesses. | Photo of a document fills the form, and every field is editable. |
| Evening | Ian | Test the whole flow on his phone at least twice. List bugs in `BUGS.md`. | Bug list exists, ranked. |

### Day 2: Tue Nov 3, claim draft, PDF, share, deploy

Note: Claude Max renews today. If Claude Code access drops, switch to Codex using the same SPEC and CLAUDE.md.

| Block | Who | Tasks | Done when |
| --- | --- | --- | --- |
| Morning | Claude Code | Phase 5: `/api/draft-claim` (account, damage schedule, checklist, consistency warnings), review screen. | Draft appears, editable, with warnings shown. |
| Midday | Claude Code | Phase 6: PDF claim pack (client-side), share sheet, download, email. | A PDF with annotated photos opens on the phone and shares to another app. |
| Afternoon | Claude Code | Phase 7: polish (loading states, error states, empty states, icons, splash), fix BUGS.md top items, README. | Whole flow runs end to end with no dead ends. |
| Evening | Ian | Deploy to Vercel (Ian runs the deploy; set `MODEL_API_KEY` in Vercel env vars; no Observability Plus). Test the live URL on his phone on mobile data. | Live URL works on mobile data. |

### Day 3: Wed Nov 4, freeze, demo, submit

| Block | Who | Tasks | Done when |
| --- | --- | --- | --- |
| 08:00 to 12:00 | Claude Code | One stretch item only if MVP is solid (voice statement or privacy redaction). Otherwise bug fixes. **Code freeze at 12:00.** | Freeze tag in git (local). |
| 12:00 to 16:00 | Ian | Record the demo video (script in SPEC section 12). Two takes, pick the best, add captions. | Video file under the length the form asks for (check the form; target 2 to 3 minutes). |
| 16:00 to 19:00 | Ian | Write-up, screenshots, architecture diagram, repo README. Make the repo visible if the form asks for a public repo (Ian decides and pushes himself). | All submission items ready in one folder. |
| 19:00 to 22:00 | Ian | Fill the submission form at the Cerebral Valley portal, review, press submit himself. | Confirmation screen or email saved. |
| 22:00 to 05:00 Thu | Buffer | Only for emergencies. | |

## 5. What to cut if time runs short

Cut in this order (first cut first):
1. All stretch items.
2. Insurance certificate extraction (keep licence and logbook only, or make all documents manual entry with a "scan" button that pre-fills only the licence).
3. User-drawn boxes for missed damage (keep confirm and delete only).
4. Email sharing (keep the share sheet and download).
5. Consistency warnings in the claim draft (keep the account and checklist).
6. The "car" vehicle mask and damage-area percentage (keep damage masks only).

**Never cut**: the Muse Spark plus SAM 3.1 damage step with visible masks, the PDF, mock mode, and the demo video. Those carry Use of Meta AI tooling (25%) and Demo (25%).

Hard checkpoints:
- **Mon Nov 2, 20:00 EAT**: if masks are not showing on real photos, stop adding features and fix only the pipeline on Tuesday morning.
- **Tue Nov 3, 20:00 EAT**: if the PDF is not working, ship a printable HTML claim pack page instead (browser Print to PDF).
- **Wed Nov 4, 12:00 EAT**: code freeze, no matter what.

## 6. Demo video and submission checklist

The exact submission form fields were not visible without signing in (see "Unverified" below). Prepare all of these so any form is covered:

- [ ] Project name: Ajali Kit
- [ ] One-line tagline (for example: "Your motor claim pack, built at the roadside in ten minutes.")
- [ ] Short description (about 100 words) and a longer write-up (problem, who it is for, how it works, Meta models used and how, what is next)
- [ ] Track: Indie developer
- [ ] Theme: Build for Your World
- [ ] Demo video (target 2 to 3 minutes, 1080p, captions on, see SPEC section 12)
- [ ] Live demo URL (Vercel), tested on mobile data
- [ ] Code repository link (Ian decides public or private and pushes himself)
- [ ] README with setup steps, env vars, and the model list
- [ ] Architecture diagram (one image)
- [ ] 3 to 5 screenshots
- [ ] List of Meta tools used: Muse Spark 1.3 (vision, structured output), SAM 3.1 (concept and box prompts), plus Muse Voice Transcribe if the stretch ships
- [ ] Team members listed (solo, so just Ian)
- [ ] Confirm the work was built during the event and any open source used follows its license (rules require original work; open source is allowed if licenses are followed)
- [ ] Sample PDF claim pack (made from demo data, no real personal data)

## 7. Risks and how we handle them

| Risk | Likelihood | Impact | Plan |
| --- | --- | --- | --- |
| Credits not claimed in time, or arrive late (distributed in batches) | Medium | High | Ian claims today. Mock mode lets building continue without credits. |
| API calls fail until a card is on the account | High if skipped | High | Ian adds the card and a spend-limit notification today. Budget is small (see below). |
| Unexpected charges above $150 | Low | Medium | Spend-limit notification at about $100. Use mock mode during UI work. Log token usage per call. |
| SAM 3.1 hosting | Low | n/a | No hosting needed. SAM 3.1 is served by Meta Model API (`sam-3.1` on `/v1/responses`). No GPU, no self-hosting. |
| SAM concept prompts like "dent" find nothing | Medium | Medium | Main path does not rely on that. Muse Spark gives boxes, SAM refines them with box prompts. A zero-match result is a valid empty result, not an error. |
| Muse Spark boxes are loose or wrong | Medium | Medium | User reviews every item, can delete or draw a box. Show severity as "indicative only". |
| Vercel request size limits for photos | Medium | Medium | Compress on the phone to max 1600 px JPEG before upload (well under limits). |
| Serverless timeouts on slow calls | Medium | Medium | Set route `maxDuration`, stream SAM responses, run per-photo calls in parallel with a limit of 3. |
| Poor network at demo time | Medium | High | Record the video in good conditions. Keep a "demo incident" fixture that loads instantly. |
| Claude Max renewal on Nov 3 interrupts Claude Code | Low | High | Codex fallback with the same CLAUDE.md and SPEC.md. |
| Personal data in demo photos | Medium | Medium | Use Ian's own documents or obviously fake ones. Get consent for plates and faces. Never commit real data. |
| Looks like Britam work | Low | Medium | Do not use the Britam name, logos, forms or internal knowledge. Use generic insurer wording. |

**Budget estimate (from the published price list, check the Billing page as you go):**
- Muse Spark 1.3 Standard mode: $1.25 per million input tokens, $4.25 per million output tokens. A 1280 px photo is about 1,300 to 1,500 input tokens. One damage analysis call is roughly 3,000 input and 1,000 output tokens, about $0.01.
- SAM 3.1: $2.50 per 1,000 images, so $0.0025 per image call.
- One full claim (6 damage photos x [1 Muse Spark + 2 SAM calls], 3 document reads, 1 claim draft) is roughly $0.10 to $0.20.
- Expected total for the whole hackathon, including testing: under $20 if mock mode is used for UI work.

## 8. Unverified items and open questions

- **Submission form fields** (video length limit, whether the repo must be public, write-up length): the portal at cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit needs sign-in. Ian should open it today and check. The Discord may also have details.
- **Ajali Kit application text**: not found in Gmail (the application was a web form). The spec is based on the known one-line pitch ("a Muse Spark plus SAM 3.1 motor-claim pack assistant"). Ian should check the spec still matches what he wrote.
- **Kenyan claim rules** (police reporting time limits, exact documents each insurer asks for, emergency numbers): written as general guidance in the app with "check with your insurer" wording. Ian, with his insurance background, should confirm the checklist.
- **Vercel function limits** on Ian's plan: check `maxDuration` limits on his plan before deploy.
