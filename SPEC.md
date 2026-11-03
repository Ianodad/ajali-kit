# Ajali Kit: build spec

Version 1.0, Sun Nov 1, 2026. For Claude Code. Read CLAUDE.md first, then this file, then PLAN.md.

"Ajali" is Swahili for "accident". Ajali Kit helps a Kenyan motorist build a complete motor insurance claim pack at the roadside, using Meta's Muse Spark and SAM 3.1.

Contents:
0. Sources and what is verified
1. Product summary
2. Goals and non-goals
3. Users and personas
4. Core concepts
5. User flows (step by step)
6. Screen list (wireframe level)
7. Data model
8. AI pipeline and prompts
9. Tech stack and why
10. Meta Model API integration notes
11. Privacy and safety
12. Demo script
13. Acceptance criteria per feature
14. Build order (phases and tasks)
15. Unverified items

---

## 0. Sources and what is verified

| Fact | Status | Source |
| --- | --- | --- |
| Base URL `https://api.meta.ai/v1`, OpenAI-compatible, key in `MODEL_API_KEY`, Bearer auth | Verified | dev.meta.ai/docs/quickstart, /docs/protocols/responses |
| Model `muse-spark-1.3` (recommended), also `muse-spark-1.2`, `muse-spark-1.1`; input text, image, video, audio, PDF; output text; 1M context | Verified | dev.meta.ai/docs/models |
| Images go in user messages as `input_image` with `image_url` (public URL or base64 data URL) on the Responses API; max 50 images per request; 50 MB per inline image | Verified | dev.meta.ai/docs/image-understanding |
| Muse Spark reports positions on a normalized 0 to 1000 grid of the image sent | Verified | dev.meta.ai/docs/image-understanding |
| Structured output on Responses uses `text.format` with `type: "json_schema"` (not `response_format`); recursive schemas rejected | Verified | dev.meta.ai/docs/structured-output |
| SAM 3.1 model id `sam-3.1`, called on `POST /v1/responses`, one user message with one `input_text` (a short noun phrase OR box/point prompts, never both) and one `input_image` or `input_video` | Verified | dev.meta.ai/docs/sam/overview, /docs/sam/segmenting |
| SAM concept prompt: one short noun phrase per request; lists like "bus, bicycle" return nothing; commands and questions are unreliable | Verified | dev.meta.ai/docs/sam/segmenting |
| SAM box/point prompts: up to 16 objects; build with `buildObjectPrompt` from `@meta-sam/parser` (0.1.0 or later) | Verified | dev.meta.ai/docs/sam/client-libraries |
| SAM output is special-token text; parse with `@meta-sam/parser` (`parseImageStream`, `recordsOfKind`, `decodeMaskToRaster`, `decodeMaskToSVGPath`); overlays with `@meta-sam/graphics` `SegmentationRenderer`; ESM only; Node ^20.17.0 or >=22.9.0 | Verified | dev.meta.ai/docs/sam/client-libraries |
| `metadata.mask_encoding: "one_bit"` for small masks; `metadata.include_confidence: "true"` (string) for confidence | Verified | dev.meta.ai/docs/sam/segmenting |
| Zero matches from SAM is a valid empty result, not an error | Verified | dev.meta.ai/docs/sam/reading-segmentation |
| Prices: Muse Spark 1.3 Standard $1.25 in / $4.25 out per 1M tokens; SAM 3.1 $2.50 per 1,000 images; Standard mode content is not used to train Meta models, Contributor mode content may be | Verified | dev.meta.ai/docs/pricing-rate-limits, /docs/models |
| Rate limits: `muse-spark-1.3` 3,000 RPM, 4M TPM; `sam-3.1` 3,000 RPM (paid tier). Free tier 60 RPM. Retry 429 with backoff and honour `Retry-After` | Verified | dev.meta.ai/docs/pricing-rate-limits |
| Exact field name for reasoning effort on Responses | Unverified | Check dev.meta.ai/docs reasoning page before using it |
| Muse Voice Transcribe API shape, and Swahili support | Unverified | Only needed for the stretch voice feature |
| Kenyan claim process details (deadlines, documents per insurer, emergency numbers) | Unverified, general knowledge | Ian to confirm |

---

## 1. Product summary

After a crash, a Kenyan motorist has to gather many things for a motor insurance claim: photos, the other driver's details, their licence and insurance details, a police OB number and later a police abstract, witness details, and a written account. People forget items at the scene, write vague accounts, and lose days going back and forth with the insurer.

Ajali Kit is a mobile web app (installable PWA) that walks the driver through the scene step by step and builds a complete, well-organised PDF claim pack they can share with their insurer.

Meta models do the hard parts:
- **Muse Spark 1.3** looks at each damage photo and returns, as structured JSON, each damaged area with its car part, damage type, an indicative severity and a box. It also reads documents (licence, logbook, insurance certificate) into form fields, and drafts the written account, the damage schedule and a missing-items checklist. Finally it cross-checks the account against the photos and flags contradictions.
- **SAM 3.1** turns each damage box from Muse Spark into a pixel-accurate mask (box prompts), and segments the whole vehicle (concept prompt "car"), so the app can show a clear coloured overlay and the share of the visible car that is damaged.

The output is a claim pack the driver understands and controls. The app records facts. It does not decide fault and does not estimate repair costs.

## 2. Goals and non-goals

Goals for the hackathon:
- A driver can go from "I just had an accident" to a shareable PDF claim pack in about 10 minutes.
- The damage step visibly uses Muse Spark and SAM 3.1 together, with masks on screen and in the PDF.
- Works on a mid-range Android phone in Chrome, and on iPhone Safari.
- Works in mock mode with zero API calls.

Non-goals:
- No repair cost or claim value estimates.
- No fault or liability decisions.
- No accounts, login or cloud sync in MVP.
- No direct integration with any insurer system.
- No payments.

## 3. Users and personas

Personas are illustrative, not real people.

**Primary user: the motorist at or after the crash**

- **Wanjiru, 34, private car owner, Nairobi.** Drives a Toyota to work on Mombasa Road. Comprehensive cover. Has never made a claim. Is shaken after a low-speed rear-end crash. Needs: calm, simple steps, nothing forgotten, a pack she can send to her insurer the same day.
- **Otieno, 41, ride-hailing driver, Nairobi.** His car is his income, so every day off the road costs him. Has made claims before and knows the pain of missing documents. Needs: speed, a complete pack first time, clear photos the assessor accepts.

**Secondary user (optional, stretch): the insurer claims officer**

- **Achieng, 29, motor claims officer at a Kenyan insurer.** Receives incomplete claims by email with blurry photos and no OB number. Needs: a consistent pack layout, a clear damage summary, and a list of what is still missing so she can ask once.

## 4. Core concepts

