// Company_foundation.revenue, online_presence.phone,
// key_person.age / nationality / portrait and offering.images.
// Covered here: schemas and defaults, contract sources and migration files, field registry. Export/provenance/
// coverage-cap/legacy/document tests live in tests/knowledge, tests/server and tests/db (see the other model-fields-* files).
//
// Notes:
//  - Phone: the validated/stored form is exactly 10 ASCII digits ("exactly 10 digits after stripping punctuation/spaces
//     (store the 10 digits)"). Punctuated input such as "(555) 010-0199" is either rejected or normalised to the 10 digits;
//     it is never stored punctuated. An 11-digit number (e.g. a +1 / leading-1 prefix) is REJECTED, not stripped: it has
//     eleven digits, not "exactly 10".
//  - A display formatter is not a public helper; the formatted display "(555) 010-0199" is checked through the
//     document export only.
//  - content_type must agree with the path extension (png->image/png, jpg|jpeg->image/jpeg, gif->image/gif,
//     webp->image/webp, svg->image/svg+xml); a mismatch is rejected.
//  - The company segment of a path is a UUID in the pure per-entry schema (it cannot know the company); equality with the
//     owning company is checked where the company is known (database functions, snapshot export).
//  - Whether parseBusinessEntry itself accepts content that omits the new keys is deliberately not tested here; what is
//     tested is that entry revisions saved before 0018, which omit them, still read as defaults (draft endpoint, snapshot
//     assembly, database publication) - see model-fields-legacy-drafts, model-fields-snapshot-export and tests/db.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BusinessSchema,
  FIELD_REGISTRY,
  allowedOriginsForTarget,
  createEmptyBusiness,
  createEntryDefault,
  fieldForTarget,
  parseBusinessEntry,
  requiredCoverageTargets,
  type EntryKind,
} from "../../src/contracts";

