export function downloadFilename(companyName: string, version: number): string {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Invalid version");
  }
  const slug =
    companyName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "company";
  return `${slug}-knowledge-base-v${version}.json`;
}
