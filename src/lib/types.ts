// Data model from SPEC.md section 7. Stored in IndexedDB via Dexie (see db.ts).
// All ids are crypto.randomUUID(). All times are ISO 8601 strings with offset.

export type IncidentStatus = "draft" | "ready" | "exported";

export interface OwnVehicle {
  registration: string; // e.g. "KDA 123A" (format not validated strictly)
  make?: string;
  model?: string;
  year?: number;
  colour?: string;
  insurer?: string;
  policyNumber?: string;
  ownerName?: string;
  ownerPhone?: string;
  insurerClaimsEmail?: string;
}

export interface Incident {
  id: string;
  reference: string; // "AJK-YYYYMMDD-XXXX"
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  occurredAt: string;
  location: { lat?: number; lng?: number; accuracyM?: number; text: string };
  conditions: { weather?: "clear" | "rain" | "fog"; light?: "day" | "dusk" | "night"; road?: string[] };
  anyoneInjured: boolean | null;
  shortDescription?: string;
  ownVehicle: OwnVehicle; // snapshot copied from settings at creation
  otherParties: OtherParty[];
  police: PoliceReport;
  witnesses: Witness[];
  account: ClaimAccount;
  aiConsent: boolean;
}

export type PhotoCategory =
  | "scene"
  | "own_damage"
  | "other_damage"
  | "own_vehicle"
  | "other_vehicle"
  | "plate"
  | "document"
  | "other";
export type DocType =
  | "driving_licence"
  | "logbook"
  | "insurance_certificate"
  | "police_abstract"
  | "national_id"
  | "other";

export interface Photo {
  id: string;
  incidentId: string;
  category: PhotoCategory;
  docType?: DocType;
  otherPartyId?: string;
  blobId: string;
  thumbBlobId: string;
  width: number;
  height: number; // after EXIF rotation and compression
  takenAt: string;
  lat?: number;
  lng?: number;
  analysis?: DamageAnalysis;
}

export type Severity = "minor" | "moderate" | "severe";
export type DamageType =
  | "dent"
  | "scratch"
  | "crack"
  | "broken"
  | "missing_part"
  | "deformation"
  | "paint_damage"
  | "glass_damage"
  | "other";

export interface DamageItem {
  id: string;
  samObjectId: number; // 1..16, matches the box prompt id
  part: string; // e.g. "rear bumper"
  damageType: DamageType;
  severity: Severity; // indicative only
  description: string;
  boxNorm: [number, number, number, number]; // x1,y1,x2,y2 on 0..1000 grid (Muse Spark)
  boxPx: { left: number; top: number; right: number; bottom: number };
  maskSvgPath?: string; // from decodeMaskToSVGPath, in mask raster coords
  maskBoxPx?: { left: number; top: number; right: number; bottom: number }; // SAM box
  maskRasterWidth?: number; // the mask's own raster size: not always equal to maskBoxPx's size (SPEC 8.3)
  maskRasterHeight?: number;
  maskAreaPx?: number;
  shareOfVehicle?: number; // 0..1
  source: "ai" | "user";
  status: "pending" | "confirmed" | "deleted";
}

export interface DamageAnalysis {
  model: string;
  analysedAt: string;
  isVehiclePhoto: boolean;
  vehicleSide?:
    | "front"
    | "rear"
    | "left"
    | "right"
    | "front_left"
    | "front_right"
    | "rear_left"
    | "rear_right"
    | "top"
    | "unknown";
  qualityNote?: string;
  vehicleMask?: {
    svgPath: string;
    boxPx: { left: number; top: number; right: number; bottom: number };
    rasterWidth?: number; // the mask's own raster size: not always equal to boxPx's size (SPEC 8.3)
    rasterHeight?: number;
    areaPx: number;
  };
  items: DamageItem[];
  errors?: string[];
  skipped?: boolean; // the user chose "Skip AI for this photo" after repeated failures
}

export interface ExtractedField {
  value: string;
  confidence: "high" | "medium" | "low";
  userConfirmed: boolean;
}

export interface OtherParty {
  id: string;
  driver: {
    name?: ExtractedField;
    phone?: string;
    idNumber?: ExtractedField;
    licenceNumber?: ExtractedField;
    licenceExpiry?: ExtractedField;
  };
  vehicle: { registration?: ExtractedField; make?: ExtractedField; model?: ExtractedField; colour?: string };
  owner?: { name?: ExtractedField; phone?: string };
  insurance?: { insurer?: ExtractedField; policyOrCertificateNo?: ExtractedField; expiry?: ExtractedField };
  refusedToShare: boolean;
  notes?: string;
  confirmed: boolean;
}

export interface PoliceReport {
  station?: string;
  obNumber?: string;
  reportedAt?: string;
  officerName?: string;
  abstractObtained: boolean;
  abstractPhotoId?: string;
}

export interface Witness {
  id: string;
  name: string;
  phone?: string;
  consentToContact: boolean;
  statement: string;
}

export interface ClaimAccount {
  userWords: string;
  draft?: ClaimDraft;
  finalText?: string;
  confirmed: boolean;
  confirmedAt?: string;
}

export interface ClaimDraft {
  account: string;
  damageSchedule: { vehicle: "own" | "other"; part: string; damage: string; photoRefs: string[] }[];
  missingItems: { item: string; why: string }[];
  consistencyWarnings: { warning: string; section: "photos" | "account" | "other_party" | "police" | "witnesses" }[];
  questionsForUser: string[];
  model: string;
  draftedAt: string;
}

export interface StoredBlob {
  id: string;
  blob: Blob;
  mime: string;
}