- **Incident**: one crash. Has time, location, description, vehicles, photos, documents, police details, witnesses, and a claim draft.
- **Own vehicle**: the user's vehicle (registration, make, model, insurer, policy number).
- **Other party**: another vehicle and driver involved. Zero or more.
- **Photo**: an image with a category (scene, own-damage, other-vehicle, plate, document, other). Damage photos get an analysis.
- **Damage item**: one damaged area on one photo, with part, type, severity, box, mask and a user-confirmed flag.
- **Claim pack**: the generated PDF plus its data snapshot.

Incident status: `draft` -> `ready` (all required items present) -> `exported` (PDF made at least once).

---

## 5. User flows

Conventions: S-numbers refer to screens in section 6. "AI" lines name the API route and model. Every AI step has a loading state, an error state with "Try again" and "Skip, I'll fill it in", and works in mock mode.

### F1. First open

1. User opens the URL. Splash with the Ajali Kit logo (S01) for under 1 second.
2. Onboarding (S02), 3 short cards, swipeable, with a "Skip" link:
   - "Stay safe first. We'll help you collect everything your insurer needs."
   - "Take photos. AI marks the damage for you. You check it."
   - "Get one PDF claim pack to share with your insurer."
3. Privacy card: "Your photos and details stay on this phone. Photos are sent to Meta's AI only to analyse them, and you choose when." Button "Got it".
4. Optional "My vehicle" setup (S03): registration number, make, model, year, insurer name, policy number, my name, phone. "Save" or "Later".
5. Install prompt: if the browser supports it, show a small "Add to home screen" banner on Home (S04). Dismissible.
6. Land on Home (S04).

Edge states:
- Storage unavailable (private mode): banner "This browser can't save your claim. Use a normal tab." Flow continues but warns before leaving.
- Returning user: skip onboarding, land on Home.

### F2. Report an accident at the scene

1. Home (S04): big red button "I've had an accident". Below: list of past incidents.
2. Safety check (S05):
   - "Is anyone hurt?" Yes / No.
   - If Yes: show emergency call buttons (999 and 112, numbers to confirm) as `tel:` links, plus "Move to safety if you can. Don't move injured people." A "Continue when safe" button.
   - If No: "Turn on hazard lights. If safe, take photos before moving the cars." Continue.
3. App creates a new Incident (status `draft`), saves the time now and asks for location permission.
4. Incident basics (S06):
   - Date and time (prefilled, editable).
   - Location: GPS coordinates captured; a text field "Road or landmark" (for example "Mombasa Road near Capital Centre"). No map SDK in MVP; show coordinates and a "Open in Maps" link.
   - "What happened, in a few words?" free text (optional now, can be done later).
   - Weather and light: chips (Clear, Rain, Night, Dusk). Road: chips (Tarmac, Murram, Junction, Roundabout).
5. Continue to the Incident hub (S07): a checklist of sections with progress ticks:
   - Photos, Damage review, Other party, Police report, Witnesses, My account, Claim pack.
   - Each row shows "Done", "In progress" or "Needed".

Edge states:
- Location denied: field shows "Location off. Type the place instead." No blocking.
- User leaves mid-flow: everything autosaves; Home shows the incident as "Draft".

### F3. Photograph the damage (guided)

1. From the hub, tap "Photos" -> Photo checklist (S08). A shot list with example silhouettes:
   - Wide shot of the scene (both cars in frame)
   - Your car, all four sides (4 shots)
   - Close-ups of each damaged area on your car
   - The other car, damage close-ups
   - The other car's number plate
   - Road signs, skid marks, anything relevant
2. Tap a shot -> camera (S09) using `<input type="file" accept="image/*" capture="environment">` (simple and reliable). Also allow picking from gallery.
3. After capture: preview with "Use photo" / "Retake". The app:
   - Reads EXIF orientation and normalises it.
   - Compresses to max 1600 px on the long side, JPEG quality 0.82.
   - Stores the original (compressed) Blob in IndexedDB and a 320 px thumbnail.
   - Saves capture time and GPS if available.
4. The shot is ticked. Damage close-ups (category `own-damage` or `other-damage`) show a badge "Ready for AI check".
5. A quality check runs locally: if the image is very dark (mean luminance below a threshold) or very small, show "This photo looks too dark. Retake?" (non-blocking).

Edge states:
- Camera permission denied: gallery picker still works; show how to allow the camera.
- Storage full: "Your phone is out of space. Delete some photos or free up space."
- More than 30 photos: allow, but warn the PDF will be large.

### F4. AI damage check (Muse Spark + SAM 3.1)

Trigger: on the Photo checklist, "Check damage with AI" button (runs on all damage photos not yet analysed), or per photo in the photo viewer.

1. Consent sheet the first time (S10): "We'll send your damage photos to Meta's AI to mark the damage. They are not used to train Meta's models. Continue?" Continue / Not now. Remember the choice per incident.
2. For each damage photo (max 3 in parallel), show a card with a progress state: "Finding damage" -> "Marking the exact area" -> "Done".
3. AI step 1, `POST /api/analyze-photo` (Muse Spark 1.3, structured output): returns a list of damage items with part, damage type, severity, a short description and a normalized box (0 to 1000), plus an image quality note and the vehicle side. See section 8.2.
4. AI step 2, `POST /api/segment` with `mode: "concept"`, `concept: "car"` (SAM 3.1): returns the vehicle mask(s). The app keeps the largest vehicle mask that overlaps most of the damage boxes as "this vehicle".
5. AI step 3, `POST /api/segment` with `mode: "boxes"` (SAM 3.1): the app converts each Muse Spark box from 0 to 1000 to image pixels and sends up to 16 box prompts in one request (ids 1..n matching damage items). Returns one mask per damage item.
6. The Damage review screen (S11) shows:
   - The photo with coloured semi-transparent masks (one colour per item) and a thin outline of the vehicle mask.
   - Below, a list: "1. Rear bumper, dent, moderate", with a short description and "Covers about 6% of the visible car" (damage mask area / vehicle mask area; hidden if no vehicle mask).
   - Each item has: Confirm (tick), Edit (part, type, severity dropdowns, description text), Delete.
   - A button "Add missed damage": user drags a box on the photo; the app sends it to `/api/segment` as one box prompt and adds a new item with part "Unknown" for the user to label.
   - Banner: "AI marks are a guide. An assessor makes the final call."
7. When all items on all damage photos are confirmed or deleted, "Damage review" is ticked on the hub.

Edge states:
- Muse Spark finds no damage: "No damage found in this photo. Add it yourself or retake closer." Show "Add missed damage".
- SAM returns zero matches for a box: keep the item with the box outline only, mark "Mask not available".
- SAM finds no car: hide the percentage; still show damage masks.
- Image is not a vehicle (Muse Spark returns `is_vehicle_photo: false`): "This doesn't look like a car photo. Move it to another category?"
- API error or timeout: per-card "Try again"; after 2 failures "Skip AI for this photo".
- 429 rate limit: automatic retry with backoff (handled server-side), user sees "Busy, retrying".
- Offline: button disabled with "Connect to the internet to use the AI check. Your photos are saved."