type Json = Record<string, unknown>;
const root = resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");
const uid = (n: number) => `c5100000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO = "c5000000-0000-4000-8000-0000000000c0";
const OBJ = uid(77);

const base = (kind: EntryKind, id?: string): Json => ({ ...(createEntryDefault(kind, id) as unknown as Json) });
const foundation = (over: Json = {}): Json => ({ ...base("company_foundation"), ...over });
const online = (over: Json = {}): Json => ({ ...base("online_presence"), ...over });
const person = (over: Json = {}): Json => ({ ...base("key_person", uid(1)), name: "Alex Chen", ...over });
const offering = (over: Json = {}): Json => ({ ...base("offering", uid(2)), name: "Shop Inventory", ...over });
const folderOf = { portrait: "portraits", image: "offering-images" } as const;
const path = (folder: string, ext = "png", co = CO, object = OBJ) => `${folder}/${co}/${object}.${ext}`;
const ref = (folder: string, over: Json = {}): Json => ({ id: OBJ, path: path(folder), content_type: "image/png", size_bytes: 2048, ...over });
// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test removes a caller-chosen key from a scratch object
const without = (value: Json, key: string): Json => { const copy = { ...value }; delete copy[key]; return copy; };

function parses(kind: EntryKind, value: unknown): boolean {
  try {
    parseBusinessEntry(kind, value as never);
    return true;
  } catch {
    return false;
  }
}
function parsedOrUndefined(kind: EntryKind, value: unknown): Json | undefined {
  try {
    return parseBusinessEntry(kind, value as never) as unknown as Json;
  } catch {
    return undefined;
  }
}
/** A rejection only counts when the same shape with a valid value is accepted. */
function rejectsOnlyBecauseOfVariant(kind: EntryKind, valid: unknown, variant: unknown, label = "variant") {
  expect(parses(kind, valid), "valid control must be accepted").toBe(true);
  expect(parses(kind, variant), `${label} must be rejected`).toBe(false);
}

describe("company_foundation.revenue: nullable non-blank text, default null", () => {
  it("defaults to null in the empty business and in the entry default", () => {
    expect(createEmptyBusiness().company_foundation).toHaveProperty("revenue", null);
    expect(createEntryDefault("company_foundation")).toHaveProperty("revenue", null);
    expect(BusinessSchema.safeParse(createEmptyBusiness()).success).toBe(true);
  });

  it("accepts free-text amounts and null", () => {
    for (const revenue of ["$1M ARR", "€2.3M (FY2025)", "About 12 million, mostly subscriptions", "¥500,000,000", "N/A", "  $5M  ", null]) {
      expect(parses("company_foundation", foundation({ revenue })), String(revenue)).toBe(true);
    }
  });

  it("parseBusinessEntry keeps the revenue text exactly", () => {
    const result = parsedOrUndefined("company_foundation", foundation({ revenue: "€2.3M (FY2025)" }));
    expect(result, "valid revenue must parse").toBeDefined();
    expect(result!.revenue).toBe("€2.3M (FY2025)");
  });

  it("Edge case: blank, whitespace-only and non-string revenue is rejected", () => {
    const valid = foundation({ revenue: "$1M ARR" });
    for (const revenue of ["", " ", "   ", "\t", "\n", " \u00a0 ", 1000000, 0, true, {}, ["$1M"]]) {
      rejectsOnlyBecauseOfVariant("company_foundation", valid, foundation({ revenue }), JSON.stringify(revenue) ?? "undefined");
    }
  });

  it("Edge case: unknown keys next to revenue are still rejected (strict contract)", () => {
    rejectsOnlyBecauseOfVariant("company_foundation", foundation({ revenue: "$1M" }), foundation({ revenue: "$1M", turnover: "$2M" }));
  });
});

describe("online_presence.phone: nullable, exactly 10 digits, stored as the 10 digits", () => {
  it("defaults to null in the empty business and in the entry default", () => {
    expect(createEmptyBusiness().online_presence).toHaveProperty("phone", null);
    expect(createEntryDefault("online_presence")).toHaveProperty("phone", null);
  });

  it("accepts a 10-digit number (including leading zeros) and null, and stores it unchanged", () => {
    for (const phone of ["5550100199", "0000000000", "9999999999", "0123456789", null]) {
      const result = parsedOrUndefined("online_presence", online({ phone }));
      expect(result, `${phone} must parse`).toBeDefined();
      expect(result!.phone).toBe(phone);
    }
  });

  it("Edge case: 9 digits, 11 digits and other lengths are rejected", () => {
    const valid = online({ phone: "5550100199" });
    for (const phone of ["555010019", "55501001999", "1", "55501", "55501001990000", "0".repeat(9), "0".repeat(11), "9".repeat(20)]) {
      rejectsOnlyBecauseOfVariant("online_presence", valid, online({ phone }), phone);
    }
  });

  it("Edge case: an 11-digit number starting with 1 / a +1 country prefix is rejected, not stripped", () => {
    // Spec: "exactly 10 digits after stripping punctuation/spaces". "+1 (555) 010-0199" leaves ELEVEN digits.
    const valid = online({ phone: "5550100199" });
    for (const phone of ["15550100199", "+15550100199", "+1 555 010 0199", "+1 (555) 010-0199", "1-555-010-0199", "1 (555) 010-0199", "001 555 010 0199"]) {
      rejectsOnlyBecauseOfVariant("online_presence", valid, online({ phone }), phone);
    }
  });

  it("Edge case: letters, vanity numbers and extensions are rejected", () => {
    const valid = online({ phone: "5550100199" });
    for (const phone of ["555010019a", "abcdefghij", "555-010-FLOW", "1-800-FLOWERS", "(555) 010-0199 ext 5", "555 010 0199 x12", "five five five", "555O100199", "5550l00199", "NaN", "Infinity", "0x5550100199", "5.550100199e9"]) {
      rejectsOnlyBecauseOfVariant("online_presence", valid, online({ phone }), phone);
    }
  });

  it("Edge case: blank and non-string phone values are rejected", () => {
    const valid = online({ phone: "5550100199" });
    for (const phone of ["", " ", "          ", "()-", "- - -", 5550100199, 0, true, {}, ["5550100199"]]) {
      rejectsOnlyBecauseOfVariant("online_presence", valid, online({ phone }), JSON.stringify(phone) ?? "undefined");
    }
  });

  it("Edge case: non-ASCII digits are not digits (Arabic-Indic, full-width, superscript)", () => {
    const valid = online({ phone: "5550100199" });
    for (const phone of ["٥٥٥٠١٠٠١٩٩", "５５５０１００１９９", "⁵⁵⁵⁰¹⁰⁰¹⁹⁹", "५५५०१००१९९"]) {
      rejectsOnlyBecauseOfVariant("online_presence", valid, online({ phone }), phone);
    }
  });

  it("Edge case: punctuated input is rejected or normalised to the 10 digits, never stored punctuated", () => {
    expect(parses("online_presence", online({ phone: "5550100199" })), "valid control must be accepted").toBe(true);
    for (const phone of ["(555) 010-0199", "555-010-0199", "555.010.0199", "555 010 0199", " 5550100199", "5550100199 ", "5550100199\n"]) {
      const result = parsedOrUndefined("online_presence", online({ phone }));
      if (result !== undefined) {
        expect(result.phone, `${JSON.stringify(phone)} accepted => stored as the 10 digits`).toBe("5550100199");
      }
    }
  });

  it("Edge case: unknown keys next to phone are rejected", () => {
    rejectsOnlyBecauseOfVariant("online_presence", online({ phone: "5550100199" }), online({ phone: "5550100199", fax: "5550100198" }));
  });
});

describe("key_person.age: nullable integer 0-150; nationality: nullable non-blank text", () => {
  it("both default to null in the entry default", () => {
    expect(createEntryDefault("key_person", uid(1))).toMatchObject({ age: null, nationality: null });
  });

  it("accepts 0, 1, 42, 150 and null and keeps the numbers exactly", () => {
    for (const age of [0, 1, 42, 99, 149, 150, null]) {
      const result = parsedOrUndefined("key_person", person({ age }));
      expect(result, `age ${age} must parse`).toBeDefined();
      expect(result!.age).toBe(age);
    }
  });

  it("Edge case: below 0 and above 150 are rejected (-1, 151, 1000, huge)", () => {
    const valid = person({ age: 42 });
    for (const age of [-1, -0.0001, -150, 151, 152, 1000, 1e9, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ age }), String(age));
    }
  });

  it("Edge case: non-integers are rejected (2.5, 0.5, 149.999, 150.5)", () => {
    const valid = person({ age: 42 });
    for (const age of [2.5, 0.5, 41.9999, 149.999, 150.5, Math.PI]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ age }), String(age));
    }
  });

  it("Edge case: NaN, +Infinity and -Infinity are rejected", () => {
    const valid = person({ age: 42 });
    for (const age of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ age }), String(age));
    }
  });

  it("Edge case: numeric strings and NaN-like strings are not integers", () => {
    const valid = person({ age: 42 });
    for (const age of ["42", " 42", "042", "4e1", "NaN", "nan", "Infinity", "-Infinity", "forty", "", " ", "null", "0"]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ age }), JSON.stringify(age));
    }
  });

  it("Edge case: booleans, arrays and objects are not ages", () => {
    const valid = person({ age: 42 });
    for (const age of [true, false, [], [42], {}, { value: 42 }]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ age }), JSON.stringify(age) ?? "undefined");
    }
  });

  it("nationality accepts text and null", () => {
    for (const nationality of ["Canadian", "Irish-American", "Côte d'Ivoire", "  German  ", "日本", null]) {
      expect(parses("key_person", person({ nationality })), String(nationality)).toBe(true);
    }
    expect(parsedOrUndefined("key_person", person({ nationality: "Canadian" }))?.nationality).toBe("Canadian");
  });

  it("Edge case: blank and non-string nationality is rejected", () => {
    const valid = person({ nationality: "Canadian" });
    for (const nationality of ["", " ", "   ", "\t\n", 5, true, {}, ["Canadian"]]) {
      rejectsOnlyBecauseOfVariant("key_person", valid, person({ nationality }), JSON.stringify(nationality) ?? "undefined");
    }
  });

  it("Edge case: a person whose only populated fact is age 0, a nationality or a portrait is not 'wholly empty'", () => {
    const empty = { ...base("key_person", uid(1)) };
    expect(parses("key_person", empty), "an entirely empty person stays invalid").toBe(false);
    expect(parses("key_person", { ...empty, name: "Alex Chen" }), "valid control").toBe(true);
    expect(parses("key_person", { ...empty, age: 0 }), "age 0 is a populated fact").toBe(true);
    expect(parses("key_person", { ...empty, age: 33 })).toBe(true);
    expect(parses("key_person", { ...empty, nationality: "Canadian" })).toBe(true);
    expect(parses("key_person", { ...empty, portrait: ref(folderOf.portrait) })).toBe(true);
  });
});

/** Shared reference-shape rules, run for key_person.portrait and for one item of offering.images. */
const placements = [
  { label: "key_person.portrait", kind: "key_person" as const, folder: folderOf.portrait, put: (value: unknown) => person({ portrait: value }) },
  { label: "offering.images[0]", kind: "offering" as const, folder: folderOf.image, put: (value: unknown) => offering({ images: [value] }) },
];
const TYPE_BY_EXTENSION: [string, string][] = [["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"], ["webp", "image/webp"], ["svg", "image/svg+xml"]];

describe.each(placements)("storage reference shape at $label", ({ kind, folder, put }) => {
  const valid = () => put(ref(folder));
  const reject = (variant: unknown, label: string) => rejectsOnlyBecauseOfVariant(kind, valid(), put(variant), label);

  it("accepts a well-formed reference and returns it unchanged", () => {
    const parsed = parsedOrUndefined(kind, valid());
    expect(parsed, "valid reference must parse").toBeDefined();
    const stored = (kind === "key_person" ? parsed!.portrait : (parsed!.images as unknown[])[0]) as Json;
    expect(stored).toEqual(ref(folder));
  });

  it("accepts every allowed extension with its matching content type", () => {
    for (const [ext, type] of TYPE_BY_EXTENSION) {
      expect(parses(kind, put(ref(folder, { path: path(folder, ext), content_type: type }))), `${ext} + ${type}`).toBe(true);
    }
  });

  it("Edge case: path traversal, absolute and URL-like paths are rejected", () => {
    for (const bad of [
      `${folder}/${CO}/../${OBJ}.png`, `../${folder}/${CO}/${OBJ}.png`, `${folder}/../${CO}/${OBJ}.png`, `${folder}/${CO}/${OBJ}.png/..`,
      `${folder}/${CO}/${OBJ}.png/../${OBJ}.png`, `${folder}/${CO}/%2e%2e/${OBJ}.png`, `${folder}/${CO}/..%2f${OBJ}.png`, `${folder}/%2e%2e%2f${CO}/${OBJ}.png`,
      `..\\${folder}\\${CO}\\${OBJ}.png`, `/${folder}/${CO}/${OBJ}.png`, `//${folder}/${CO}/${OBJ}.png`, `C:/${folder}/${CO}/${OBJ}.png`, `C:\\${folder}\\${CO}\\${OBJ}.png`,
      `\\\\server\\share\\${OBJ}.png`, `file:///${folder}/${CO}/${OBJ}.png`, `https://cdn.example/${folder}/${CO}/${OBJ}.png`, `data:image/png;base64,iVBORw0KGgo=`,
      `${folder}\\${CO}\\${OBJ}.png`, `~/${folder}/${CO}/${OBJ}.png`, `/etc/passwd`,
    ]) {
      reject(ref(folder, { path: bad }), bad);
    }
  });

  it("Edge case: extra, missing or empty path segments are rejected", () => {
    for (const bad of [
      `${folder}/${CO}/nested/${OBJ}.png`, `${folder}/${CO}//${OBJ}.png`, `${folder}//${CO}/${OBJ}.png`, `./${folder}/${CO}/${OBJ}.png`,
      `${folder}/${OBJ}.png`, `${folder}/${CO}`, `${folder}/${CO}/`, `${folder}/`, folder, `${CO}/${OBJ}.png`,
    ]) {
      reject(ref(folder, { path: bad }), bad);
    }
  });

  it("Edge case: a wrong or unknown storage prefix is rejected", () => {
    for (const prefix of ["avatars", "uploads", "public", "images", "logo", `${folder}s`, `${folder}-old`, folder.toUpperCase(), `x${folder}`, `${folder}/${folder}`, "", "private"]) {
      reject(ref(folder, { path: path(prefix) }), prefix);
    }
  });

  it("Edge case: the company segment must be a UUID", () => {
    for (const segment of ["acme", "123", CO.slice(1), `${CO}0`, CO.replaceAll("-", ""), `{${CO}}`, "00000000-0000-0000-0000-00000000000g", ""]) {
      reject(ref(folder, { path: `${folder}/${segment}/${OBJ}.png` }), segment);
    }
  });

  it("Edge case: the object name must be <uuid>.<allowed extension>", () => {
    for (const name of [
      "photo.png", OBJ, `${OBJ}.`, `${OBJ}.png.exe`, `${OBJ}.exe`, `${OBJ}.html`, `${OBJ}.bmp`, `${OBJ}.tiff`, `${OBJ}.ico`, `${OBJ}.svgz`, `${OBJ}.PNG`, `${OBJ}.Jpg`,
      `${OBJ}.png `, ` ${OBJ}.png`, `${OBJ}.png\n`, `${OBJ}.png\u0000.jpg`, `${OBJ}.png?x=1`, `${OBJ}.png#top`, `${OBJ.slice(1)}.png`, `${OBJ}0.png`, `.png`, `png`,
    ]) {
      reject(ref(folder, { path: `${folder}/${CO}/${name}` }), name);
    }
  });

  it("Edge case: blank, missing and non-string paths are rejected", () => {
    for (const bad of ["", " ", "   ", "\n", null, 5, true, {}, [path(folder)]]) {
      reject(ref(folder, { path: bad }), JSON.stringify(bad));
    }
    reject(without(ref(folder), "path"), "missing path");
  });

  it("Edge case: content type must be one of the five image types", () => {
    for (const contentType of ["image/bmp", "image/tiff", "image/x-icon", "image/jpg", "image/avif", "image/svg", "text/html", "text/plain", "application/pdf", "application/octet-stream", "IMAGE/PNG", "image/png; charset=binary", "image/png ", "", " ", null, 5, {}, ["image/png"]]) {
      reject(ref(folder, { content_type: contentType }), JSON.stringify(contentType));
    }
    reject(without(ref(folder), "content_type"), "missing content_type");
  });

  it("Edge case: content type that disagrees with the extension is rejected", () => {
    for (const [ext, type] of [["png", "image/jpeg"], ["jpg", "image/png"], ["jpeg", "image/webp"], ["gif", "image/png"], ["webp", "image/gif"], ["svg", "image/png"], ["png", "image/svg+xml"], ["jpg", "image/svg+xml"]]) {
      reject(ref(folder, { path: path(folder, ext), content_type: type }), `${ext} + ${type}`);
    }
  });

  it("Edge case: size_bytes is a positive integer of at most 5 MiB (5,242,880)", () => {
    for (const size of [1, 2048, 5 * 1024 * 1024 - 1, 5 * 1024 * 1024]) {
      expect(parses(kind, put(ref(folder, { size_bytes: size }))), String(size)).toBe(true);
    }
    for (const size of [0, -1, -2048, 0.5, 1.5, 2048.0001, 5 * 1024 * 1024 + 1, 6 * 1024 * 1024, 10 * 1024 * 1024, 1e12, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "2048", "", null, true, {}, [2048]]) {
      reject(ref(folder, { size_bytes: size }), String(size));
    }
    reject(without(ref(folder), "size_bytes"), "missing size_bytes");
  });

  it("Edge case: id must be a UUID", () => {
    for (const id of ["", "not-a-uuid", "12345", 7, null, {}, uid(5).slice(1), `${uid(5)}0`]) {
      reject(ref(folder, { id }), JSON.stringify(id));
    }
    reject(without(ref(folder), "id"), "missing id");
  });

  it("Edge case: unknown keys on the reference are rejected (strict contract)", () => {
    for (const extra of [{ url: "https://cdn.example/x.png" }, { alt: "A person" }, { bucket: "private" }, { signed_url: "https://x" }, { width: 100 }]) {
      reject({ ...ref(folder), ...extra }, JSON.stringify(extra));
    }
  });

  it("Edge case: a reference needs all four properties; partial and non-object values are rejected", () => {
    for (const bad of [{}, { id: OBJ }, { path: path(folder) }, "portraits", path(folder), 5, true, [ref(folder)], []]) {
      reject(bad, JSON.stringify(bad));
    }
  });
});

