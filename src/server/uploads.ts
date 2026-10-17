import "server-only";
import { HttpError, mapDatabaseError } from "./http";
import { authorizeCompany } from "./authorize";
import { IdSchema } from "../contracts/api-common";
import type { verifiedSession } from "../lib/supabase/server";
type Client = Awaited<ReturnType<typeof verifiedSession>>["client"];

export const UPLOAD_BUCKET = "knowledge-assets";
const MiB = 1024 * 1024;
const LIMITS = { logos: 10 * MiB, portraits: 5 * MiB, "offering-images": 5 * MiB } as const;
export type UploadKind = keyof typeof LIMITS;
export const UPLOAD_KINDS = Object.keys(LIMITS) as UploadKind[];
/** Largest request body worth parsing: the biggest file plus multipart framing. */
export const MAX_REQUEST_BYTES = 10 * MiB + MiB;
export const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
export const TYPES_MESSAGE = "Use PNG, JPG, GIF, WebP, or SVG";

export function limitFor(kind: UploadKind) {
  return LIMITS[kind];
}
export function limitMessage(kind: UploadKind) {
  return `Max ${LIMITS[kind] / MiB}MB`;
}
export function parseId(value: unknown) {
  return IdSchema.parse(value).toLowerCase();
}
export function unavailable() {
  return new HttpError(404, "unavailable", "Resource unavailable.");
}
/** Storage errors are never forwarded: provider text can carry signed URLs, keys or hostnames. */
export function storageUnavailable() {
  return new HttpError(503, "unavailable", "The service is temporarily unavailable. Please retry.");
}
export function isStorageNotFound(error: unknown) {
  const value = error as { status?: unknown; statusCode?: unknown; message?: unknown } | null;
  return (
    Number(value?.status) === 404 ||
    Number(value?.statusCode) === 404 ||
    /^object not found$/i.test(String(value?.message ?? ""))
  );
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));
// An SVG document: optional BOM, XML prolog, comments and a DOCTYPE without an internal subset, then <svg.
const SVG_HEAD =
  /^﻿?\s*(?:<\?xml\s[^>]*\?>\s*)?(?:<!--(?:(?!-->)[\s\S])*-->\s*)*(?:<!DOCTYPE\s+svg\b[^>[]*>\s*)?(?:<!--(?:(?!-->)[\s\S])*-->\s*)*<svg[\s>/]/;

/** The image type the bytes really are, from their magic numbers; client filename and MIME are never consulted. */
export function sniffImage(bytes: Uint8Array): { ext: string; type: string } | null {
  let ext: string | null = null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ext = "png";
  else if (startsWith(bytes, [0xff, 0xd8, 0xff])) ext = "jpg";
  else if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) ext = "gif";
  else if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) ext = "webp";
  else if (SVG_HEAD.test(new TextDecoder("utf-8").decode(bytes.subarray(0, 2048)))) ext = "svg";
  return ext ? { ext, type: TYPE_BY_EXTENSION[ext]! } : null;
}

/** Membership first (non-members learn nothing); writes also need a non-viewer role and a live company. */
export async function authorizeUploads(client: Client, companyId: string, userId: string, write: boolean) {
  await authorizeCompany(client, companyId, userId, write);
  if (!write) return;
  const { data, error } = await client.from("companies").select("archived_at").eq("id", companyId).maybeSingle();
  if (error) throw mapDatabaseError(error);
  if (!data) throw unavailable();
  if (data.archived_at) throw new HttpError(422, "validation", "This company is archived.");
}

/** The upload row of this company, with its storage path re-checked against the canonical shape. */
export async function findUpload(client: Client, companyId: string, uploadId: string) {
  const { data, error } = await client
    .from("uploads")
    .select("id, path")
    .eq("id", uploadId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw mapDatabaseError(error);
  const match = /^(?:logos|portraits|offering-images)\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp|svg)$/.exec(
    String(data?.path ?? ""),
  );
  if (!data || !match || match[1] !== companyId) throw unavailable();
  return { path: String(data.path), type: TYPE_BY_EXTENSION[match[2]!]! };
}
