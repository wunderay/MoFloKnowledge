import { route, readJson, rpc } from "../../../server/http";
import { IdSchema } from "../../../contracts/api-common";
export const runtime = "nodejs";
import { CreateCompanySchema } from "../../../contracts/api-companies";
export const POST = route(async (request, _context, { client }) => {
  const b = await readJson(request, CreateCompanySchema);
  return {
    companyId: await rpc(client, "create_company", {
      p_name: b.name,
      p_website: b.website,
      p_request: b.requestId,
    }),
    role: "owner",
  };
}, 201);
import { z } from "zod";
import { readCompanySummaries } from "../../../server/company-summaries";
export const GET = route(async (request, _context, { client, user }) => {
  const query = z
    .object({
      cursor: IdSchema.optional(),
      archived: z.enum(["true", "false"]).optional(),
    })
    .strict()
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  return readCompanySummaries(client, user!.id, {
    cursor: query.cursor,
    archived: query.archived === "true",
  });
});