describe("key_person.portrait and offering.images containers", () => {
  it("portrait defaults to null and accepts null; images default to a fresh empty list", () => {
    expect(createEntryDefault("key_person", uid(1))).toHaveProperty("portrait", null);
    const first = createEntryDefault("offering", uid(2)) as unknown as { images: unknown[] };
    expect(first.images).toEqual([]);
    first.images.push("mutation");
    expect((createEntryDefault("offering", uid(2)) as unknown as { images: unknown[] }).images).toEqual([]);
    expect(parses("key_person", person({ portrait: null }))).toBe(true);
    expect(parses("offering", offering({ images: [] }))).toBe(true);
  });

  it("a portrait is a single object: arrays and strings are rejected", () => {
    const valid = person({ portrait: ref(folderOf.portrait) });
    rejectsOnlyBecauseOfVariant("key_person", valid, person({ portrait: [ref(folderOf.portrait)] }), "array");
    rejectsOnlyBecauseOfVariant("key_person", valid, person({ portrait: path(folderOf.portrait) }), "path string");
  });

  it("images is a collection: accepts 1 and exactly 20 distinct references, keeps order", () => {
    const images = (count: number) => Array.from({ length: count }, (_, index) => ref(folderOf.image, { id: uid(100 + index), path: path(folderOf.image, "png", CO, uid(100 + index)) }));
    expect(parses("offering", offering({ images: images(1) }))).toBe(true);
    const twenty = parsedOrUndefined("offering", offering({ images: images(20) }));
    expect(twenty, "20 images must parse").toBeDefined();
    expect((twenty!.images as { id: string }[]).map((item) => item.id)).toEqual(images(20).map((item) => item.id));
  });

  it("Edge case: 21 images are rejected (max 20), also well beyond the limit", () => {
    const images = (count: number) => Array.from({ length: count }, (_, index) => ref(folderOf.image, { id: uid(100 + index), path: path(folderOf.image, "png", CO, uid(100 + index)) }));
    rejectsOnlyBecauseOfVariant("offering", offering({ images: images(20) }), offering({ images: images(21) }), "21 images");
    expect(parses("offering", offering({ images: images(40) })), "40 images").toBe(false);
    expect(parses("offering", offering({ images: images(500) })), "500 images").toBe(false);
  });

  it("Edge case: duplicate image ids are rejected", () => {
    const first = ref(folderOf.image, { id: uid(101), path: path(folderOf.image, "png", CO, uid(101)) });
    const second = ref(folderOf.image, { id: uid(102), path: path(folderOf.image, "jpg", CO, uid(102)), content_type: "image/jpeg" });
    rejectsOnlyBecauseOfVariant("offering", offering({ images: [first, second] }), offering({ images: [first, { ...second, id: first.id }] }), "duplicate ids");
  });

  it("Edge case: one invalid image invalidates the whole offering; non-arrays are rejected", () => {
    const good = (n: number) => ref(folderOf.image, { id: uid(100 + n), path: path(folderOf.image, "png", CO, uid(100 + n)) });
    const valid = offering({ images: [good(1), good(2), good(3)] });
    rejectsOnlyBecauseOfVariant("offering", valid, offering({ images: [good(1), good(2), { ...good(3), size_bytes: 0 }] }), "bad third image");
    rejectsOnlyBecauseOfVariant("offering", valid, offering({ images: [good(1), "offering-images/x.png", good(3)] }), "string item");
    for (const images of [null, good(1), "images", 3, {}]) {
      rejectsOnlyBecauseOfVariant("offering", valid, offering({ images }), JSON.stringify(images));
    }
  });

  it("Edge case: an offering whose only populated field is images is not 'wholly empty'", () => {
    const empty = { ...base("offering", uid(2)) };
    expect(parses("offering", empty), "an entirely empty offering stays invalid").toBe(false);
    expect(parses("offering", { ...empty, name: "Shop Inventory" }), "valid control").toBe(true);
    expect(parses("offering", { ...empty, images: [ref(folderOf.image)] })).toBe(true);
  });

  it("BusinessSchema validates nested portraits and images and stays strict", () => {
    const empty = createEmptyBusiness() as unknown as Json;
    const populated = { ...empty, key_people: [person({ portrait: ref(folderOf.portrait) })], offerings: [offering({ images: [ref(folderOf.image, { id: uid(9) })] })] };
    expect(BusinessSchema.safeParse(populated).success, "valid control").toBe(true);
    const badPortrait = { ...populated, key_people: [person({ portrait: ref(folderOf.portrait, { path: `../${path(folderOf.portrait)}` }) })] };
    expect(BusinessSchema.safeParse(badPortrait).success).toBe(false);
    const badImages = { ...populated, offerings: [offering({ images: [ref(folderOf.image, { size_bytes: -1 })] })] };
    expect(BusinessSchema.safeParse(badImages).success).toBe(false);
  });

  it("branding logos keep their existing `url` field and gain no storage reference", () => {
    const logo = { id: uid(30), url: "https://acme.example/logo.svg", variant: null, kind: "company_logo" };
    const branding = base("branding_and_style");
    expect(parses("branding_and_style", { ...branding, logos: [logo] })).toBe(true);
    expect(parses("branding_and_style", { ...branding, logos: [{ ...logo, path: path("logos", "svg"), content_type: "image/svg+xml", size_bytes: 10 }] })).toBe(false);
    expect(parses("branding_and_style", { ...branding, logos: [{ id: uid(30), path: path("logos", "svg"), content_type: "image/svg+xml", size_bytes: 10, variant: null, kind: "company_logo" }] })).toBe(false);
  });
});

