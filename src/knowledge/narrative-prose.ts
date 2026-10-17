/** Display-only sentence bullets. Original values and evidence remain untouched. */
export type FactualBullet = { text: string; label?: string };
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const quoted = (text: string) => /["“”«»‘’]/u.test(text)
  || /(?:^|\s)'[^'\n]+'(?:\s|[.,!?]|$)/u.test(text);

// Literal tokens (email, URL, www host, host/path, @handle, #hashtag) must reach the reader byte-for-byte.
const literalShape = [/^[^\s@/]+@[^\s@/]+\.\p{L}{2,}$/u, /^\w+:\/\//u, /^www\./iu,
  /^[^\s/@.]+(?:\.[^\s/@.]+)*\.\p{L}{2,}\/\S*$/u,
  /^[^\s/@.]+(?:\.[^\s/@.]+)*\.(?:com|org|net|io|co|ai|app|dev|edu|gov|info|biz|me|us|uk|ca|au|de|fr|jp|nz|ie|in)$/iu, /^[@#]\w+$/u];
const literalToken = (token: string) => {
  const core = token.replace(/^.*\]\(/u, "").replace(/^[(<["']+/u, "").replace(/[.,;:!?)\]>'"]+$/u, "");
  return literalShape.some((shape) => shape.test(core));
};

export function factualBullets(text: string, company: string, verbatim = false): FactualBullet[] {
  if (quoted(text)) return [{ text }];
  const personal = /\b(?:I|my|me)\b/iu.test(text);
  return [...sentences.segment(text)].map(({ segment }) => segment.trim()).filter(Boolean).map((statement) => {
    if (verbatim || personal) return { text: statement };
    const welcome = `Welcome to ${company}, a trusted partner for `;
    if (statement.startsWith(welcome)) {
      const detail = statement.slice(welcome.length);
      return { text: detail.charAt(0).toUpperCase() + detail.slice(1) };
    }
    const voice = statement.match(/^We (also )?(specialize in|provide|offer|perform|use|adhere to|can|will|may|must|should) (.+)$/su);
    if (!voice) return { text: statement };
    const [, additional, verb, predicate] = voice;
    // Do not reinterpret omitted-subject clauses, coordination or another speaker.
    const nominalAnd = [...predicate.matchAll(/\band\s+([\p{L}-]+)/gu)].every((match) => {
      const head = match[1];
      return /ing$|s$/u.test(head) && head.length > 3 && !/(?:ss|us|is)$|^(?:does|this|thus)$/u.test(head);
    });
    if (/[;:]|\b(?:or|but|nor|yet|we|us|ourselves|ours)\b/iu.test(predicate) || !nominalAnd) {
      return { text: statement, label: "Company statement" };
    }
    // A trailing assistance clause can be a separate factual bullet without changing its agent.
    const assistance = predicate.match(/^([^,]+), assisting (.+)$/su);
    const body = assistance?.[1] ?? predicate;
    const specialtyResult = verb === "specialize in" && /^[^,]+, ensuring [^,]+$/su.test(body);
    if ((body.includes(",") && !specialtyResult) || /^(?:no|not|never)\b/u.test(body)) return { text: statement, label: "Company statement" };
    const neutral = (value: string) => value.replace(/\S+/gu, (token) => literalToken(token) ? token : token.replace(/\bour\b/gu, "its"));
    const labels: Record<string, string> = { "specialize in": "Specialty", provide: "Services provided", offer: "Services offered",
      perform: "Activities performed", use: "Tools used", "adhere to": "Adherence" };
    const label = labels[verb];
    if (assistance && !label) return { text: statement, label: "Company statement" };
    return { text: neutral(label ? body : `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${body}`),
      ...(label ? { label: `${additional ? "Additional " : ""}${label.charAt(0).toLowerCase()}${label.slice(1)}`.replace(/^./, (letter) => letter.toUpperCase()) } : {}),
      ...(assistance ? { assistance: neutral(assistance[2]) } : {}),
    };
  }).flatMap((bullet) => "assistance" in bullet && typeof bullet.assistance === "string"
    ? [{ text: bullet.text, label: bullet.label }, { text: `Assisting ${bullet.assistance}` }] : [bullet]);
}