### F5. Other party details and documents

1. Hub -> "Other party" (S12). "Was another vehicle involved?" Yes / No / Not sure. If No, section is done.
2. For each other vehicle, a form:
   - Driver: full name, phone, ID number (optional), licence number.
   - Vehicle: registration, make, model, colour.
   - Owner if different from the driver: name, phone.
   - Insurer, policy or certificate number, certificate expiry.
   - "Did they admit anything?" Not recorded by default; free text with a note "Write only what was said."
3. "Scan a document" buttons: "Driving licence", "Logbook", "Insurance certificate".
   - Capture a photo (same as F3, category `document`, `docType` set).
   - AI: `POST /api/extract-document` (Muse Spark 1.3, structured output) returns fields with a confidence per field (high, medium, low). See section 8.3.
   - The form fills; low-confidence fields are highlighted yellow with "Check this".
   - The user must tap "These details are correct" before the section counts as done.
4. "Add another vehicle" for multi-vehicle crashes.

Edge states:
- Blurry document: "We couldn't read this clearly. Retake in good light, flat, without glare."
- Document type mismatch (user picked licence, AI sees a logbook): "This looks like a logbook. Use it as a logbook?"
- Other driver refuses to share: a note field "Driver refused to share details" and a reminder to get the plate photo and report to police.

### F6. Police report (OB number) guidance

1. Hub -> "Police report" (S13).
2. Guidance card (plain, short, marked "General guidance. Check with your insurer."):
   - Report the accident at the nearest police station, usually the one covering where it happened.
   - You'll get an OB (Occurrence Book) number. Write it down.
   - Insurers usually ask for a police abstract. You request it later from the same station.
   - Take your ID, licence and vehicle details with you.
3. Fields: police station, OB number, date reported, officer's name (optional), police abstract obtained (Yes / Not yet), abstract photo (optional, category `document`, docType `police_abstract`).
4. If "Not yet": the checklist keeps "Police abstract" as an outstanding item in the PDF.
5. Reminder (stretch): a local notification reminder in 2 days to collect the abstract.

Edge states:
- No OB number yet: allowed; the claim pack flags it as missing.
- OB format check: free text, no strict validation (formats vary). Warn only if empty.

### F7. Witnesses

1. Hub -> "Witnesses" (S14). "Did anyone see what happened?" Yes / No.
2. For each witness: name, phone, "What did they see?" (short text, their words). Optional: "Witness agreed to be contacted" checkbox (required to include their phone in the PDF).
3. Stretch: record a short voice note and transcribe.

Edge states:
- No consent tick: phone number is left out of the PDF and the screen says why.

### F8. My account and the AI claim draft

1. Hub -> "My account" (S15). Prompt: "In your own words, what happened? Include direction, speed, lanes and who hit whom." Large text box. Stretch: voice input.
2. Button "Draft my claim with AI".
3. AI: `POST /api/draft-claim` (Muse Spark 1.3, structured output). Input: incident basics, the user's own words, confirmed damage items (text only, no photos in MVP to save cost; stretch: include 2 to 4 damage photos), other party summary, police details, witness statements. Output: see section 8.4:
   - `account`: a clear factual first-person account that keeps the user's facts and adds nothing new.
   - `damage_schedule`: list of parts and damage, grouped by vehicle.
   - `missing_items`: what the insurer will probably still need.
   - `consistency_warnings`: contradictions between the account and the evidence.
   - `questions_for_user`: up to 3 short questions where facts are missing.
4. Review screen (S16): the account is editable. Warnings are shown as yellow cards with "Fix" (jumps to the relevant section) or "Ignore". Questions can be answered inline and the user can tap "Redraft".
5. User taps "I confirm this account is true to the best of my knowledge" (required for the PDF).

Edge states:
- User text empty: button disabled, hint "Write at least a sentence first."
- AI adds facts not provided: prompt forbids it; UI shows the user's original text next to the draft ("Your words" toggle) so they can compare.
- Error: keep the user's own words as the account, so the PDF can still be made.

### F9. Generate the PDF claim pack

1. Hub -> "Claim pack" (S17). A readiness summary: required items with ticks, optional items, and outstanding items.
   - Required for "Generate": at least 1 damage photo, incident date/time and location text, own vehicle registration, confirmed account.
   - Missing required items show "Add" links.
2. Tap "Generate claim pack". The app renders the PDF on the phone (no upload). Progress: "Building your pack".
3. PDF contents (A4):
   1. Cover: "Motor Accident Claim Pack", incident date, place, own registration, claimant name, generated date, Ajali Kit reference (for example `AJK-20261101-7F3A`).
   2. Summary box: vehicles involved, injuries (yes/no), police OB number, outstanding items.
   3. Incident details: time, location (text + coordinates), weather, road.
   4. Claimant's account (the confirmed text) and the declaration with name and date.
   5. Damage schedule table: vehicle, part, damage type, severity (indicative), photo reference.
   6. Annotated photos: each damage photo with masks and numbered labels, plus the original without overlay next to it or on the next page. Captions with capture time and photo ID.
   7. Other photos (scene, plate, other vehicle), 2 per page.
   8. Other party details (only fields the user confirmed).
   9. Police report details.
   10. Witnesses (phone only with consent).
   11. Checklist of documents the insurer may ask for, ticked or outstanding.
   12. Footer on every page: "Prepared by the claimant using Ajali Kit. AI marks are a guide, not an assessment." and page numbers.
4. Preview screen (S18) with the PDF shown in an iframe or as page images, plus buttons "Share", "Download", "Email".
5. Incident status -> `exported`.

Edge states:
- Large pack (more than 20 photos): photos are downscaled to 1200 px in the PDF; warn if the file is over 15 MB.
- PDF generation fails on an old browser: fall back to a printable HTML page (S18b) and "Use your browser's Print to save as PDF".

### F10. Share with the insurer

