import { z } from "zod";
import {
  assertDocumentScope,
  documentScope,
  normalizeUrl,
} from "../worker/network/url-scope";
import { URLSchema } from "./primitives";
export const RenderTaskSchema = z
  .object({
    url: z.string().max(8192),
    scope: z.array(z.string().min(1).max(253)).min(1).max(2),
    pathPrefix: z.string().max(2048).regex(/^(\/.*[^/])?$/).optional(),
    timeoutMs: z.number().int().min(1).max(25000).default(25000),
    maxDesignBytes: z
      .number()
      .int()
      .min(0)
      .max(15 * 1024 * 1024)
      .default(15 * 1024 * 1024),
  })
  .strict()
  .superRefine((task, ctx) => {
    try {
      assertDocumentScope(normalizeUrl(task.url), task.scope, task.pathPrefix);
      if (task.scope.some((host) => !documentScope(task.url).includes(host))) {
        throw new Error("Unrelated scope");
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid render URL/scope" });
    }
  });
export type RenderTask = z.infer<typeof RenderTaskSchema>;
const selector = z.string().max(2000);
const label = z.string().max(500);
const observedText = z.string().max(2000);
export const RenderResultSchema = z
  .object({
    finalUrl: z.string().max(8192),
    text: z.string().max(100000),
    styles: z
      .array(
        z
          .object({
            selector,
            evidenceId: z.string().max(200),
            fontFamily: observedText,
            fontSize: label,
            fontWeight: label,
            color: label,
            backgroundColor: label,
          })
          .strict(),
      )
      .max(100),
    stylesheets: z
      .array(
        z
          .object({
            url: URLSchema.nullable(),
            declarations: z.string().max(100000),
            status: z.enum(["available", "unavailable"]),
          })
          .strict(),
      )
      .max(50),
    fonts: z
      .array(z.object({ url: URLSchema, loaded: z.boolean() }).strict())
      .max(100),
    logos: z
      .array(z.object({ url: URLSchema, alt: label, context: label }).strict())
      .max(40),
    // Optional only for previously captured results. New renderer captures populate every observation collection.
    links: z
      .array(z.object({ url: URLSchema, label, selector }).strict())
      .max(500)
      .optional(),
    forms: z
      .array(
        z
          .object({
            selector,
            action: URLSchema.nullable(),
            method: z.string().max(20),
            labels: z.array(label).max(30),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    ctas: z
      .array(
        z
          .object({ selector, label, destination: URLSchema.nullable() })
          .strict(),
      )
      .max(100)
      .optional(),
    headings: z
      .array(
        z
          .object({
            selector,
            level: z.number().int().min(1).max(6),
            text: observedText,
          })
          .strict(),
      )
      .max(200)
      .optional(),
    addresses: z
      .array(z.object({ selector, text: observedText }).strict())
      .max(30)
      .optional(),
    priceText: z
      .array(z.object({ selector, text: observedText }).strict())
      .max(40)
      .optional(),
    metadata: z
      .object({
        title: observedText.nullable(),
        meta: z
          .array(
            z
              .object({ name: z.string().max(200), content: observedText })
              .strict(),
          )
          .max(80),
        canonical: URLSchema.nullable(),
        jsonLd: z.array(z.string().max(16000)).max(10),
      })
      .strict()
      .optional(),
    limitations: z.array(z.string().max(500)).max(100),
    resourceBytes: z
      .number()
      .int()
      .nonnegative()
      .max(15 * 1024 * 1024),
  })
  .strict();
export type RenderResult = z.infer<typeof RenderResultSchema>;
