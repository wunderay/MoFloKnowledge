// Acceptance, Quest Q7 inline-edit-core, C3: chip lists of /knowledge/view edit in place.
//
// The string lists of the contract that the three sections show: Alternate names (General Info); Company role,
// Industry groupings, Service locations, Buyers (Customers & Industry); Customer needs (Sales & Marketing).
//  - every item has a button named "Remove <item>"; the list has a button named "Add <noun>" that opens a text field
//    named "Add <noun>" (placeholder "Add ↵") where Enter adds the typed text.
//  - an add or a remove is one revision of the entry that holds the list, sent at once; the list keeps its order and
//    its ids; a new item has a fresh UUID and goes last; text is trimmed.
//  - a duplicate (ignoring case and surrounding white space) is refused with a role=alert message; nothing is sent.
//  - a remove shows a role=status toast with an "Undo" button; Undo saves the list as it was, same ids and order.
//  - the banner counters of Customers & Industry follow the lists, with singular and plural ("1 Buyer", "2 Buyers").
// DECISION: Suppliers, Channels, Calls to action, Funnels, Ideal persona, Industry outlook, Headquarters and Social
// links are lists of objects, not of strings; they stay as they are in Q7 (only their banner counts change).
// DECISION: pressing Enter on blank text adds nothing and sends nothing (no message is required).
import { describe, expect, it, vi } from "vitest";
import {
  BUYERS,
  CHIP_FIELDS,
  GROUPINGS,
  LOCATIONS,
  addChip,
  addInputs,
  addPill,
  alertText,
  blur,
  chipInput,
  click,
  draftWith,
  focusedIs,
  getAt,
  itemsOf,
  key,
  manyItems,
  nothingSent,
  one,
  open,
  removeButtons,
  removeChip,
  revisionWrite,
  setAt,
  statusText,
  stored,
  type,
  undoButtons,
  UUID,
  long,
} from "../helpers/knowledge-view-inline-edit";

vi.setConfig({ testTimeout: 60_000 });

