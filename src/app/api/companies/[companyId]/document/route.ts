/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- untyped supabase-js rows/RPC results (no generated DB types); zod-validated before use */
import { route } from "../../../../../server/http";
import { IdSchema } from "../../../../../contracts/api-common";
import { readDraft } from "../../../../../server/read-model";
import { readSnapshot } from "../../../../../server/snapshots";
import { documentFilename, renderKnowledgeDocument } from "../../../../../knowledge/document-export";
import { documentData } from "../../../../../knowledge/document-export";
import { canonicalStringify } from "../../../../../knowledge/canonical-json";
import { renderKnowledgePdf } from "../../../../../knowledge/pdf-export";
import { z } from "zod";

export const runtime = "nodejs";

export const GET = route(async (request, context, { client, user }) => {
  const companyId = IdSchema.parse((await context.params).companyId);
  const parameters = new URL(request.url).searchParams;
  const selected = parameters.get("versionId");
  const format = z.enum(["json", "docx", "pdf"]).parse(parameters.get("format"));
  const input = selected === "draft"
    ? { kind: "draft" as const, draft: await readDraft(client, companyId, user.id) }
    : await readSnapshot(client, companyId, IdSchema.parse(selected), user.id).then((saved) => ({ kind: "snapshot" as const, snapshot: saved.payload, stored: saved.stored }));
  const name = input.kind === "draft" ? input.draft.company.name : input.snapshot.provenance.company.name;
  const version = input.kind === "draft" ? "draft" : input.snapshot.version;
  const bytes = format === "json" ? canonicalStringify(documentData(input))
    : new Uint8Array(format === "pdf" ? await renderKnowledgePdf(input) : await renderKnowledgeDocument(input));
  const filename = documentFilename(name, version).replace(/\.docx$/, `.${format}`);
  return new Response(typeof bytes === "string" ? bytes : new Uint8Array(bytes), {
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : format === "pdf" ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
});
