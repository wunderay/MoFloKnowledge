import { mapDatabaseError, route } from "../../../../../../server/http";
import {
  UPLOAD_BUCKET,
  authorizeUploads,
  findUpload,
  isStorageNotFound,
  parseId,
  storageUnavailable,
  unavailable,
} from "../../../../../../server/uploads";
export const runtime = "nodejs";

export const GET = route(async (_request, context, { client, user }) => {
  const params = await context.params;
  const companyId = parseId(params.companyId);
  const uploadId = parseId(params.uploadId);
  await authorizeUploads(client, companyId, user!.id, false);
  const upload = await findUpload(client, companyId, uploadId);
  const { data, error } = await client.storage.from(UPLOAD_BUCKET).download(upload.path);
  if (error || !data) {
    throw error && !isStorageNotFound(error) ? storageUnavailable() : unavailable();
  }
  // The type comes from the extension this app chose at upload time, never from stored metadata, and the
  // response is inert whatever the bytes are: no sniffing, no script, no subresources, no framing as a document.
  return new Response(data.stream(), {
    headers: {
      "Content-Type": upload.type,
      "Content-Length": String(data.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, no-cache",
      Vary: "Cookie",
    },
  });
});

export const DELETE = route(async (_request, context, { client, user }) => {
  const params = await context.params;
  const companyId = parseId(params.companyId);
  const uploadId = parseId(params.uploadId);
  await authorizeUploads(client, companyId, user!.id, true);
  const upload = await findUpload(client, companyId, uploadId);
  // Object first, metadata second: a failure in between leaves a row that still serves or 404s, never a
  // readable object without a row. Removing an already-missing object is not an error, so a retry completes.
  const removed = await client.storage.from(UPLOAD_BUCKET).remove([upload.path]);
  if (removed.error) {
    throw storageUnavailable();
  }
  const { data, error } = await client
    .from("uploads")
    .delete()
    .eq("id", uploadId)
    .eq("company_id", companyId)
    .select("id");
  if (error) {
    throw mapDatabaseError(error);
  }
  if (!data?.length) {
    throw unavailable();
  } // another request deleted it first, or the row was not ours to delete
  return { id: uploadId };
});
