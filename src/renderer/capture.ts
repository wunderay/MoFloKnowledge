import type { Page } from "playwright-core";
import type { RenderResult } from "../contracts/render-task";
export async function captureRenderedPage(
  page: Page,
): Promise<Omit<RenderResult, "resourceBytes">> {
  return page.evaluate(() => {
    const limitations: string[] = [];
    const visible = (node: Element) => {
      const style = getComputedStyle(node);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        node.getClientRects().length > 0 &&
        !node.closest('[hidden],[aria-hidden="true"]')
      );
    };
    const text = (node: Element, limit = 2000) => {
      const original = (
        (node as HTMLElement).innerText ??
        node.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (original.length > limit) {
        limitations.push(
          "A visible text observation exceeded the capture limit.",
        );
      }
      return original.slice(0, limit);
    };
    const safeURL = (raw: string | null | undefined): string | null => {
      if (!raw) {
        return null;
      }
      try {
        const url = new URL(raw, document.baseURI);
        return ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.href.length <= 4096
          ? url.href
          : null;
      } catch {
        return null;
      }
    };
    const selectorFor = (element: Element): string => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current) {
        if (current.id && current.id.length <= 200) {
          parts.unshift("#" + CSS.escape(current.id));
          break;
        }
        const tag = current.tagName.toLowerCase();
        const currentTag = current.tagName;
        const siblings = current.parentElement
          ? [...current.parentElement.children].filter(
              (sibling) => sibling.tagName === currentTag,
            )
          : [current];
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const select = (query: string, limit: number) => {
      const observed = [...document.querySelectorAll(query)].filter(visible);
      const usable = observed.filter(
        (node) => selectorFor(node).length <= 2000,
      );
      if (usable.length > limit || usable.length !== observed.length) {
        limitations.push(
          "Rendered " +
            query.slice(0, 200) +
            " observations exceeded the capture limit.",
        );
      }
      return usable.slice(0, limit);
    };
    const styles = select(
      'body,h1,h2,h3,button,a[role="button"],header,footer',
      100,
    ).map((element, index) => {
      const style = getComputedStyle(element);
      return {
        selector: selectorFor(element),
        evidenceId: `style${index + 1}`,
        fontFamily: style.fontFamily.slice(0, 2000),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
      };
    });
    const stylesheets = [...document.styleSheets].slice(0, 50).map((sheet) => {
      try {
        const declarations = [...sheet.cssRules]
          .map((rule) => rule.cssText)
          .join("\n");
        if (declarations.length > 100000) {
          limitations.push(
            "Stylesheet observation exceeded the capture limit.",
          );
        }
        return {
          url: safeURL(sheet.href),
          declarations: declarations.slice(0, 100000),
          status: "available" as const,
        };
      } catch {
        limitations.push(
          "Stylesheet CSSOM inaccessible: " +
            (sheet.href ?? "inline").slice(0, 400),
        );
        return {
          url: safeURL(sheet.href),
          declarations: "",
          status: "unavailable" as const,
        };
      }
    });
    const fonts = performance
      .getEntriesByType("resource")
      .filter(
        (entry) =>
          /\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(entry.name) &&
          safeURL(entry.name),
      )
      .slice(0, 100)
      .map((entry) => ({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the filter above keeps only entries whose URL parses
        url: safeURL(entry.name)!,
        loaded: (entry as PerformanceResourceTiming).responseEnd > 0,
      }));
    const logos = select(
      'header img,footer img,[role="banner"] img,img[alt*="logo" i]',
      40,
    )
      .filter(
        (element) =>
          !element.closest("a")?.hostname ||
          [location.hostname, "www." + location.hostname].includes(
            element.closest("a")?.hostname ?? "",
          ),
      )
      .map((element) => {
        const image = element as HTMLImageElement;
        return {
          url: safeURL(image.currentSrc || image.src),
          alt: image.alt.slice(0, 500),
          context: (
            image.closest('header,footer,[role="banner"]')?.tagName ??
            "candidate"
          ).toLowerCase(),
        };
      })
      .filter(
        (logo): logo is { url: string; alt: string; context: string } =>
          logo.url !== null,
      );
    const links = select("a[href]", 500)
      .map((element) => ({
        url: safeURL(element.getAttribute("href")),
        label: text(element, 500),
        selector: selectorFor(element),
      }))
      .filter(
        (link): link is { url: string; label: string; selector: string } =>
          link.url !== null,
      );
    const forms = select("form", 40).map((element) => {
      const form = element as HTMLFormElement;
      return {
        selector: selectorFor(form),
        action: safeURL(form.action),
        method: form.method.toUpperCase().slice(0, 20),
        labels: [...form.querySelectorAll("label")]
          .filter(visible)
          .slice(0, 30)
          .map((node) => text(node, 500)),
      };
    });
    const ctas = select(
      'button,a[role="button"],input[type="submit"]',
      100,
    ).map((element) => {
      const control = element as HTMLButtonElement | HTMLInputElement;
      const explicitAction = element.getAttribute("formaction");
      const destination = safeURL(
        element.getAttribute("href") ??
          explicitAction ??
          (control.type === "submit" && control.form
            ? control.form.action
            : null),
      );
      return {
        selector: selectorFor(element),
        label:
          text(element, 500) ||
          (element instanceof HTMLInputElement
            ? element.value.slice(0, 500)
            : ""),
        destination,
      };
    });
    const headings = select("h1,h2,h3,h4,h5,h6", 200).map((node) => ({
      selector: selectorFor(node),
      level: Number(node.tagName.slice(1)),
      text: text(node),
    }));
    const addresses = select('address,[itemprop="address"]', 30).map(
      (node) => ({ selector: selectorFor(node), text: text(node) }),
    );
    const priceText = select(
      '[itemprop="price"],[class*="price"],[class*="pricing"]',
      40,
    ).map((node) => ({ selector: selectorFor(node), text: text(node) }));
    const metadata = {
      title: document.title.slice(0, 2000) || null,
      meta: [...document.querySelectorAll("meta[name],meta[property]")]
        .slice(0, 80)
        .map((node) => ({
          name: (
            node.getAttribute("name") ??
            node.getAttribute("property") ??
            ""
          ).slice(0, 200),
          content: (node.getAttribute("content") ?? "").slice(0, 2000),
        })),
      canonical: safeURL(
        document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      ),
      jsonLd: [
        ...document.querySelectorAll('script[type="application/ld+json"]'),
      ]
        .slice(0, 10)
        .flatMap((node) => {
          const original = node.textContent ?? "";
          if (original.length > 16000) {
            limitations.push("Structured metadata exceeded the capture limit.");
            return [];
          }
          try {
            JSON.parse(original);
            return [original];
          } catch {
            return [];
          }
        }),
    };
    const root = document.querySelector("main") ?? document.body;
    const originalText = (root as HTMLElement | null)?.innerText ?? "";
    if (originalText.length > 100000) {
      limitations.push("Rendered text exceeded the capture limit.");
    }
    return {
      finalUrl: location.href,
      text: originalText.slice(0, 100000),
      styles,
      stylesheets,
      fonts,
      logos,
      links,
      forms,
      ctas,
      headings,
      addresses,
      priceText,
      metadata,
      limitations: limitations.slice(0, 100),
    };
  });
}
