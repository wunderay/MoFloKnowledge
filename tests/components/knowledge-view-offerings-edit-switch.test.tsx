// Quest Q8 offerings-brand-edit, review round 2: a save of one offering is not lost when another offering (or another section)
// is shown while it runs. A committed save always reloads the draft, a failure is shown when its offering is shown again, and the
// next edit of the offering is made on the revision the save wrote (no stale-revision conflict).
import { describe, expect, it, vi } from "vitest";
import { alertText, alerts, blur, click, key, one, revisionWrite, startEdit, textboxes, type, valueOf } from "../helpers/knowledge-view-inline-edit";
import { OFFERINGS } from "../helpers/knowledge-view-offerings-brand-fixtures";
import { listTitles, mustButton, openOB, selectOffering, storedById } from "../helpers/knowledge-view-offerings-brand-edit";
import type { View } from "../helpers/knowledge-view-site-all-runtime";

vi.setConfig({ testTimeout: 60_000 });

const [A, B] = [OFFERINGS[0]!, OFFERINGS[1]!];
const NAME = { label: "Offering name" };

async function switchTo(view: View, label: string) {
  await click(view, one(view.byRole("button", /knowledge section/i), "the section button"));
  await click(view, one(view.byRole("option", label), `the "${label}" option`));
}

describe("switching offering while a save runs", () => {
  it("the save is committed, the list shows it, and the next edit of the offering is not a conflict", async () => {
    const { view, server } = await openOB("Business Offerings");
    const before = storedById(view, A.id);
    const input = await startEdit(view, NAME);
    await type(view, input, "Renamed while away");
    server.hold();
    await key(view, input, "Enter");
    await selectOffering(view, B.name!);
    server.release();
    await view.settle(8);
    expect(storedById(view, A.id).content.name).toBe("Renamed while away");
    expect(storedById(view, A.id).current_revision).toBe(before.current_revision + 1);
    expect(listTitles(view).some((t) => t.startsWith("Renamed while away")), "the list was reloaded").toBe(true);
    // The next edit of A is made on the new revision.
    await selectOffering(view, "Renamed while away");
    const again = await startEdit(view, NAME);
    await type(view, again, "Renamed twice");
    await key(view, again, "Enter");
    await view.settle(8);
    expect(storedById(view, A.id).content.name).toBe("Renamed twice");
    expect(alerts(view)).toHaveLength(0);
  });

  it("a failed save is shown, with the typed text and Retry, when its offering is shown again", async () => {
    const { view, server } = await openOB("Business Offerings");
    const before = storedById(view, A.id);
    const input = await startEdit(view, NAME);
    await type(view, input, "Typed, then another offering");
    server.hold();
    server.writeFailure = { status: 503, message: "Draft store is down." };
    await blur(view, input);
    await selectOffering(view, B.name!);
    server.release();
    await view.settle(8);
    await selectOffering(view, A.name!);
    expect(alertText(view), "the failure is not lost").toContain("Draft store is down.");
    expect(valueOf(view, one(textboxes(view, NAME.label), "the editor is open again"))).toBe("Typed, then another offering");
    server.writeFailure = null;
    await click(view, mustButton(view, "Retry"));
    await view.settle(8);
    expect(revisionWrite(view, before, 1, before.current_revision).content.name).toBe("Typed, then another offering");
  });
});

describe("switching section while a save runs", () => {
  it("the save reloads the draft, so the offerings list shows it when the section is shown again", async () => {
    const { view, server } = await openOB("Business Offerings");
    const input = await startEdit(view, NAME);
    await type(view, input, "Renamed, section left");
    server.hold();
    await key(view, input, "Enter");
    await switchTo(view, "Brand Identity");
    server.release();
    await view.settle(8);
    await switchTo(view, "Business Offerings");
    expect(storedById(view, A.id).content.name).toBe("Renamed, section left");
    expect(listTitles(view).some((t) => t.startsWith("Renamed, section left"))).toBe(true);
  });
});
