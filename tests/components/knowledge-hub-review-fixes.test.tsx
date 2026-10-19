// The Scrape & Build hub's review fixes:
//  - a material conflict is decided in "Review changes" before its entry can be approved, and the approval carries the decision;
//  - "Approve all" names the entry that failed, not the first one;
//  - a new gender value is saved only with the person's own self-description, which the request carries;
//  - an age above 150 is refused.
import { describe, expect, it, vi } from "vitest";
// The runtime registers its react / react-dom mocks when it is imported, so it comes before the components.
import { FakeServer, mountElement, type View } from "../helpers/knowledge-view-site-all-runtime";
import type { DraftEntry } from "../../src/contracts/api-types";
import { HubReview } from "../../src/components/editor/hub-review";
import { EditProvider, InlineLine, personFields, type EditEnv } from "../../src/components/knowledge-view/inline-edit";
import { prepareEntrySave } from "../../src/components/knowledge-view/save-entry";
import { timing } from "../../src/components/knowledge-view/timing";
import { buildDraft, COMPANY_ID, type Draft } from "../helpers/knowledge-view-fixtures";
import { click, type } from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

const CONFLICT = "00000000-0000-4000-8000-00000000c001";
const WEBSITE = "00000000-0000-4000-8000-00000000c002";
const LINKEDIN = "00000000-0000-4000-8000-00000000c003";
const candidate = (id: string, value: string) => ({ id, value, origin: "user_provided", evidence_ids: [], based_on_claim_ids: [] });

/** A draft whose General Info entry is unreviewed and has a material conflict on its industry, still undecided. */
function conflicted(): { draft: Draft; entry: DraftEntry } {
  const draft = buildDraft();
  const entry = draft.entries.find((item) => item.kind === "company_foundation") as DraftEntry;
  entry.review_status = "unreviewed";
  entry.provenance = {
    ...entry.provenance,
    conflicts: [{ id: CONFLICT, target: "/company_foundation/industry", candidates: [candidate(WEBSITE, "Coffee roasting"), candidate(LINKEDIN, "Food and beverage")], material: true }],
    decisions: [],
  } as DraftEntry["provenance"];
  return { draft, entry };
}

const review = (draft: Draft, entries: DraftEntry[], server = new FakeServer({ draft })) =>
  mountElement(<HubReview companyId={COMPANY_ID} actorId={draft.actorId} entries={entries} canEdit onChanged={async () => undefined} />, server);
const button = (view: View, name: string | RegExp) => {
  const found = view.byRole("button", name);
  expect(found, String(name)).toHaveLength(1);
  return found[0];
};

describe("Review changes: material conflicts", () => {
  it("shows the candidate chooser and a disabled Approve until the conflict is decided; the approval then carries the decision", async () => {
    const { draft, entry } = conflicted();
    const view = await review(draft, [entry]);
    expect(view.text()).toContain("The sources disagree on one value");
    const approve = button(view, /^Approve /);
    expect(view.isDisabled(approve)).toBe(true);
    await click(view, approve);
    expect(view.server.writes).toHaveLength(0);

    await click(view, button(view, "Use “Food and beverage”"));
    expect(view.text()).not.toContain("The sources disagree");
    expect(view.isDisabled(button(view, /^Approve /))).toBe(false);
    await click(view, button(view, /^Approve /));
    const [write] = view.server.writes;
    expect(write.path).toBe(`/api/companies/${COMPANY_ID}/entries/${entry.id}/revisions`);
    expect(write.body.reviewStatus).toBe("approved");
    expect(write.body.content.industry).toBe("Food and beverage");
    expect(write.body.provenance.decisions).toEqual([
      expect.objectContaining({ conflict_id: CONFLICT, action: "select", candidate_id: LINKEDIN, actor_id: draft.actorId, target: "/company_foundation/industry" }),
    ]);
  });

  it("Approve all waits for every conflict to be decided", async () => {
    const { draft, entry } = conflicted();
    const other = draft.entries.find((item) => item.kind === "positioning") as DraftEntry;
    other.review_status = "unreviewed";
    const view = await review(draft, [entry, other]);
    expect(view.isDisabled(button(view, "Approve all 2"))).toBe(true);
    await click(view, button(view, "Clear Industry"));
    expect(view.isDisabled(button(view, "Approve all 2"))).toBe(false);
  });
});

