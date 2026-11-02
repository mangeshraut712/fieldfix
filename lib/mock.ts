import type { Diagnosis, Identify, Segment } from "./types";

// Canned output used when META_API_KEY is not set. The UI labels it as mock data.
export const MOCK_IDENTIFY: Identify = { object: "bicycle rear derailleur (mock)", parts: ["chain", "derailleur", "gear"] };

export function mockSegments(width: number, height: number): Segment[] {
  const box = (l: number, t: number, r: number, b: number) => ({
    left: Math.round(l * width),
    top: Math.round(t * height),
    right: Math.round(r * width),
    bottom: Math.round(b * height),
  });
  return [
    { label: "gear", objectId: "gear#0", box: box(0.3, 0.05, 0.55, 0.5) },
    { label: "derailleur", objectId: "derailleur#0", box: box(0.5, 0.35, 0.62, 0.75) },
    { label: "chain", objectId: "chain#0", box: box(0.6, 0.65, 0.92, 0.75) },
  ];
}

export const MOCK_DIAGNOSIS: Diagnosis = {
  object: "Bicycle rear derailleur (mock)",
  likelyIssue: "Mock result: cable tension is low, so the chain hesitates when shifting to larger cogs.",
  confidence: "medium",
  safety: ["Mock result. Set a META_API_KEY to get a real diagnosis.", "Keep fingers clear of the chain and cogs while turning the cranks."],
  tools: ["5 mm hex key", "Phillips screwdriver", "chain checker"],
  steps: [
    { title: "Check the hanger", detail: "Look from behind; the derailleur should hang straight below the cogs.", part: "derailleur", sourceId: "park-rd-adjust" },
    { title: "Shift to the smallest cog", detail: "Turn the cranks and shift until the chain sits on the smallest cog.", part: "gear", sourceId: "park-rd-adjust" },
    { title: "Add cable tension", detail: "Turn the barrel adjuster counterclockwise a quarter turn, then test shifts up the cassette.", part: "derailleur", sourceId: "park-rd-adjust" },
    { title: "Check chain wear", detail: "Measure with a chain checker; replace the chain if it is past the limit for your drivetrain.", part: "chain", sourceId: "park-chain-wear" },
  ],
  whenToStop: "Stop if the hanger is visibly bent or cracked; a bike shop can straighten or replace it.",
};