describe.each(CHIP_FIELDS)("C3 chip list: $label", (field) => {
  const seed = async () => {
    const view = await open(field.section);
    const before = stored(view, field.kind);
    return { view, before, items: itemsOf(before, field.path) };
  };

  it("every item has a Remove button and the list has an Add button; no text field until Add is used", async () => {
    const { view, items } = await seed();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(removeButtons(view, item.text), `Remove ${item.text}`).toHaveLength(1);
    one(addPill(view, field), `a button named "Add ${field.noun}"`);
    expect(addInputs(view, field)).toHaveLength(0);
    nothingSent(view);
  });

  it("Add opens a focused text field named 'Add <noun>' with the placeholder 'Add ↵'", async () => {
    const { view } = await seed();
    const input = await chipInput(view, field);
    expect(input.tag).toBe("input");
    expect(input.props.placeholder).toBe("Add ↵");
    expect(view.focusMovedInto(input) || focusedIs(input), "focus is in the field").toBe(true);
    nothingSent(view);
  });

  it("Enter adds the item last, with a fresh id, as one revision; it is then shown and '✓ Saved' is announced", async () => {
    const { view, before, items } = await seed();
    view.server.hold();
    const input = await chipInput(view, field);
    await type(view, input, "  Brand new entry  ");
    await key(view, input, "Enter");
    expect(statusText(view)).toMatch(/saving/i);
    view.server.release();
    await view.settle();
    const { content } = revisionWrite(view, before);
    const next = getAt(content, field.path) as { id: string; text: string }[];
    expect(next.slice(0, items.length), "the existing items keep their ids and order").toEqual(items);
    expect(next).toHaveLength(items.length + 1);
    expect(next[items.length]!.text).toBe("Brand new entry");
    expect(next[items.length]!.id).toMatch(UUID);
    expect(content).toEqual(setAt(structuredClone(before.content), field.path, next));
    expect(statusText(view)).toMatch(/✓\s*Saved/);
    expect(removeButtons(view, "Brand new entry"), "the new item is shown with its own Remove button").toHaveLength(1);
    expect(view.server.writes).toHaveLength(1);
  });

  it("several items can be added in a row, each as the next revision", async () => {
    const { view, before, items } = await seed();
    await addChip(view, field, "First extra");
    await addChip(view, field, "Second extra");
    expect(view.server.writes).toHaveLength(2);
    const second = revisionWrite(view, before, 1);
    const next = getAt(second.content, field.path) as { text: string }[];
    expect(next.map((i) => i.text)).toEqual([...items.map((i) => i.text), "First extra", "Second extra"]);
  });

  it("a duplicate is refused with a message, whatever its case or spacing, and nothing is sent", async () => {
    const { view, items } = await seed();
    const input = await chipInput(view, field);
    await type(view, input, `  ${items[0]!.text.toUpperCase()}  `);
    await key(view, input, "Enter");
    await view.settle();
    expect(alertText(view), "a visible reason, not a console message").toMatch(/already/i);
    nothingSent(view, "a duplicate is not saved");
    expect(removeButtons(view, items[0]!.text), "the list still shows the original once").toHaveLength(1);
    // a different text is accepted afterwards
    await type(view, view.fresh(input) ?? input, "Not a duplicate");
    await key(view, view.fresh(input) ?? input, "Enter");
    await view.settle();
    expect(view.server.writes).toHaveLength(1);
  });

  it("blank text adds nothing and sends nothing", async () => {
    const { view } = await seed();
    const input = await chipInput(view, field);
    await type(view, input, "   ");
    await key(view, input, "Enter");
    await view.settle();
    nothingSent(view);
  });

  it("text longer than the contract allows (20,000 characters) is refused with a message", async () => {
    const { view } = await seed();
    const input = await chipInput(view, field);
    await type(view, input, long(20_001));
    await key(view, input, "Enter");
    await view.settle();
    expect(alertText(view)).toMatch(/20,?000/);
    nothingSent(view);
  });

  it("a full list (500 items) refuses another item with a message", async () => {
    const draft = draftWith((b) => {
      setAt(field.kind === "market_and_customers" ? b.market_and_customers : b.company_foundation, field.path, manyItems(500));
    });
    const view = await open(field.section, { draft });
    const input = await chipInput(view, field);
    await type(view, input, "One too many");
    await key(view, input, "Enter");
    await view.settle();
    expect(alertText(view)).toMatch(/500/);
    nothingSent(view);
  });

  it("an empty list offers Add and takes the first item", async () => {
    const draft = draftWith((b) => {
      setAt(field.kind === "market_and_customers" ? b.market_and_customers : b.company_foundation, field.path, []);
    });
    const view = await open(field.section, { draft });
    const before = stored(view, field.kind);
    await addChip(view, field, "The first one");
    const { content } = revisionWrite(view, before);
    expect((getAt(content, field.path) as { text: string }[]).map((i) => i.text)).toEqual(["The first one"]);
  });

  it("Remove saves the list without the item and shows an Undo toast; Undo saves the list exactly as it was", async () => {
    const { view, before, items } = await seed();
    const target = items[1]!;
    await removeChip(view, target.text);
    const removed = revisionWrite(view, before, 0);
    expect(getAt(removed.content, field.path)).toEqual(items.filter((i) => i.id !== target.id));
    expect(removeButtons(view, target.text), "the item is gone").toHaveLength(0);
    expect(statusText(view), "a toast announces the removal").toMatch(/removed/i);
    const undo = one(undoButtons(view), 'one "Undo" button');
    await click(view, undo);
    expect(view.server.writes).toHaveLength(2);
    const restored = revisionWrite(view, before, 1);
    expect(getAt(restored.content, field.path), "same items, same ids, same order").toEqual(items);
    expect(restored.content).toEqual(before.content);
    expect(removeButtons(view, target.text), "the item is back").toHaveLength(1);
    expect(undoButtons(view), "the toast goes once used").toHaveLength(0);
  });

  it("removing the only item leaves an empty list that still offers Add", async () => {
    const draft = draftWith((b) => {
      setAt(field.kind === "market_and_customers" ? b.market_and_customers : b.company_foundation, field.path, manyItems(1, "Only"));
    });
    const view = await open(field.section, { draft });
    const before = stored(view, field.kind);
    await removeChip(view, "Only 1");
    const { content } = revisionWrite(view, before);
    expect(getAt(content, field.path)).toEqual([]);
    one(addPill(view, field), "Add still offered on the empty list");
  });
});

