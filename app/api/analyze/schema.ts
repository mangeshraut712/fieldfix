import { z } from "zod";

export const bodySchema = z.object({
  imageDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(6_000_000),
  symptom: z.string().max(500).default(""),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
});

/** A specific 400 message for the field that failed, instead of blaming the image for every rejection. */
export function describeBodyError(error: z.ZodError): string {
  const paths = new Set(error.issues.map((issue) => issue.path[0]));
  if (paths.has("symptom")) return "Keep the symptom description under 500 characters.";
  if (paths.has("width") || paths.has("height")) return "Width and height must be positive integers up to 4096.";
  if (paths.has("imageDataUrl")) {
    const issue = error.issues.find((item) => item.path[0] === "imageDataUrl");
    if (issue?.code === "too_big") return "Send a JPEG, PNG or WebP image under about 4 MB.";
    return "Send a JPEG, PNG or WebP image.";
  }
  return "Send a JPEG, PNG or WebP image, a short symptom, and the image size.";
}