describe("Review changes: Approve all", () => {
  it("names the entry that failed with 409, not the first one", async () => {
    const draft = buildDraft();
    const [first, second] = draft.entries.filter((item) => item.kind === "company_foundation" || item.kind === "key_person") as DraftEntry[];
    first.review_status = second.review_status = "unreviewed";
    const server = new FakeServer({ draft });
    // The stored second entry moved on since the page loaded it: its approval is refused as stale.
    (server.draft.entries as DraftEntry[]).find((item) => item.id === second.id)!.current_revision += 1;
    const view = await review(draft, [first, second], server);
    await click(view, button(view, "Approve all 2"));
    expect(view.server.writes).toHaveLength(2);
    expect(view.text()).toContain("Maya Okafor changed since it was loaded.");
    expect(view.text()).not.toContain("Company foundation changed since it was loaded.");
  });
});

describe("Key People: gender needs the person's own self-description", () => {
  async function genderField() {
    timing.fresh = 10;
    const draft = buildDraft();
    const person = draft.entries.find((item) => item.kind === "key_person") as DraftEntry;
    const server = new FakeServer({ draft });
    const env: EditEnv = {
      companyId: COMPANY_ID,
      actorId: draft.actorId,
      blocked: false,
      onSaved: async () => undefined,
      entry: () => {
        const stored = (server.draft.entries as DraftEntry[]).find((item) => item.id === person.id)!;
        return { id: stored.id, revision: stored.current_revision, content: stored.content, provenance: stored.provenance };
      },
    };
    const view = await mountElement(
      <EditProvider env={env}>
        <InlineLine spec={personFields(person.id).gender} shown={null} placeholder="No gender yet" />
      </EditProvider>,
      server,
    );
    await click(view, button(view, /Person gender/));
    await type(view, view.byRole("textbox", "Person gender")[0], "Woman");
    return view;
  }

  it("refuses to save a gender without an attestation of at least 10 characters", async () => {
    const view = await genderField();
    await type(view, view.byRole("textbox", "Gender self-description attestation")[0], "too short");
    await click(view, button(view, "Save"));
    expect(view.server.writes).toHaveLength(0);
    expect(view.byRole("alert").map((node) => view.text(node)).join(" ")).toContain("at least 10 characters");
  });

  it("saves the gender with the attestation in the request body", async () => {
    const view = await genderField();
    await type(view, view.byRole("textbox", "Gender self-description attestation")[0], "  Her own LinkedIn bio says she is a woman.  ");
    await click(view, button(view, "Save"));
    const [write] = view.server.writes;
    expect(write.body.content.gender).toBe("Woman");
    expect(write.body.genderAttestation).toBe("Her own LinkedIn bio says she is a woman.");
  });

  it("a new entry's creation request carries the attestation too", () => {
    const person = buildDraft().entries.find((item) => item.kind === "key_person") as DraftEntry;
    const save = prepareEntrySave({
      companyId: COMPANY_ID,
      actorId: buildDraft().actorId,
      kind: "key_person",
      entry: null,
      content: { ...person.content, gender: "Woman" } as DraftEntry["content"],
      note: "Added from the knowledge view.",
      genderAttestation: "Her own LinkedIn bio says she is a woman.",
    });
    expect(JSON.parse(String(save.init.body)).genderAttestation).toBe("Her own LinkedIn bio says she is a woman.");
  });
});

describe("Key People: age", () => {
  it("refuses an age above 150 and accepts 150", () => {
    const age = personFields("00000000-0000-4000-8000-00000000a001").age;
    expect(age.apply({ age: null }, "200")).toEqual({ error: "Enter an age as a whole number from 0–150, for example 42." });
    expect(age.apply({ age: null }, "150")).toEqual({ content: { age: 150 } });
  });
});
