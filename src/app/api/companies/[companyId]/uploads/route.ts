import { randomUUID } from "node:crypto";
import { HttpError, mapDatabaseError, route } from "../../../../../server/http";
import {
  MAX_REQUEST_BYTES,
  TYPES_MESSAGE,
  UPLOAD_BUCKET,
  UPLOAD_KINDS,
  authorizeUploads,
  limitFor,
  limitMessage,
  parseId,
  sniffImage,
  storageUnavailable,
  type UploadKind,
} from "../../../../../server/uploads";
export const runtime = "nodejs";

export const POST = route(async (request, context, { client, user }) => {
  const companyId = parseId((await context.params).companyId);
  await authorizeUploads(client, companyId, user!.id, true);
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_REQUEST_BYTES) throw new HttpError(413, "payload_too_large", limitMessage("logos"));
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "invalid_input", "Send the image as multipart form data.");
  }
  const kind = form.get("kind");
  if (typeof kind !== "string" || !UPLOAD_KINDS.includes(kind as UploadKind))
    throw new HttpError(400, "invalid_input", "Choose logos, portraits, or offering-images.");
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "invalid_input", "Choose an image file.");
  if (file.size === 0) throw new HttpError(400, "invalid_input", "That file is empty.");
  if (file.size > limitFor(kind as UploadKind))
    throw new HttpError(413, "payload_too_large", limitMessage(kind as UploadKind));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = sniffImage(bytes);
  if (!image) throw new HttpError(415, "unsupported_type", TYPES_MESSAGE);

  // The object name is built only from the validated kind, company, a fresh uuid and the sniffed extension.
  const id = randomUUID();
  const path = `${kind}/${companyId}/${id}.${image.ext}`;
  const stored = await client.storage
    .from(UPLOAD_BUCKET)
    .upload(path, bytes, { contentType: image.type, upsert: false });
  if (stored.error) throw storageUnavailable();
  const inserted = await client.from("uploads").insert({
    id,
    company_id: companyId,
    kind,
    path,
    content_type: image.type,
    size_bytes: bytes.byteLength,
    created_by: user!.id,
  });
  if (inserted.error) {
    // No metadata row means no readable upload: take the object back out so nothing is left half-written.
    try {
      await client.storage.from(UPLOAD_BUCKET).remove([path]);
    } catch {
      /* An unreferenced object is unreachable through the app. */
    }
    throw mapDatabaseError(inserted.error);
  }
  return { id, path, content_type: image.type, size_bytes: bytes.byteLength, url: `/api/companies/${companyId}/uploads/${id}` };
}, 201);