// ---- banner counters ------------------------------------------------------------------------------------------------
const COUNTERS = [
  { field: GROUPINGS, one: "Grouping", many: "Groupings", fixture: 3 },
  { field: LOCATIONS, one: "Location", many: "Locations", fixture: 5 },
  { field: BUYERS, one: "Buyer", many: "Buyers", fixture: 4 },
] as const;
const SUPPLIER = { one: "Supplier", many: "Suppliers", fixture: 2 };
const shows = (text: string, n: number, one: string, many: string) =>
  n === 1 ? new RegExp(`(^|\\D)1 ${one}(?!s)`).test(text) : new RegExp(`(^|\\D)${n} ${many}`).test(text);
const wrongForm = (text: string, n: number, one: string, many: string) =>
  n === 1 ? new RegExp(`(^|\\D)1 ${many}`).test(text) : new RegExp(`(^|\\D)${n} ${one}(?!s)`).test(text);

describe("C3 banner counters follow the lists with singular and plural", () => {
  it("show the stored counts as '<n> <noun>'", async () => {
    const view = await open("Customers & Industry");
    const text = view.text();
    for (const c of COUNTERS) expect(shows(text, c.fixture, c.one, c.many), `${c.fixture} ${c.many}`).toBe(true);
    expect(shows(text, SUPPLIER.fixture, SUPPLIER.one, SUPPLIER.many), "2 Suppliers").toBe(true);
  });

  it("use the singular for one and the plural for zero and for several", async () => {
    for (const n of [0, 1, 2]) {
      const draft = draftWith((b) => {
        b.market_and_customers.industry_groupings = manyItems(n, "G");
        b.company_foundation.service_locations = manyItems(n, "L");
        b.market_and_customers.target_buyers = manyItems(n, "B");
        b.market_and_customers.suppliers_and_partners = Array.from({ length: n }, (_, i) => ({
          id: `00000000-0000-4000-8000-${(0xb0000 + i).toString(16).padStart(12, "0")}`,
          name: `Supplier ${i}`,
          relationship_type: null,
          relationship_text: null,
          url: null,
        }));
      });
      const view = await open("Customers & Industry", { draft });
      const text = view.text();
      for (const c of [...COUNTERS, { ...SUPPLIER, fixture: n }]) {
        expect(shows(text, n, c.one, c.many), `${n} ${n === 1 ? c.one : c.many}`).toBe(true);
        expect(wrongForm(text, n, c.one, c.many), `no wrong form for ${n} ${c.many}`).toBe(false);
      }
    }
  });

  it("update as soon as an item is added or removed", async () => {
    const draft = draftWith((b) => {
      b.market_and_customers.target_buyers = manyItems(2, "Buyer");
    });
    const view = await open("Customers & Industry", { draft });
    expect(shows(view.text(), 2, "Buyer", "Buyers")).toBe(true);
    await removeChip(view, "Buyer 2");
    expect(shows(view.text(), 1, "Buyer", "Buyers"), "1 Buyer after removing one").toBe(true);
    expect(wrongForm(view.text(), 1, "Buyer", "Buyers"), "not '1 Buyers'").toBe(false);
    await addChip(view, BUYERS, "Another buyer");
    expect(shows(view.text(), 2, "Buyer", "Buyers"), "2 Buyers after adding one").toBe(true);
    await removeChip(view, "Another buyer");
    await removeChip(view, "Buyer 1");
    expect(shows(view.text(), 0, "Buyer", "Buyers"), "0 Buyers when empty").toBe(true);
  });

  it("Groupings and Locations follow their own lists", async () => {
    const view = await open("Customers & Industry");
    await addChip(view, GROUPINGS, "Roasting education");
    expect(shows(view.text(), 4, "Grouping", "Groupings")).toBe(true);
    await removeChip(view, "Maine");
    expect(shows(view.text(), 4, "Location", "Locations")).toBe(true);
    expect(shows(view.text(), 5, "Location", "Locations")).toBe(false);
  });

  it("a duplicate or an invalid add leaves the counter alone", async () => {
    const view = await open("Customers & Industry");
    const input = await chipInput(view, BUYERS);
    await type(view, input, "Gift buyers and corporate gifting teams");
    await key(view, input, "Enter");
    await blur(view, input);
    expect(shows(view.text(), 4, "Buyer", "Buyers")).toBe(true);
    nothingSent(view);
  });
});
