import { expect, it } from "vitest";
import { Frontier } from "../../src/worker/crawl/frontier";

// Fictional small-business site. Every test uses one Frontier with a document limit of 15;
// the root page is itself the first selection and counts toward that limit.
// The brief's host (acme-wells.example) is rejected by the frontier: the .example TLD is not an
// ICANN suffix, so the constructor throws NetworkPolicyError before any assertion runs. The host
// is therefore a subdomain of example.com, the IANA-reserved documentation domain.
const SITE = "https://acme-wells.example.com/";
const DOCUMENT_LIMIT = 15;

/** Takes up to `count` selections and returns their pathnames. Never throws on an empty frontier. */
function selectPaths(frontier: Frontier, count: number): string[] {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = frontier.next();
    if (!item) {
      break;
    }
    paths.push(new URL(item.url).pathname);
  }
  return paths;
}

it("treats /contact and /contact/ as one page", () => {
  const frontier = new Frontier(SITE, { documentLimit: DOCUMENT_LIMIT });
  frontier.add("/contact", "Contact", 1);
  frontier.add("/contact/", "Contact", 1);

  const selected = selectPaths(frontier, DOCUMENT_LIMIT);
  const contactPages = selected.filter((path) => path.replace(/\/+$/, "") === "/contact");

  expect(contactPages, `selected pathnames: ${selected.join(", ")}`).toHaveLength(1);
});

it("selects services children, staff, testimonials, financing and estimate pages before legal, careers and media pages", () => {
  // Nav-style links from the home page, all at depth 1. Labels are as shown in the menus.
  const links: [string, string][] = [
    // Services submenu children (top-level paths, so only the labels say they are services)
    ["/drilling/", "Drilling"],
    ["/pumping-systems/", "Pumping Systems"],
    ["/well-inspections/", "Well Inspections"],
    ["/financing/", "Financing"],
    // Required: staff, testimonials, estimate request
    ["/staff/", "Our Team"],
    ["/testimonials/", "Testimonials"],
    ["/request-estimate/", "Request an Estimate"],
    // Low-value pages that must not be selected ahead of the required ones
    ["/privacy-policy/", "Privacy Policy"],
    ["/careers/", "Careers"],
    ["/training-videos/", "Training Videos"],
    ["/diagrams/", "Diagrams"],
    // Other noise
    ["/wp-login.php", "Log in"],
    ["/blog/spring-well-maintenance/", "Spring well maintenance"],
    ["/blog/water-test-basics/", "Water test basics"],
    ["/blog/pump-noise-guide/", "Pump noise guide"],
    ["/blog/understanding-well-depth/", "Understanding well depth"],
    ["/blog/what-is-a-pressure-tank/", "What is a pressure tank"],
    ["/blog/winter-well-care/", "Winter well care"],
    ["/troubleshooting/home/", "Home"],
    ["/troubleshooting/pump/", "Pump troubleshooting"],
    ["/gallery/", "Gallery"],
    ["/terms-of-use/", "Terms of Use"],
    ["/client-hub/", "Client Hub"],
    ["/sitemap/", "Sitemap"],
    ["/media/", "Media"],
    ["/resources/water-quality-guide/", "Water Quality Guide"],
    ["/resources/well-depth-chart/", "Well Depth Chart"],
    ["/search/", "Search"],
    ["/cart/", "Cart"],
    ["/shop/", "Shop"],
  ];
  expect(links).toHaveLength(30);

  const frontier = new Frontier(SITE, { documentLimit: DOCUMENT_LIMIT });
  for (const [path, label] of links) {
    frontier.add(path, label, 1);
  }

  const selected = selectPaths(frontier, DOCUMENT_LIMIT);
  const required = [
    "/drilling/",
    "/pumping-systems/",
    "/well-inspections/",
    "/financing/",
    "/staff/",
    "/testimonials/",
    "/request-estimate/",
  ];
  const lowValue = ["/privacy-policy/", "/careers/", "/training-videos/", "/diagrams/"];

  const missing = required.filter((path) => !selected.includes(path));
  expect(missing, `not selected within the first ${DOCUMENT_LIMIT}: ${missing.join(", ")}; selected: ${selected.join(", ")}`).toEqual([]);

  const lastRequiredIndex = Math.max(...required.map((path) => selected.indexOf(path)));
  const early = lowValue.filter((path) => {
    const index = selected.indexOf(path);
    return index !== -1 && index < lastRequiredIndex;
  });
  expect(early, `low-value pages selected before required pages; selected: ${selected.join(", ")}`).toEqual([]);
});

it("ranks a Services parent and its children by path words and labels", () => {
  // frontier.add() takes (url, label, depth, rank?) and has no parent-menu label, so the
  // "Services" menu context is not passed. Ranking relies on the /services/ path words and the
  // child labels only.
  const services = ["/services/", "Services"];
  const children: [string, string][] = [
    ["/services/drilling/", "Drilling"],
    ["/services/pumping-systems/", "Pumping Systems"],
    ["/services/well-inspections/", "Well Inspections"],
    ["/services/financing/", "Financing"],
  ];
  const noise: [string, string][] = [
    ["/privacy-policy/", "Privacy Policy"],
    ["/careers/", "Careers"],
    ["/training-videos/", "Training Videos"],
    ["/blog/spring-well-maintenance/", "Spring well maintenance"],
  ];

  const frontier = new Frontier(SITE, { documentLimit: DOCUMENT_LIMIT });
  for (const [path, label] of [services, ...children, ...noise]) {
    frontier.add(path, label, 1);
  }

  const selected = selectPaths(frontier, DOCUMENT_LIMIT);
  const required = [services[0], ...children.map(([path]) => path)];
  const lowValue = noise.map(([path]) => path);

  const missing = required.filter((path) => !selected.includes(path));
  expect(missing, `not selected within the first ${DOCUMENT_LIMIT}: ${missing.join(", ")}; selected: ${selected.join(", ")}`).toEqual([]);

  const lastRequiredIndex = Math.max(...required.map((path) => selected.indexOf(path)));
  const early = lowValue.filter((path) => {
    const index = selected.indexOf(path);
    return index !== -1 && index < lastRequiredIndex;
  });
  expect(early, `low-value pages selected before Services pages; selected: ${selected.join(", ")}`).toEqual([]);
});
