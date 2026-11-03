# Ajali Kit: start here

**Name:** Ajali Kit ("ajali" is Swahili for accident). Keep this name, because it's what you entered in the hackathon application.
Tagline: "From crash to claim pack in 10 minutes."
Other names if you want to rename later: Ajali Pack, ClaimSnap Kenya, Ajali Claim.

Folder: `~/My Work/projects/ajali-kit`
Deadline: submit by Wed Nov 4, 10 PM EAT (hard cutoff Thu Nov 5, 5 AM EAT).

## What is in this folder
- `START-HERE.md`: this guide, the steps you follow.
- `CLAUDE.md`: rules Claude Code reads automatically (build order, no secrets in code, test commands).
- `SPEC.md`: the full product spec: screens, user flows, AI pipeline, data model, acceptance criteria.
- `PLAN.md`: the day-by-day plan, cut list and submission checklist.
- `.env.example`: the environment variables the app needs, with empty values.

## Step 1. Things only you can do (today, about 20 minutes)
1. Claim your $150 Meta Model API credits using the form link in the Cerebral Valley email of Oct 26 (ianodad@gmail.com). Each person claims their own.
2. Add a card on your Meta developer account. API calls fail until a card is on file.
3. On the Billing page, set a spend alert (for example $20).
4. Create an API key. Keep it out of chat and out of git.
5. Open the hackathon submit page and note the demo video length limit and whether the repo must be public:
   https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit

## Step 2. Set up the key locally
```bash
cd ~/"My Work"/projects/ajali-kit
cp .env.example .env.local
open -e .env.local      # paste your key after MODEL_API_KEY= and save
```
To build without spending credits, set `AJALI_MOCK=1` in `.env.local`. All AI calls then return fake data.

## Step 3. Start Claude Code
```bash
cd ~/"My Work"/projects/ajali-kit
git init
claude
```
Then paste this as your first message to Claude Code:

> Read CLAUDE.md, SPEC.md and PLAN.md. Use Opus to plan and Sonnet subagents for routine work. Start with Phase 0 of the build order in SPEC.md: scaffold the Next.js PWA, mock mode, and the two model test scripts. Stop at the end of each phase, show me what works, and wait for my OK before the next phase.

After each phase, check it on your phone (`npm run dev`, then open the LAN address Claude Code shows), then reply "OK, next phase".

If Claude Code is rate-limited or signed out (Claude Max renews around Nov 3 to 6), switch to Codex in the same folder with the same first message.

## Step 4. Daily checkpoints (from PLAN.md)
- **Sun Nov 1:** credits, key, scaffold, photo capture, model tests on real car photos.
- **Mon Nov 2:** AI damage step (Muse Spark finds damage, SAM 3.1 outlines it), document scan, police OB section, witnesses. Checkpoint 8 PM: if the damage step isn't working, use the cut list in PLAN.md.
- **Tue Nov 3:** AI claim draft, PDF claim pack, share, polish, deploy to Vercel (`npx vercel`, add env vars in the Vercel dashboard). Checkpoint 8 PM.
- **Wed Nov 4:** code freeze at noon. Record the demo video (script in SPEC.md), write the submission, submit by 10 PM EAT.

## Step 5. Before you record the demo
- Get 5 to 10 real photos of damaged cars. Blur or get consent for any faces and number plates.
- Run the full flow once with `AJALI_MOCK=0` to confirm the real models work.
- Follow the demo script in SPEC.md, keeping to the video length limit you noted in Step 1.

## Rules to remember
- Never paste the API key into chat, code or commits.
- No git push until you decide to.
- Ask Bazu if anything in the spec is unclear. The Kenyan claim details (police reporting deadlines, insurer document lists) are marked "check with your insurer" until confirmed.
