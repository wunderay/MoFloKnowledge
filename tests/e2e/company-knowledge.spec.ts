import { test, expect, type Page } from "@playwright/test";
import { KnowledgeBaseExportSchema } from "../../src/contracts/knowledge-base";
import { resolveStablePointer } from "../../src/contracts/stable-pointer";
import { canonicalStringify } from "../../src/knowledge/canonical-json";

const ownerEmail = process.env.MOFLO_E2E_OWNER_EMAIL;
const ownerPassword = process.env.MOFLO_E2E_OWNER_PASSWORD;
const secondEmail = process.env.MOFLO_E2E_SECOND_EMAIL;
const secondPassword = process.env.MOFLO_E2E_SECOND_PASSWORD;
const fixtureUrl = process.env.MOFLO_E2E_FIXTURE_URL;

async function signIn(
  page: Page,
  email: string,
  password: string,
  screenshotPath?: string,
) {
  await page.goto("/sign-in");
  if (screenshotPath)
    await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// This is the single integrated browser scenario. It uses real session cookies,
// database writes and the controlled worker website; missing deployment inputs
// are reported as skipped setup, never represented as successful acceptance.
test("company website to reviewed immutable snapshot, with tenant and viewer boundaries", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(
    !ownerEmail ||
      !ownerPassword ||
      !secondEmail ||
      !secondPassword ||
      !fixtureUrl,
    "Requires two real local Auth users, the migrated database, running worker, and controlled fixture website.",
  );
  test.setTimeout(180_000);
  const secondaryContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  const secondary = await secondaryContext.newPage();
  await signIn(secondary, secondEmail!, secondPassword!);
  const mutationHeaders = { Origin: new URL(secondary.url()).origin };
  const secondCreate = await secondary.request.post("/api/companies", {
    headers: mutationHeaders,
    data: {
      name: "Other tenant E2E",
      website: fixtureUrl,
      requestId: crypto.randomUUID(),
    },
  });
  expect(secondCreate.status()).toBe(201);
  const secondId = (await secondCreate.json()).data.companyId;
  const secondDraft = (
    await (
      await secondary.request.get(`/api/companies/${secondId}/draft`)
    ).json()
  ).data;
  const secondActor = secondDraft.actorId;
  expect(secondActor).toMatch(/^[0-9a-f-]{36}$/);

  await signIn(
    page,
    ownerEmail!,
    ownerPassword!,
    testInfo.outputPath("sign-in-desktop.png"),
  );
  await expect(
    page.getByRole("button", { name: "Add company" }).first(),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("companies-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add company" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Add a company" });
  await createDialog.getByLabel("Company name").fill("Lumen Ledger E2E");
  await createDialog.getByLabel("Company website").fill(fixtureUrl!);
  await createDialog
    .getByRole("button", { name: "Create company", exact: true })
    .click();
  await expect(page).toHaveURL(/\/knowledge\?companyId=[0-9a-f-]{36}$/);
  const companyId = new URL(page.url()).searchParams.get("companyId")!;
  const base = `/api/companies/${companyId}`;
  expect(
    (await (await page.request.get(`${base}/draft`)).json()).data.company.role,
  ).toBe("owner");
  await page.getByRole("button", { name: "Start scrape", exact: true }).click();
  await expect(page).toHaveURL(/jobId=/);
  await page.reload();
  await expect(
    page.getByText(/results are ready for review|Partial results are ready/),
  ).toBeVisible({ timeout: 100_000 });
  const categories = [
    "Company foundation",
    "Positioning",
    "Market & customers",
    "Branding & style",
    "Online presence",
    "Key people",
    "Offerings",
  ];
  for (const category of categories) {
    await page
      .getByRole("navigation", { name: "Knowledge categories" })
      .getByRole("button", { name: new RegExp(category.replace("&", "\\&")) })
      .click();
    await expect(
      page.getByRole("heading", { name: category, exact: true }).first(),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation", { name: "Knowledge categories" })
    .getByRole("button", { name: /Company foundation/ })
    .click();
  const evidenceTrigger = page
    .getByRole("button", { name: "Evidence for overview", exact: true })
    .first();
  await evidenceTrigger.hover();
  const evidenceDialog = page.getByRole("dialog", {
    name: "Field evidence",
    exact: true,
  });
  await expect(evidenceDialog).toBeVisible();
  await expect(evidenceDialog.locator("blockquote").first()).not.toBeEmpty();
  await evidenceDialog.getByRole("link").first().hover();
  await page.waitForTimeout(200); // Cross the popover's pointer-leave grace period.
  await expect(evidenceDialog).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("evidence-desktop.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(evidenceDialog).toBeHidden();
  await evidenceTrigger.focus();
  await expect(evidenceDialog).toBeVisible();
  await page
    .getByRole("heading", { name: "Lumen Ledger E2E", exact: true })
    .click();
  await expect(evidenceDialog).toBeHidden();
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await evidenceTrigger.click();
  await expect(evidenceDialog).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("evidence-mobile.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(evidenceDialog).toBeHidden();
  await page.setViewportSize(desktopViewport);
  // Review a source candidate first, then correct it explicitly. This exercises
  // source-origin selection, a permanent draft revision, and superseding user provenance.
  await page
    .getByRole("button", { name: /400 River Street/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved." }),
  ).toBeVisible();
  const address = page.getByRole("group", {
    name: "Main address",
    exact: true,
  });
  await address
    .getByLabel("Original address", { exact: true })
    .fill("11 Market Street, Portland, OR 97205, United States");
  await address.getByLabel("Line1", { exact: true }).fill("11 Market Street");
  await address.getByLabel("Postal code", { exact: true }).fill("97205");
  await address.getByLabel("Country", { exact: true }).fill("United States");
  // Both shell links and browser history must retain edits when leaving is cancelled.
  const editorUrl = page.url();
  for (const leave of [
    () =>
      page.getByRole("link", { name: "View knowledge", exact: true }).click(),
    () => page.evaluate(() => window.history.back()),
  ]) {
    const dialog = page.waitForEvent("dialog");
    const leaving = leave();
    await (await dialog).dismiss();
    await leaving;
    await expect(page).toHaveURL(editorUrl);
    await expect(address.getByLabel("Line1", { exact: true })).toHaveValue(
      "11 Market Street",
    );
  }

  await page
    .getByRole("button", { name: "Save and approve", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Entry saved and approved." }),
  ).toBeVisible();
  for (const category of categories.slice(1)) {
    await page
      .getByRole("navigation", { name: "Knowledge categories" })
      .getByRole("button", { name: new RegExp(category.replace("&", "\\&")) })
      .click();
    for (const approve of await page
      .getByRole("button", { name: "Approve unchanged", exact: true })
      .all()) {
      await approve.click();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Entry saved and approved." }),
      ).toBeVisible();
    }
  }
  await page
    .getByRole("navigation", { name: "Knowledge categories" })
    .getByRole("button", { name: /Key people/ })
    .click();
  await page.getByRole("button", { name: "Add person", exact: false }).click();
  const excludedPerson = page.locator(".knowledge-editor__entry").last();
  await excludedPerson
    .getByLabel("Name", { exact: true })
    .fill("Excluded profile");
  await excludedPerson
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Entry rejected." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save knowledge version", exact: true })
    .click();
  const publish = page.getByRole("dialog", {
    name: "Save knowledge base version",
  });
  await expect(
    publish.getByText("All entries are resolved.", { exact: false }),
  ).toBeVisible();
  await publish
    .getByRole("button", { name: "Save this version", exact: true })
    .click();
  const saved = page.getByRole("dialog", { name: /Version \d+ saved/ });
  const downloadUrl = await saved
    .getByRole("link", { name: /Download JSON/ })
    .getAttribute("href");
  expect(downloadUrl).toBeTruthy();
  const downloaded = await page.request.get(downloadUrl!);
  expect(downloaded.headers()["content-type"]).toContain("application/json");
  const snapshot = KnowledgeBaseExportSchema.parse(await downloaded.json());
  const frozen = canonicalStringify(snapshot);
  expect(snapshot.company_foundation.main_address?.raw).toBe(
    "11 Market Street, Portland, OR 97205, United States",
  );
  expect(snapshot.company_foundation.main_address?.line1).toBe(
    "11 Market Street",
  );
  expect(snapshot.key_people.length).toBeGreaterThan(0);
  expect(snapshot.key_people.every((person) => person.gender === null)).toBe(
    true,
  );
  expect(
    snapshot.key_people.some((person) => person.name === "Excluded profile"),
  ).toBe(false);
  expect(snapshot.company_foundation.legal_entity_type).toBeNull();
  expect(snapshot.company_foundation.year_founded).toBeNull();
  expect(snapshot.positioning.founding_story).toBeNull();
  expect(snapshot.market_and_customers.industry_outlook).toEqual([]);
  expect(snapshot.branding_and_style.logos.length).toBeGreaterThan(0);
  expect(
    snapshot.provenance.evidence.some(
      (evidence) => evidence.kind === "technical",
    ),
  ).toBe(true);
  expect(
    snapshot.provenance.claims.some(
      (claim) =>
        claim.targets.includes("/positioning/company_pitch") &&
        claim.origin === "source_backed",
    ),
  ).toBe(true);
  expect(snapshot.positioning.company_pitch).toBe(
    "Practical water data tools for community teams.",
  );
  expect(
    snapshot.provenance.claims.every(
      (claim) =>
        claim.origin === "source_backed" || claim.origin === "user_provided",
    ),
  ).toBe(true);
  expect(
    snapshot.provenance.claims.some(
      (claim) =>
        claim.targets.includes("/company_foundation/main_address/raw") &&
        claim.origin === "user_provided",
    ),
  ).toBe(true);
  expect(
    snapshot.provenance.operations.some(
      (operation) => operation.supersedes_claim_id !== null,
    ),
  ).toBe(true);
  for (const claim of snapshot.provenance.claims)
    for (const target of claim.targets)
      expect(() => resolveStablePointer(snapshot, target)).not.toThrow();
  expect(frozen).not.toContain("cleaned_content");
  await saved.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation", { name: "Knowledge categories" })
    .getByRole("button", { name: /Company foundation/ })
    .click();
  await page
    .getByLabel("Overview", { exact: true })
    .fill("A later draft edit that must not change version one.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved." }),
  ).toBeVisible();
  const savedOverview = "A later draft edit that must not change version one.";
  await page
    .getByLabel("Overview", { exact: true })
    .fill("An unsaved edit to discard.");
  const discardDialog = page.waitForEvent("dialog");
  const leaveEditor = page
    .getByRole("link", { name: "View knowledge", exact: true })
    .click();
  await (await discardDialog).accept();
  await leaveEditor;
  await expect(page).toHaveURL(/\/knowledge\/view/);
  await page.goto(editorUrl);
  await expect(page.getByLabel("Overview", { exact: true })).toHaveValue(
    savedOverview,
  );
  const afterEdit = (await (await page.request.get(`${base}/draft`)).json())
    .data;
  expect(
    afterEdit.entries.find(
      (entry: { kind: string }) => entry.kind === "company_foundation",
    ).review_status,
  ).toBe("unreviewed");
  expect(
    canonicalStringify(await (await page.request.get(downloadUrl!)).json()),
  ).toBe(frozen);
  const previousJobId = new URL(page.url()).searchParams.get("jobId");
  await page.getByText("Capture limits", { exact: true }).click();
  await page.getByLabel("Document limit", { exact: true }).fill("1");
  await page.getByLabel("Depth limit", { exact: true }).fill("0");
  const freshRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith(`${base}/scrapes`),
  );
  await page
    .getByRole("button", { name: "Start fresh scrape", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("jobId"))
    .not.toBe(previousJobId);
  const submittedScrape = (await freshRequest).postDataJSON();
  expect(submittedScrape.options).toEqual({ documentLimit: 1, depthLimit: 0 });
  expect(submittedScrape.requestId).toMatch(/^[0-9a-f-]{36}$/);
  const nextJobId = new URL(page.url()).searchParams.get("jobId");
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${base}/scrapes/${nextJobId}`)).json())
          .data.status,
      { timeout: 100_000 },
    )
    .toMatch(/^(partial|succeeded)$/);
  await expect(
    page.getByText(/results are ready for review|Partial results are ready/),
  ).toBeVisible({ timeout: 100_000 });
  const limitedJob = (
    await (await page.request.get(`${base}/scrapes/${nextJobId}`)).json()
  ).data;
  expect(limitedJob.progress.document_limit).toBe(1);
  expect(limitedJob.progress.captured).toBeLessThanOrEqual(1);

  expect(
    (await (await page.request.get(`${base}/draft`)).json()).data.entries.find(
      (entry: { kind: string }) => entry.kind === "company_foundation",
    ).content.overview,
  ).toBe("A later draft edit that must not change version one.");
  expect(
    canonicalStringify(await (await page.request.get(downloadUrl!)).json()),
  ).toBe(frozen);
  expect((await secondary.request.get(`${base}/draft`)).status()).toBe(404);
  expect((await secondary.request.get(downloadUrl!)).status()).toBe(404);
  const membership = await page.request.put(`${base}/members/${secondActor}`, {
    headers: mutationHeaders,
    data: { role: "viewer" },
  });
  expect(membership.ok()).toBe(true);
  expect((await secondary.request.get(downloadUrl!)).ok()).toBe(true);
  expect(
    (
      await secondary.request.post(`${base}/versions`, {
        headers: mutationHeaders,
        data: {
          expectedGeneration: afterEdit.draftGeneration,
          requestId: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(403);
  await secondary.goto(`/knowledge?companyId=${companyId}`);
  await expect(
    secondary.getByRole("button", { name: "Save draft", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    secondary.getByRole("button", { name: "Start scrape", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("company-knowledge-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("company-knowledge-mobile.png"),
    fullPage: true,
  });
  await secondaryContext.close();
});
