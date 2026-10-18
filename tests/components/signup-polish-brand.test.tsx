// Q25 acceptance: sign-up polish and the MoFlo Knowledge brand rename.
// Happy path plus the named defects only (owner ruling: no edge cases).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ message: "" }));

// Lets a test render the sign-up form with a status message already set,
// the way it looks after a submit. The form's only string state is its
// status message, so the first useState("") call is the one replaced.
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (initial: unknown) =>
      initial === "" && state.message
        ? [state.message, () => {}]
        : (real.useState as (v: unknown) => unknown[])(initial),
  };
});

const SRC = new URL("../../src/", import.meta.url);
const CSS = new URL("../../src/app/globals.css", import.meta.url);

function visibleText(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "");
}

// Brand (C1): the component renders the new name.
it("C1 brand component renders MoFlo Knowledge", async () => {
  const icons = await import("../../src/components/shared/icons").catch(() => null);
  expect(icons).not.toBeNull();
  const Brand = (icons as Record<string, unknown> | null)?.Brand;
  expect(typeof Brand).toBe("function");
  const text = visibleText(
    renderToStaticMarkup(createElement(Brand as () => null)),
  );
  expect(text).toContain("MoFlo Knowledge");
  expect(text).not.toContain("Cloud");
});

// Brand (C1): no user-visible "MoFlo Cloud" left in src. Comments are skipped.
it("C1 no user-visible MoFlo Cloud remains in src", () => {
  const files = readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  const hits: string[] = [];
  for (const file of files) {
    const lines = readFileSync(join(SRC.pathname, file), "utf8").split("\n");
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (inBlockComment) {
        if (t.includes("*/")) {
          inBlockComment = false;
        }
        return;
      }
      if (t.startsWith("/*")) {
        if (!t.includes("*/")) {
          inBlockComment = true;
        }
        return;
      }
      if (t.startsWith("//") || t.startsWith("*")) {
        return;
      }
      if (line.includes('MoFlo Cloud')) {
        hits.push(`${relative(SRC.pathname, join(SRC.pathname, file))}:${i + 1}`);
      }
    });
  }
  expect(hits).toEqual([]);
});

// App title (C1): the layout metadata title is the new name.
it("C1 layout metadata title is MoFlo Knowledge", async () => {
  const layout = await import("../../src/app/layout").catch(() => null);
  expect(layout).not.toBeNull();
  expect(layout?.metadata).toBeDefined();
  const title: any = layout?.metadata.title;
  const text = typeof title === "string" ? title : title?.default;
  expect(text).toBe("MoFlo Knowledge");
});

// Sign-up status (C2): the check-email message carries a success modifier;
// the passwords-do-not-match error does not.
it("C2 check-email message has a success modifier; mismatch error does not", async () => {
  const mod = await import("../../src/components/auth/sign-up-form").catch(() => null);
  expect(mod).not.toBeNull();
  expect(typeof mod?.SignUpForm).toBe("function");
  const SignUpForm = mod!.SignUpForm;

  const statusOf = (message: string) => {
    state.message = message;
    const html = renderToStaticMarkup(createElement(SignUpForm));
    const match = /<p\b([^>]*\brole="status"[^>]*)>([^<]*)<\/p>/.exec(html);
    expect(match).not.toBeNull();
    const classAttr = /\bclass="([^"]*)"/.exec(match![1]);
    return {
      text: match![2],
      tokens: classAttr ? classAttr[1].split(/\s+/) : [],
    };
  };

  const success = statusOf("Check your email to confirm your account.");
  expect(success.text).toBe("Check your email to confirm your account.");
  expect(success.tokens.some((t) => /success/i.test(t))).toBe(true);

  const mismatch = statusOf("Passwords do not match.");
  expect(mismatch.text).toBe("Passwords do not match.");
  expect(mismatch.tokens.some((t) => /success/i.test(t))).toBe(false);
});

// CSS rule parser: walks globals.css and returns each rule with its
// enclosing at-rule preludes (e.g. "@media (max-width: 640px)").
function cssRules(css: string) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  const out: { ctx: string[]; sel: string; body: string }[] = [];
  let buf = "";
  for (const c of src) {
    if (c === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (c === "}") {
      const sel = stack.pop() ?? "";
      out.push({ ctx: [...stack], sel, body: buf.trim() });
      buf = "";
    } else {
      buf += c;
    }
  }
  return out;
}

function mobileMaxWidth(ctx: string[]): number | null {
  for (const c of ctx) {
    const m = /@media[^]*?max-width:\s*(\d+(?:\.\d+)?)px/.exec(c);
    if (m) {
      return Number(m[1]);
    }
  }
  return null;
}

// Status style (C3): a success status style exists in globals.css.
it("C3 globals.css has a success style for the sign-in status line", () => {
  const rules = cssRules(readFileSync(CSS, "utf8"));
  const successRule = rules.find(
    (r) =>
      r.sel.includes('success') &&
      r.sel.includes('status') &&
      r.body.length > 0,
  );
  expect(successRule).toBeDefined();
});

// Mobile (C4): at phone width the sign-in story keeps its headline visible.
it("C4 mobile (<=640px) media rule keeps the sign-in story headline visible", () => {
  const rules = cssRules(readFileSync(CSS, "utf8"));
  const mobile = rules.filter((r) => {
    const w = mobileMaxWidth(r.ctx);
    return w !== null && w <= 640;
  });
  // A mobile rule exists for the .sign-in layout.
  expect(mobile.some((r) => /\.sign-in(?![\w-])/.test(r.sel))).toBe(true);
  // ...and no mobile rule hides the story headline.
  const hidesHeadline = mobile.some(
    (r) =>
      /sign-in__story\s*>\s*div\b|sign-in__story\s+(div|h1)\b/.test(r.sel) &&
      /display\s*:\s*none/.test(r.body),
  );
  expect(hidesHeadline).toBe(false);
});