describe("field registry knows every new field", () => {
  const NEW: { path: string; kind: string; field: string; default: unknown }[] = [
    { path: "/company_foundation/revenue", kind: "company_foundation", field: "revenue", default: null },
    { path: "/online_presence/phone", kind: "online_presence", field: "phone", default: null },
    { path: "/key_people/@id/age", kind: "key_person", field: "age", default: null },
    { path: "/key_people/@id/nationality", kind: "key_person", field: "nationality", default: null },
    { path: "/key_people/@id/portrait", kind: "key_person", field: "portrait", default: null },
    { path: "/offerings/@id/images", kind: "offering", field: "images", default: [] },
  ];
  const ORIGINS = ["source_backed", "inferred", "generated", "user_provided"];

  it.each(NEW)("registers $path exactly once with its default, coverage required and user_provided allowed", (expected) => {
    const matches = FIELD_REGISTRY.filter((item) => item.path === expected.path);
    expect(matches, `${expected.path} registered once`).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: expected.kind, field: expected.field, default: expected.default, coverageRequired: true });
    expect(matches[0].allowedOrigins).toContain("user_provided");
    expect(matches[0].allowedOrigins.length).toBeGreaterThan(0);
    for (const origin of matches[0].allowedOrigins) {
      expect(ORIGINS, origin).toContain(origin);
    }
    expect(new Set(matches[0].allowedOrigins).size).toBe(matches[0].allowedOrigins.length);
    expect(typeof matches[0].type).toBe("string");
  });

  it("the registry grew by exactly the six new fields (42 -> 48) and paths stay unique", () => {
    expect(FIELD_REGISTRY).toHaveLength(48);
    expect(new Set(FIELD_REGISTRY.map((item) => item.path)).size).toBe(48);
  });

  it("registry fields and entry defaults describe the same keys for every kind (nothing unregistered, nothing phantom)", () => {
    const kinds = [...new Set(FIELD_REGISTRY.map((item) => item.kind))];
    expect(kinds.sort()).toEqual(["branding_and_style", "company_foundation", "key_person", "market_and_customers", "offering", "online_presence", "positioning", "site_links"]);
    for (const kind of kinds) {
      const registered = FIELD_REGISTRY.filter((item) => item.kind === kind).map((item) => item.field).sort();
      const keys = Object.keys(createEntryDefault(kind, uid(40)) as unknown as Json).filter((key) => key !== "id").sort();
      expect(registered, kind).toEqual(keys);
    }
  });

  it("every registry default equals the matching entry default", () => {
    for (const field of FIELD_REGISTRY) {
      const defaults = createEntryDefault(field.kind, uid(41)) as unknown as Json;
      expect(defaults[field.field], field.path).toEqual(field.default);
    }
  });

  it("targets inside the new fields resolve to the field and allow user-provided claims", () => {
    const person = uid(1), offering = uid(2), image = uid(3);
    const targets: [string, string][] = [
      ["/company_foundation/revenue", "/company_foundation/revenue"],
      ["/online_presence/phone", "/online_presence/phone"],
      [`/key_people/@${person}/age`, "/key_people/@id/age"],
      [`/key_people/@${person}/nationality`, "/key_people/@id/nationality"],
      [`/key_people/@${person}/portrait`, "/key_people/@id/portrait"],
      [`/key_people/@${person}/portrait/path`, "/key_people/@id/portrait"],
      [`/key_people/@${person}/portrait/content_type`, "/key_people/@id/portrait"],
      [`/key_people/@${person}/portrait/size_bytes`, "/key_people/@id/portrait"],
      [`/offerings/@${offering}/images`, "/offerings/@id/images"],
      [`/offerings/@${offering}/images/@${image}/path`, "/offerings/@id/images"],
      [`/offerings/@${offering}/images/@${image}/content_type`, "/offerings/@id/images"],
      [`/offerings/@${offering}/images/@${image}/size_bytes`, "/offerings/@id/images"],
    ];
    for (const [target, registered] of targets) {
      expect(fieldForTarget(target)?.path, target).toBe(registered);
      expect(allowedOriginsForTarget(target), target).toContain("user_provided");
    }
  });

  it("an empty business requires coverage for revenue and phone exactly once", () => {
    const targets = requiredCoverageTargets(createEmptyBusiness());
    expect(targets.filter((target) => target === "/company_foundation/revenue")).toHaveLength(1);
    expect(targets.filter((target) => target === "/online_presence/phone")).toHaveLength(1);
    // 29 original singleton fields + site_links + revenue + phone, plus the two empty-collection rows.
    expect(targets).toHaveLength(34);
  });

  it("a business with one person and one offering requires eight coverage rows for each", () => {
    const empty = createEmptyBusiness() as unknown as Json;
    const business = { ...empty, key_people: [person()], offerings: [offering()] };
    const targets = requiredCoverageTargets(business);
    const personRows = targets.filter((target) => target.startsWith(`/key_people/@${uid(1)}/`)).map((target) => target.split("/").at(-1)).sort();
    const offeringRows = targets.filter((target) => target.startsWith(`/offerings/@${uid(2)}/`)).map((target) => target.split("/").at(-1)).sort();
    expect(personRows).toEqual(["age", "background_or_relevance", "gender", "name", "nationality", "portrait", "role", "title"]);
    expect(offeringRows).toEqual(["category", "description", "features", "images", "name", "offering_type", "pricing", "url"]);
    expect(targets).toHaveLength(32 + 8 + 8);
  });
});

