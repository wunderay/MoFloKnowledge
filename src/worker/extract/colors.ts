export function normalizeColor(
  input: string,
): { hex: string; alpha: number } | null {
  const text = input.trim().toLowerCase();
  let rgb: number[];
  let alpha = 1;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread -- spreading a string by code point is intended (no grapheme splitting needed)
      h = [...h].map((c) => c + c).join("");
    }
    if (h.length === 8) {
      alpha = parseInt(h.slice(6), 16) / 255;
      h = h.slice(0, 6);
    }
    return { hex: "#" + h.toUpperCase(), alpha };
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(text);
  if (!fn) {
    return null;
  }
  const args = fn[2]
    .replace(/\s*\/\s*/, ",")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (args.length < 3 || args.length > 4) {
    return null;
  }
  if (args[3]) {
    alpha = args[3].endsWith("%") ? parseFloat(args[3]) / 100 : Number(args[3]);
  }
  if (fn[1].startsWith("rgb")) {
    rgb = args
      .slice(0, 3)
      .map((x) => (x.endsWith("%") ? parseFloat(x) * 2.55 : Number(x)));
  } else {
    const h = (((parseFloat(args[0]) % 360) + 360) % 360) / 360,
      s = parseFloat(args[1]) / 100,
      l = parseFloat(args[2]) / 100;
    if (!args[1].endsWith("%") || !args[2].endsWith("%")) {
      return null;
    }
    const hue = (p: number, q: number, t: number) => {
      if (t < 0) {
        t++;
      }
      if (t > 1) {
        t--;
      }
      return t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 0.5
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    rgb =
      s === 0
        ? [l, l, l].map((x) => x * 255)
        : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map(
            (x) => x * 255,
          );
  }
  if (
    ![...rgb, alpha].every(Number.isFinite) ||
    alpha < 0 ||
    alpha > 1 ||
    rgb.some((x) => x < 0 || x > 255)
  ) {
    return null;
  }
  return {
    hex:
      "#" +
      rgb
        .map((x) => Math.round(x).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
    alpha,
  };
}
/** Shades within a couple of steps per channel are one colour for a palette. */
export function nearDuplicateColor(a: string, b: string): boolean {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return x.every((value, i) => Math.abs(value - y[i]) <= 2);
}
