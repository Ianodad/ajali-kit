import type { PhotoCategory } from "./types";

// Shot list for S08 Photo checklist, SPEC section 5 (F3) step 1. Each row
// maps to one PhotoCategory. "required" rows are the ones the Photos hub
// section needs before it counts as done: the scene and the user's own car
// are always relevant; the other party's photos are not, since there may be
// no other vehicle (that is decided in a later phase, section "Other
// party").
export interface ShotListItem {
  category: PhotoCategory;
  title: string;
  minCount: number;
  required: boolean;
}

export const SHOT_LIST: ShotListItem[] = [
  { category: "scene", title: "Wide shot of the scene", minCount: 1, required: true },
  { category: "own_vehicle", title: "Your car, all four sides", minCount: 4, required: true },
  { category: "own_damage", title: "Close-ups of each damaged area on your car", minCount: 1, required: true },
  { category: "other_damage", title: "The other car's damage close-ups", minCount: 1, required: false },
  { category: "plate", title: "The other car's number plate", minCount: 1, required: false },
  { category: "other", title: "Road signs, skid marks, anything relevant", minCount: 0, required: false },
];