describe("contract sources and migration files for the SQL contract", () => {
  const migrations = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  const schemas = () => JSON.parse(read("src/contracts/json-schemas.json")) as Record<string, any>;

  it("json-schemas.json knows every new field (the structural boundary used by SQL)", () => {
    const all = schemas();
    expect(Object.keys(all.company_foundation.properties)).toContain("revenue");
    expect(Object.keys(all.online_presence.properties)).toContain("phone");
    expect(Object.keys(all.key_person.properties)).toEqual(expect.arrayContaining(["age", "nationality", "portrait"]));
    expect(Object.keys(all.offering.properties)).toContain("images");
    expect(all.offering.properties.images.type).toBe("array");
    expect(all.offering.properties.images.maxItems).toBe(20);
    // The export schema embeds the same sections.
    const exported = all.export.properties;
    expect(Object.keys(exported.company_foundation.properties)).toContain("revenue");
    expect(Object.keys(exported.online_presence.properties)).toContain("phone");
    expect(Object.keys(exported.key_people.items.properties)).toEqual(expect.arrayContaining(["age", "nationality", "portrait"]));
    expect(Object.keys(exported.offerings.items.properties)).toContain("images");
  });

  it("defaults.json and field-registry.json carry the new fields and defaults", () => {
    const defaults = JSON.parse(read("src/contracts/defaults.json"));
    expect(defaults.company_foundation).toHaveProperty("revenue", null);
    expect(defaults.online_presence).toHaveProperty("phone", null);
    const registry = JSON.parse(read("src/contracts/field-registry.json")) as { path: string }[];
    for (const wanted of ["/company_foundation/revenue", "/online_presence/phone", "/key_people/@id/age", "/key_people/@id/nationality", "/key_people/@id/portrait", "/offerings/@id/images"]) {
      expect(registry.map((item) => item.path), wanted).toContain(wanted);
    }
  });

  it("a NEW migration exists (0018, or 0019 when 0018_knowledge_assets_storage.sql is present), holds the generated contract block and names the new fields", () => {
    // The storage uploads migration owns 0018_knowledge_assets_storage.sql when present; the model-fields migration then takes the next free number.
    const storageMigration = "0018_knowledge_assets_storage.sql";
    // Later migrations (0020 archives entries) are ignored; only the two numbers this migration could take count here.
    const added = migrations.filter((name) => {
      const number = Number.parseInt(name.split("_")[0], 10);
      return number >= 18 && number <= 19 && name !== storageMigration;
    });
    expect(added.length, "exactly one model-fields migration numbered above the migrations that came before it").toBe(1);
    const expected = migrations.includes(storageMigration) ? "0019_" : "0018_";
    expect(added[0].startsWith(expected), `the model-fields migration is the first free number ${expected.slice(0, 4)} (found ${added[0]})`).toBe(true);
    const text = read(`supabase/migrations/${added[0]}`);
    expect(text).toContain("-- BEGIN GENERATED CONTRACT (scripts/generate-sql-contract.mjs; do not edit)");
    expect(text).toContain("-- END GENERATED CONTRACT");
    for (const needle of ['"revenue"', '"phone"', '"age"', '"nationality"', '"portrait"', '"images"']) {
      expect(text, needle).toContain(needle);
    }
  });

  it("migrations 0001-0017 are byte-identical (applied migrations are never edited)", () => {
    const frozen: Record<string, string> = {
      "0001_baseline.sql": "e6deb46ce4ff470789ce93c323730be4b27a0212eb196b78f5c43b6e91b953d6",
      "0002_security.sql": "ca2db420b30c92744ae89966789f17c5ffed741b64a931993fbbb7143609bbc6",
      "0003_validation.sql": "9abdffd491d1980f4c8e04cf857d37f2414723bbd4dd366034a2abf1936f01ec",
      "0004_contract.generated.sql": "ae834658bfe414e4e913bdc2bc65d042adbaf2d470da385b80376f901fda718e",
      "0005_domain.sql": "e17e9f93e854787ad3155d14fecaf5933f9d1e7581317704923efd1b342deb94",
      "0006_revisions.sql": "8d8a2a937f6288a36b1331ec30181c1c295da849eaa14eca35e377c73f9759fa",
      "0007_publication.sql": "3e5483a26a71a84b9ac15400818fc832c97cc0fdbee37a0337d6d1ba72a431c0",
      "0008_jobs.sql": "4ae6a8d25a13786fbfdf7a42cccd660d95e96d00508ca99f92b4bf4181217958",
      "0009_finalization.sql": "23e4b3e5f281077096ff1e541ab5d83231f0e1e2392e14a6123e7bea894bd555",
      "0010_auth_membership.sql": "9d8acd0d31e0188f3f0cecc23164e95047286ed527be058f968acebab7926755",
      "0011_gender_evidence.sql": "780abe61f628897a7521f006f520beaf8406705a1e8e89e44cdc3ac21c160c14",
      "0012_selected_evidence_edits.sql": "089e8e8e2d71bafe1337537b25eef8fb21132c276612019ad9ae1a287288974b",
      "0013_explicit_proposal_changes.sql": "033280fb99e504dc7dbfc5bd99672f52c8f70a072262ce5bf5f2673880d38215",
      "0014_no_ai_proposals.sql": "681e2ab82bb12502e56ec292b7b84af9e311ad29750430a5db8b97eb76a9f435",
      "0015_extractor_checkpoint_version.sql": "a20d45cf2c9c3d137567e0be728d66eef2f6da4cd45cdc0bb9708aa3b7d136b1",
      "0016_ranked_checkpoint_candidates.sql": "f5c9671d15fd39eab8e405e4bf4b09e15f8de969add6ad9f1816b47f5cc88522",
      "0017_site_links.sql": "abfcd002824ed2420f6ec755a11398a29e5290af8db6142fdbb19fe48a21bfd9",
    };
    for (const [name, expected] of Object.entries(frozen)) {
      expect(migrations, name).toContain(name);
      expect(createHash("sha256").update(readFileSync(resolve(root, "supabase/migrations", name))).digest("hex"), name).toBe(expected);
    }
  });

  it("node scripts/generate-sql-contract.mjs --check passes", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-sql-contract.mjs", "--check"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});
