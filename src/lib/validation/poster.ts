import { z } from "zod";

export const posterUrlBodySchema = z
  .object({
    url: z.string().trim().min(1).max(2048),
  })
  .strict();