1. From S18:
   - **Share**: `navigator.share({ files: [pdfFile], title, text })` when `navigator.canShare({ files })` is true. This opens the phone's share sheet so the user picks the app.
   - **Download**: saves `Ajali-Kit-Claim-<reg>-<date>.pdf`.
   - **Email**: opens `mailto:` with subject "Motor claim: <reg>, accident on <date>" and a short body; the user attaches the downloaded PDF (mailto can't attach files). Optional "Insurer claims email" saved in My vehicle.
2. After sharing, show "What next" tips: keep your OB number, collect the police abstract, don't repair before the insurer's assessor approves, keep receipts. (General guidance, marked as such.)

Edge states:
- Share API not supported (desktop): hide Share, show Download and Email.

### F11. Review a past incident

1. Home -> tap an incident card. Opens the Incident hub with all sections.
2. Overflow menu: "Duplicate as new", "Delete incident" (confirm dialog; deletes all photos and data from the device).

### F12 (stretch). Insurer claims officer view

Only if time allows after the demo is recorded.
1. User taps "Create a link for my insurer" on S18. App uploads the PDF and a JSON summary to storage (Vercel Blob) under an unguessable id, with a 14-day expiry.
2. Claims officer opens `/review/<id>`: summary card, damage overlays, missing items, "Download PDF". Read only.
3. Officer sees an "AI triage note" (Muse Spark summary for the officer: completeness score, items to request, warnings).
This needs explicit user consent and is off by default.

---

## 6. Screen list (wireframe level)

Mobile first, 360 to 430 px wide. One primary action per screen at the bottom (thumb zone). Large tap targets (min 48 px). Calm colours: deep navy background header, white cards, one accent (amber) for actions, red only for emergency.

| ID | Screen | Layout |
| --- | --- | --- |
| S01 | Splash | Centered logo and the word "Ajali Kit", tagline "Your claim pack, sorted." |
| S02 | Onboarding | 3 swipe cards with an icon, title, one line of text; dots; "Skip" top right; "Next" / "Get started" bottom. Then a privacy card. |
| S03 | My vehicle | Form: registration, make, model, year, insurer, policy number, my name, my phone, insurer claims email. "Save" bottom. |
| S04 | Home | Header "Ajali Kit". Big red card "I've had an accident" with a car icon. Section "Your claims": list of incident cards (date, place, status chip). Bottom link "My vehicle". Install banner if available. |
| S05 | Safety check | Title "Are you safe?". Two big buttons Yes/No for "Is anyone hurt?". Emergency call buttons when Yes. Short tips. "Continue" bottom. |
| S06 | Incident basics | Date/time picker, location row (coordinates + "Open in Maps"), "Road or landmark" input, "What happened" textarea, chips for weather/light/road. "Continue". |
| S07 | Incident hub | Header with date and place. Progress bar "4 of 7 done". List rows with icon, title, status chip, chevron. Bottom button "Build claim pack" (enabled when required items are done). |
| S08 | Photo checklist | Grouped shot list with silhouettes; each row shows thumbnails taken. "Check damage with AI" sticky button showing the count of damage photos waiting. |
| S09 | Capture / preview | Native camera via input; preview with "Use photo" and "Retake"; category picker if not chosen. |
| S10 | AI consent sheet | Bottom sheet, 3 lines of text, "Continue" / "Not now". |
| S11 | Damage review | Photo with canvas overlay (masks, numbered pins, vehicle outline toggle). Swipe between damage photos. Item list below with Confirm / Edit / Delete; "Add missed damage" button enters box-draw mode. Disclaimer banner. |
| S12 | Other party | Yes/No/Not sure. Per-vehicle accordion with the form, "Scan licence / logbook / certificate" buttons, highlighted low-confidence fields, "These details are correct" checkbox. "Add another vehicle". |
| S13 | Police report | Guidance card (collapsible), fields, abstract photo slot. |
| S14 | Witnesses | Yes/No, witness cards, consent checkbox, "Add witness". |
| S15 | My account | Prompt text, large textarea (stretch: mic button), "Draft my claim with AI". |
| S16 | Claim draft review | Tabs "Draft" / "Your words". Editable draft. Warning cards. Questions with inline answers and "Redraft". Declaration checkbox. "Save". |
| S17 | Claim pack readiness | Required items with ticks, optional items, outstanding items. "Generate claim pack". |
| S18 | Pack preview and share | PDF preview, "Share", "Download", "Email". "What next" tips. S18b is the printable HTML fallback. |
| S19 | Settings | Mock mode toggle (dev only, hidden unless `NEXT_PUBLIC_SHOW_DEV=1`), clear all data, about, privacy notice. |

---

## 7. Data model

Stored in IndexedDB via Dexie. Blobs (photos, PDF) in their own table. All ids are `crypto.randomUUID()`. All times are ISO 8601 strings with offset.

```ts
type IncidentStatus = "draft" | "ready" | "exported";

interface OwnVehicle {
  registration: string;      // e.g. "KDA 123A" (format not validated strictly)
  make?: string; model?: string; year?: number; colour?: string;
  insurer?: string; policyNumber?: string;
  ownerName?: string; ownerPhone?: string;
  insurerClaimsEmail?: string;
}

interface Incident {
  id: string;
  reference: string;         // "AJK-YYYYMMDD-XXXX"
  status: IncidentStatus;
  createdAt: string; updatedAt: string;
  occurredAt: string;
  location: { lat?: number; lng?: number; accuracyM?: number; text: string };
  conditions: { weather?: "clear" | "rain" | "fog"; light?: "day" | "dusk" | "night"; road?: string[] };
  anyoneInjured: boolean | null;
  shortDescription?: string;
  ownVehicle: OwnVehicle;    // snapshot copied from settings at creation
  otherParties: OtherParty[];
  police: PoliceReport;
  witnesses: Witness[];
  account: ClaimAccount;
  aiConsent: boolean;
}

type PhotoCategory = "scene" | "own_damage" | "other_damage" | "own_vehicle" | "other_vehicle" | "plate" | "document" | "other";
type DocType = "driving_licence" | "logbook" | "insurance_certificate" | "police_abstract" | "national_id" | "other";

interface Photo {
  id: string; incidentId: string;
  category: PhotoCategory; docType?: DocType; otherPartyId?: string;
  blobId: string; thumbBlobId: string;
  width: number; height: number;   // after EXIF rotation and compression
  takenAt: string; lat?: number; lng?: number;
  analysis?: DamageAnalysis;
}

type Severity = "minor" | "moderate" | "severe";
type DamageType = "dent" | "scratch" | "crack" | "broken" | "missing_part" | "deformation" | "paint_damage" | "glass_damage" | "other";

interface DamageItem {
  id: string;
  samObjectId: number;             // 1..16, matches the box prompt id
  part: string;                    // e.g. "rear bumper"
  damageType: DamageType;
  severity: Severity;              // indicative only
  description: string;
  boxNorm: [number, number, number, number];   // x1,y1,x2,y2 on 0..1000 grid (Muse Spark)
  boxPx: { left: number; top: number; right: number; bottom: number };
  maskSvgPath?: string;            // from decodeMaskToSVGPath, in mask raster coords
  maskBoxPx?: { left: number; top: number; right: number; bottom: number }; // SAM box
  maskAreaPx?: number;
  shareOfVehicle?: number;         // 0..1
  source: "ai" | "user";
  status: "pending" | "confirmed" | "deleted";
}

interface DamageAnalysis {
  model: string; analysedAt: string;
  isVehiclePhoto: boolean;
  vehicleSide?: "front" | "rear" | "left" | "right" | "front_left" | "front_right" | "rear_left" | "rear_right" | "top" | "unknown";
  qualityNote?: string;
  vehicleMask?: { svgPath: string; boxPx: { left: number; top: number; right: number; bottom: number }; areaPx: number };
  items: DamageItem[];
  errors?: string[];
}

interface ExtractedField { value: string; confidence: "high" | "medium" | "low"; userConfirmed: boolean }

interface OtherParty {
  id: string;
  driver: { name?: ExtractedField; phone?: string; idNumber?: ExtractedField; licenceNumber?: ExtractedField; licenceExpiry?: ExtractedField };
  vehicle: { registration?: ExtractedField; make?: ExtractedField; model?: ExtractedField; colour?: string };
  owner?: { name?: ExtractedField; phone?: string };
  insurance?: { insurer?: ExtractedField; policyOrCertificateNo?: ExtractedField; expiry?: ExtractedField };
  refusedToShare: boolean;
  notes?: string;
  confirmed: boolean;
}

interface PoliceReport {
  station?: string; obNumber?: string; reportedAt?: string; officerName?: string;
  abstractObtained: boolean; abstractPhotoId?: string;
}

interface Witness { id: string; name: string; phone?: string; consentToContact: boolean; statement: string }

interface ClaimAccount {
  userWords: string;
  draft?: ClaimDraft;
  finalText?: string;
  confirmed: boolean; confirmedAt?: string;
}

interface ClaimDraft {
  account: string;
  damageSchedule: { vehicle: "own" | "other"; part: string; damage: string; photoRefs: string[] }[];
  missingItems: { item: string; why: string }[];
  consistencyWarnings: { warning: string; section: "photos" | "account" | "other_party" | "police" | "witnesses" }[];
  questionsForUser: string[];
  model: string; draftedAt: string;
}

interface StoredBlob { id: string; blob: Blob; mime: string }
```

---

## 8. AI pipeline

### 8.1 Overview

All model calls go through Next.js route handlers on the server, so the API key never reaches the browser. The browser sends compressed images as base64 data URLs in JSON (max 1600 px, so about 200 to 600 KB each).

```
Phone (PWA)                          Next.js server                 Meta Model API
-----------                          --------------                 --------------
photo -> compress -> /api/analyze-photo  -> responses.create(muse-spark-1.3, image, text.format json_schema)
       <- damage items (boxNorm)
convert boxNorm -> pixels
photo + "car"    -> /api/segment (concept) -> responses.create(sam-3.1, "car", stream) -> parseImageStream
photo + boxes    -> /api/segment (boxes)   -> responses.create(sam-3.1, buildObjectPrompt(...), stream)
       <- masks as SVG paths + boxes + areas
render overlay (canvas), user reviews
doc photo        -> /api/extract-document -> muse-spark-1.3, json_schema
incident JSON    -> /api/draft-claim      -> muse-spark-1.3, json_schema
PDF made on the phone (no upload)
```

Every route:
- Validates input with zod.
- Has a mock branch: if `AJALI_MOCK=1` (server) or the request header `x-ajali-mock: 1` (dev toggle), return a fixture from `fixtures/` after a 600 ms delay.
- Retries 429 and 5xx up to 3 times with exponential backoff and jitter (start 500 ms), honouring `Retry-After`.
- Logs model, latency and token `usage` (no image data, no personal data) to the server console.
- Returns `{ ok: true, data }` or `{ ok: false, error: { code, message, retryable } }`.
- Sets `export const maxDuration = 60` (check the limit on Ian's Vercel plan).
- Uses Standard mode models only (`muse-spark-1.3`, never `-contributor`), because user photos and documents are personal data.

### 8.2 Damage analysis prompt (Muse Spark)

Model: `muse-spark-1.3`. Endpoint: Responses API. One image per call.

System / instructions:
```
You are a careful motor vehicle damage spotter helping a driver in Kenya prepare an insurance claim.
Look only at what is visible in the photo. Do not guess hidden damage. Do not estimate repair costs.
Do not decide who was at fault.
For each distinct damaged area on the main vehicle in the photo, return:
- part: the car part in plain English (e.g. "rear bumper", "left front door", "right headlight").
- damage_type: one of the allowed values.
- severity: minor, moderate or severe. This is indicative only.
- description: one short factual sentence.
- box_2d: [x1, y1, x2, y2] tight around the damaged area, on a 0 to 1000 grid where (0,0) is top-left
  and (1000,1000) is bottom-right of the image you received.
Return at most 12 items. If two areas touch on the same part, return one item.
If the photo is not of a vehicle, set is_vehicle_photo to false and return no items.
If the photo is too dark, blurry or far away to judge, say so in quality_note.
```

User content: `input_text` "Find the visible damage on the main vehicle in this photo." plus `input_image` (data URL).

JSON schema (`text.format`):
```json
{
  "type": "json_schema",
  "name": "damage_analysis",
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["is_vehicle_photo", "vehicle_side", "quality_note", "items"],
    "properties": {
      "is_vehicle_photo": { "type": "boolean" },
      "vehicle_side": { "type": "string", "enum": ["front","rear","left","right","front_left","front_right","rear_left","rear_right","top","unknown"] },
      "quality_note": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["part", "damage_type", "severity", "description", "box_2d"],
          "properties": {
            "part": { "type": "string" },
            "damage_type": { "type": "string", "enum": ["dent","scratch","crack","broken","missing_part","deformation","paint_damage","glass_damage","other"] },
            "severity": { "type": "string", "enum": ["minor","moderate","severe"] },
            "description": { "type": "string" },
            "box_2d": { "type": "array", "items": { "type": "integer", "minimum": 0, "maximum": 1000 }, "minItems": 4, "maxItems": 4 }
          }
        }
      }
    }
  }
}
```

Post-processing in code:
- Clamp and sort box corners; drop boxes smaller than 1% of the image width or height.
- Convert to pixels: `x = round(x_norm * width / 1000)`, `y = round(y_norm * height / 1000)` using the exact size of the image sent.
- Keep at most 16 items (SAM box prompt limit).

### 8.3 SAM 3.1 segmentation

Two calls per damage photo:

**A. Vehicle mask (concept prompt)**
- `input_text`: `"car"` (one noun phrase; for buses or motorbikes the app may use `"bus"`, `"truck"` or `"motorcycle"` if Muse Spark says so; stretch).
- `metadata: { mask_encoding: "one_bit" }`, `stream: true`.
- Pick the vehicle record with the largest overlap with the union of damage boxes. If none, skip.

**B. Damage masks (box prompts)**
- `input_text`: built with `buildObjectPrompt({ size: { width, height }, objects: items.map((it, i) => ({ id: i + 1, prompts: [{ box: it.boxPx }] })) })`.
- `width` and `height` must be the exact pixel size of the image sent, after EXIF rotation (the app normalises rotation before sending, so this is the stored width and height).
- Up to 16 objects per request.
- `metadata: { mask_encoding: "one_bit", include_confidence: "true" }`, `stream: true`.

Parsing (server side):
```ts
const parsed = parseImageStream(events);
const result = await parsed.finalResult;
// result.outcome.status: "completed" | "incomplete"
const boxes = recordsOfKind(result.records, "box");
const masks = recordsOfKind(result.records, "mask");
// pair by objectId; for each mask: svgPath = decodeMaskToSVGPath(mask.mask); raster = decodeMaskToRaster(mask.mask)
// area: count 1s in raster, scale by (boxW * boxH) / (rasterW * rasterH) to get source pixels
```
Return to the client per object: `objectId`, `box` (left, top, right, bottom in source pixels), `svgPath` (in mask raster coordinates), `rasterWidth`, `rasterHeight`, `areaPx`, `confidence`.

Client rendering: draw the photo on a canvas, then for each mask translate to the box origin and scale by `boxW / rasterWidth`, `boxH / rasterHeight`, fill the SVG path (`new Path2D(svgPath)`) with the item colour at 35% opacity and stroke at 80%. Alternatively use `@meta-sam/graphics` `SegmentationRenderer` with the parsed result; pick whichever Claude Code gets working first, but the PDF needs a flattened PNG either way, so the canvas path is the safer default.

Note: the exact relationship between mask raster size and box size for large objects is not stated in the docs (the cookbook example shows a mask raster equal to the box size). The scaling above handles both cases. Verify on the first real call.

Errors:
- Zero records with `outcome.status === "completed"` is a valid "no match".
- `incomplete` outcome: use what was parsed, add an error note.
- Parser `diagnostics`: log them; ignore malformed lines.
- HTTP 400 on prompt: log the message (it names the problem), return `retryable: false`.

### 8.4 Document extraction prompt (Muse Spark)

Model `muse-spark-1.3`, one image per call, structured output.

Instructions:
```
You read Kenyan vehicle and driver documents from a photo for an insurance claim form.
The document type the user selected is: {docType}.
Copy text exactly as printed. Do not guess. If a field is not visible or not readable, return an empty string
and confidence "low". If the photo shows a different document type, set detected_doc_type accordingly.
Dates as YYYY-MM-DD when the full date is readable, otherwise as printed.
```

Schema: `detected_doc_type` (enum of DocType) plus an array `fields` of `{ key, value, confidence }` where `key` is an enum: `full_name`, `id_number`, `licence_number`, `licence_expiry`, `registration`, `make`, `model`, `colour`, `owner_name`, `chassis_number`, `insurer`, `policy_or_certificate_number`, `cover_start`, `cover_expiry`, `ob_number`, `police_station`. (Array of key/value keeps the schema flat and non-recursive.)

The app maps keys to form fields and never overwrites a field the user already confirmed.

### 8.5 Claim draft prompt (Muse Spark)

Model `muse-spark-1.3`, text only in MVP. Input is a JSON summary built by the app (no photos, no phone numbers, no ID numbers; send only what the draft needs).

Instructions:
```
You help a driver in Kenya write a clear motor insurance claim account.
Rules:
1. Use only facts in the provided data. Never add facts, speeds, directions or admissions that are not there.
2. Write in the first person, plain English, short sentences, past tense, in time order.
3. Do not say who was at fault. Describe what happened.
4. damage_schedule: list each confirmed damage item, grouped by vehicle, with photo references.
5. missing_items: list documents or details an insurer usually asks for that are missing from the data
   (for example police OB number, police abstract, other party insurance details, driving licence copy,
   logbook copy, repair estimate). Explain why in one short line each.
6. consistency_warnings: point out contradictions between the driver's words and the evidence
   (for example the driver says they were hit from behind but all damage is on the front).
   Only real contradictions; return an empty list if none.
7. questions_for_user: up to 3 short questions for missing facts that matter.
```

Schema: matches `ClaimDraft` in section 7 (snake_case on the wire, mapped in code).

### 8.6 Cost per claim (estimate)

- Damage analysis: about 3,000 input tokens and 1,000 output tokens per photo, about $0.01.
- SAM: 2 image calls per damage photo, $0.005.
- Documents: 3 calls, about $0.02.
- Claim draft: about 4,000 input, 1,500 output, about $0.01.
- Total for 6 damage photos: roughly $0.12. Check `usage` in responses and the Billing page to confirm.

---

## 9. Tech stack and why

| Choice | Why |
| --- | --- |
| **Next.js (App Router) + TypeScript**, deployed on **Vercel** | One repo for the PWA and the server routes that hold the API key. Fast to build with Claude Code, free tier is enough, a live URL for judges in minutes. Ian already deploys to Vercel. |
| **PWA** (manifest + small service worker, e.g. `@serwist/next` or a hand-written SW) | Installable on Android and iPhone from the browser, no app store review in a 3-day window. Camera via file input works everywhere. |
| **Tailwind CSS** + **shadcn/ui** components | Fast, consistent, accessible UI. |
| **Dexie (IndexedDB)** | Local-first: photos and personal data stay on the phone; works with poor signal at the roadside; no database to run. |
| **zod** | Validate API route inputs and model JSON. |
| **openai** npm SDK with `baseURL: "https://api.meta.ai/v1"` | The documented way to call the Meta Model API (Responses API, streaming). |
| **@meta-sam/parser** (and optionally **@meta-sam/graphics**) | Official parser for SAM 3.1 output and mask decoding. Needs Node ^20.17.0 or >=22.9.0, ESM. |
| **@react-pdf/renderer** (client side) | Builds the PDF on the phone, so photos are never uploaded for PDF generation. Fallback: printable HTML page. |
| **browser-image-compression** or a canvas helper | Resize to 1600 px and fix EXIF orientation before upload and storage. |
| **Vitest** + **Playwright** (smoke test) | Unit tests for box conversion, parsing, mapping; one end-to-end run in mock mode. |

Why not React Native or Flutter: app store builds and device installs take too long for a 3-day window, and judges can open a URL instantly.

Why not Python: the official SAM parser and overlay packages are TypeScript-first, and one TypeScript codebase keeps it simple.

---

## 10. Meta Model API integration notes

### 10.1 Smoke test (Ian runs it; key from his shell env, never pasted in chat)

```bash
curl -s https://api.meta.ai/v1/responses \
  -H "Authorization: Bearer $MODEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"muse-spark-1.3","input":"Say hello in Swahili."}'
```

### 10.2 Client setup (server only)

```ts
// lib/meta.ts  (server only; import "server-only")
import OpenAI from "openai";
export const meta = new OpenAI({
  baseURL: process.env.META_BASE_URL ?? "https://api.meta.ai/v1",
  apiKey: process.env.MODEL_API_KEY!,
});
export const MUSE_MODEL = process.env.MUSE_MODEL ?? "muse-spark-1.3";
export const SAM_MODEL = process.env.SAM_MODEL ?? "sam-3.1";
```

### 10.3 Muse Spark with an image and structured output

```ts
const res = await meta.responses.create({
  model: MUSE_MODEL,
  instructions: DAMAGE_INSTRUCTIONS,
  input: [{
    type: "message", role: "user",
    content: [
      { type: "input_text", text: "Find the visible damage on the main vehicle in this photo." },
      { type: "input_image", image_url: dataUrl },
    ],
  }],
  text: { format: { type: "json_schema", name: "damage_analysis", schema: DAMAGE_SCHEMA } },
});
const json = JSON.parse(res.output_text);
```
Notes:
- Use `text.format`, not `response_format`, on the Responses API.
- If the SDK type definitions complain about `instructions` or the `input_image` shape, cast to `any` for those fields; the shapes above follow Meta's docs.
- Leave temperature unset (Meta recommends defaults).
- Reasoning effort: the docs mention effort levels; confirm the exact field on the Reasoning docs page before setting it. Default is fine for the MVP.

### 10.4 SAM 3.1 call

```ts
import { buildObjectPrompt, parseImageStream, recordsOfKind, decodeMaskToSVGPath, decodeMaskToRaster } from "@meta-sam/parser";

const events = await meta.responses.create({
  model: SAM_MODEL,
  input: [{ type: "message", role: "user", content: [
    { type: "input_text", text: promptText },          // "car" or buildObjectPrompt(...)
    { type: "input_image", image_url: dataUrl },
  ]}],
  stream: true,
  metadata: { mask_encoding: "one_bit", include_confidence: "true" },
} as any);
const result = await parseImageStream(events as any).finalResult;
```
Rules from the docs:
- One concept per request. No lists like "dent, scratch".
- A prompt is either a noun phrase or box/point prompts, never both.
- Max 16 prompted objects.
- `metadata` values are strings.
- Use `@meta-sam/parser` 0.1.0 or later (for `buildObjectPrompt` and confidence support).

### 10.5 Environment variables

`.env.example` (committed) and `.env.local` (never committed):
```
MODEL_API_KEY=            # Meta Model API key, server only
META_BASE_URL=https://api.meta.ai/v1
MUSE_MODEL=muse-spark-1.3
SAM_MODEL=sam-3.1
AJALI_MOCK=0              # 1 = all AI routes return fixtures
NEXT_PUBLIC_SHOW_DEV=0    # 1 = show the mock toggle in Settings
```
Never prefix the key with `NEXT_PUBLIC_`.

### 10.6 Limits to respect

- Max 50 images per Muse Spark request (we send 1).
- 50 MB per inline image (we send under 1 MB).
- Rate limits are per team; free tier is 60 RPM. Run at most 3 photo analyses in parallel.
- Keep each route under the Vercel function limits on Ian's plan.

---

## 11. Privacy and safety

- **Local first.** Incidents, photos, documents and the PDF live in IndexedDB on the phone. The server is stateless and stores nothing (except the stretch insurer link, which needs explicit consent and expires).
- **Explicit AI consent** per incident before photos or documents go to the Meta Model API.
- **Standard mode only.** Use `muse-spark-1.3` (Standard mode, content not used to train Meta models). Never use the `-contributor` models with user data.
- **Minimum data to the model.** The claim draft call gets no ID numbers, phone numbers or photos. Document extraction sends only the document photo.
- **No secrets in code.** Key only in env vars, server only. `.env.local` in `.gitignore`.
- **No logging of personal data** or image bytes. Log only model, latency, token counts and error codes.
- **Witness consent** before their phone number goes in the PDF.
- **Delete** an incident removes all its data and blobs from the device. "Clear all data" in Settings.
- **Kenya Data Protection Act, 2019**: mention in the privacy notice that the user controls their data and can delete it. (General statement; not legal advice.)
- **Safety copy**: never encourage taking photos in traffic. The safety screen comes first. Copy says "Only take photos when it's safe."
- **Honest AI copy**: severity is "indicative", AI marks are "a guide", and the app never claims to assess cost or fault.
- **Demo data**: use Ian's own documents or clearly fake ones. Blur or get consent for third-party plates and faces.
- **Branding**: no insurer names or logos (including Ian's employer). Generic "your insurer" wording only.

---

## 12. Demo script (target 2:30, max 3:00)

Record on a real phone screen (screen recording) plus a few shots of the car. Captions on. Calm voice-over by Ian.

| Time | Shot | Voice-over (draft) |
| --- | --- | --- |
| 0:00 to 0:15 | Ian on camera, or a damaged car on a Nairobi road | "In Kenya, after a car accident, your insurance claim can stall for days because one photo or one document is missing. I've seen it from inside the insurance industry. This is Ajali Kit. Ajali means accident in Swahili." |
| 0:15 to 0:30 | Home, tap "I've had an accident", safety check | "It starts with safety. Then it captures the time and place automatically." |
| 0:30 to 0:50 | Guided photo checklist, take damage photos | "It tells you exactly which photos an insurer needs." |
| 0:50 to 1:25 | AI damage check: progress, masks appear, damage list, user edits one item, adds a missed dent by drawing a box | "Muse Spark looks at each photo and finds every damaged part. SAM 3.1 then traces the exact damaged area, pixel by pixel, and the whole car, so you see how much of it is damaged. I stay in control: I can fix a label, or draw a box around something it missed, and SAM traces that too." |
| 1:25 to 1:45 | Scan the other driver's licence, fields fill, low-confidence field highlighted | "Scan the other driver's licence and the form fills itself. Anything it isn't sure about is highlighted." |
| 1:45 to 1:55 | Police OB number and witness | "It reminds you to get your OB number and records witnesses." |
| 1:55 to 2:15 | Claim draft with a consistency warning ("you said you were hit from behind, but the damage is on the front") | "Muse Spark turns my own words into a clear account, without adding anything, and catches contradictions before the insurer does." |
| 2:15 to 2:30 | PDF pack scroll, Share sheet | "One tap builds a complete claim pack, annotated photos included, ready to share. Everything stays on my phone." |
| 2:30 to 2:40 | Logo, URL, "Built with Muse Spark and SAM 3.1" | "Ajali Kit. Your claim pack, sorted." |

Prepare a "Demo incident" fixture (Settings, dev only) that preloads photos and results, as a backup if the network fails during recording. Say in the write-up which parts were live.

---

## 13. Acceptance criteria per feature

**A1. App shell and PWA**
- Installs to the home screen on Android Chrome; opens full screen with the app icon.
- Lighthouse PWA installable check passes.
- Works at 360 px width with no horizontal scroll.

**A2. Local storage**
- An incident with 10 photos survives closing and reopening the browser.
- Deleting an incident removes its photos (verified by blob count).

**A3. Safety and incident basics**
- "Is anyone hurt? Yes" shows working `tel:` buttons.
- Time is prefilled; location is captured when allowed; flow continues when location is denied.

**A4. Photo capture**
- Photos are stored at max 1600 px long side, EXIF orientation corrected (portrait photos display upright).
- Each shot in the checklist shows a tick and thumbnail after capture.

**A5. AI damage check**
- On 3 real damage photos, at least one damage item is returned with a visible mask on each.
- Masks line up with the photo (no offset or stretch) on both portrait and landscape photos.
- Zero-damage and non-vehicle photos show the right message, not an error.
- Confirm, edit, delete and "Add missed damage" all persist.
- Mock mode produces the same UI with no network calls (verified in DevTools Network tab).
- Median time per photo under 15 seconds on 4G (target, not a blocker).

**A6. Document extraction**
- A clear licence photo fills name and licence number; low-confidence fields are highlighted.
- Confirmed fields are never overwritten by a re-scan.

**A7. Police and witnesses**
- OB number can be saved empty; the pack then lists it as outstanding.
- Witness phone appears in the PDF only with the consent tick.

**A8. Claim draft**
- The draft contains no fact absent from the input (manual check on 3 test cases).
- A test case with a front-damage photo and a "hit from behind" account produces a consistency warning.
- The user's original words stay available and the PDF can be built even if the draft call fails.

**A9. PDF**
- PDF opens in Chrome and the phone's PDF viewer; includes all sections in section F9; annotated photos match the on-screen overlays.
- File size under 15 MB for 12 photos.

**A10. Share**
- Share sheet opens with the PDF on Android Chrome; Download works on desktop; mailto prefills subject and body.

**A11. Security**
- No API key in the client bundle (search the `.next/static` output for the key prefix).
- `.env.local` is git-ignored.

---

## 14. Build order (phases and tasks for Claude Code)

Work top to bottom. Finish and check each phase before the next. Commit locally after each task (no push). Keep a short `PROGRESS.md` log.

**Phase 0: Scaffold (about 1 hour)**
- P0.1 `create-next-app` with TypeScript, App Router, Tailwind, ESLint, `src/` dir. Node 22.
- P0.2 Add shadcn/ui, zod, dexie, openai, @meta-sam/parser (>=0.1.0), @react-pdf/renderer, vitest.
- P0.3 `.env.example`, `.gitignore` check, `lib/meta.ts` (server only), `lib/mock.ts`.
- P0.4 PWA manifest, icons (placeholder), service worker for the app shell.
- Check: `npm run dev`, `npm run build`, `npm test` all pass.

**Phase 1: Data and shell (about 1.5 hours)**
- P1.1 Dexie schema for section 7 types, with helpers (`createIncident`, `savePhoto`, `getIncident`, `deleteIncident`).
- P1.2 App shell, routes: `/` (Home), `/onboarding`, `/vehicle`, `/incident/[id]` (hub) and sub-routes, `/settings`.
- P1.3 Design tokens, layout, bottom action bar component, status chip component.
- Check: create and delete an incident from the UI.

**Phase 2: Scene capture (about 3 hours)**
- P2.1 S04 Home, S05 Safety check, S06 Incident basics (geolocation).
- P2.2 S07 Hub with section status logic.
- P2.3 S08 Photo checklist, S09 capture and preview, image compression and EXIF fix, thumbnails.
- Check: A3 and A4.

**Phase 3: Damage AI (about 6 hours, most important)**
- P3.1 `scripts/smoke-muse.ts` and `scripts/smoke-sam.ts` that call the real API on a local image and print results. Ian runs them.
- P3.2 `/api/analyze-photo` with schema, mock fixture, retries.
- P3.3 `/api/segment` (modes `concept` and `boxes`), parser, SVG path and area output, mock fixture.
- P3.4 Box conversion utils (0..1000 to pixels, clamp, min size) with unit tests.
- P3.5 Client orchestration: per-photo pipeline (analyze, then vehicle mask and box masks in parallel), concurrency 3, progress states.
- P3.6 S10 consent sheet, S11 Damage review with canvas overlay, edit, delete, confirm.
- P3.7 "Add missed damage" box drawing (touch drag) -> single box prompt.
- Check: A5.

**Phase 4: Other party, police, witnesses (about 3 hours)**
- P4.1 `/api/extract-document` with schema and fixtures.
- P4.2 S12 Other party form with scan buttons, highlights, confirm.
- P4.3 S13 Police report, S14 Witnesses.
- Check: A6, A7.

**Phase 5: Claim draft (about 2 hours)**
- P5.1 Build the minimal incident summary for the model (no IDs, phones or photos).
- P5.2 `/api/draft-claim` with schema and fixtures.
- P5.3 S15 My account, S16 Draft review with warnings, questions, redraft, declaration.
- Check: A8.

**Phase 6: PDF and share (about 3 hours)**
- P6.1 Flatten overlays to PNG per damage photo (canvas -> Blob).
- P6.2 PDF document with @react-pdf/renderer per F9 layout.
- P6.3 S17 Readiness, S18 Preview and share, S18b printable HTML fallback.
- Check: A9, A10.

**Phase 7: Polish and ship (about 3 hours)**
- P7.1 Loading, empty and error states everywhere; offline banner.
- P7.2 Demo incident fixture (dev only) for a reliable demo.
- P7.3 README (what it is, Meta models used and how, setup, env vars, scripts, architecture diagram as Mermaid), LICENSE (Ian to choose; MIT suggested).
- P7.4 Security check (A11), Lighthouse check (A1), Playwright smoke run in mock mode.
- Hand over to Ian for the Vercel deploy.

**Phase 8: Stretch (only after the demo is recorded once)**
In order: voice statement, privacy redaction ("face" concept, blur for a shareable copy), walk-around video tracking, Swahili, insurer view, offline queue.

---

## 15. Unverified items

- Exact submission form fields (video length, public repo requirement). Check the portal after sign-in.
- Ajali Kit application text (not in email). Spec built from the one-line pitch.
- Reasoning effort field name on the Responses API.
- Muse Voice Transcribe request shape and Swahili quality (stretch only).
- Mask raster size versus box size for large objects (handled by scaling; confirm on the first real call).
- Whether the openai SDK version in use accepts `metadata` values and `input_image` shapes without casts (cast if needed).
- Kenyan claim process details in guidance copy (police reporting time limits, standard insurer document list, emergency numbers 999 and 112). Ian to confirm.
- Vercel `maxDuration` limit on Ian's plan.
