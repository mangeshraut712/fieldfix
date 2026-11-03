import { z } from "zod";

export const bodySchema = z.object({
  imageDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(6_000_000),
  symptom: z.string().max(500).default(""),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
});
