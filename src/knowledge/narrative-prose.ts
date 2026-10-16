// Display-only company voice. Unsupported grammar falls back to the complete saved wording.
const present: Record<string, string> = {
  provide: "provides", offer: "offers", specialize: "specializes", perform: "performs", use: "uses",
  help: "helps", assist: "assists", handle: "handles", support: "supports", serve: "serves",
  adhere: "adheres", make: "makes", work: "works", deliver: "delivers", focus: "focuses",
  have: "has", do: "does",
};
const modals = new Set(["can", "could", "will", "would", "may", "might", "must", "should"]);
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });

function seed(text: string) {
  let value = 0;
  for (const character of text) value = (Math.imul(value, 31) + character.codePointAt(0)!) >>> 0;
  return value;
}

export function varyCompanyNarrative(text: string, company: string): string {
  // Quotes and personal voice have a different speaker; never reinterpret them as company claims.
  if (/["“”«»‘’]/u.test(text) || /(?:^|\s)'[^'\n]+'(?:\s|[.,!?]|$)/u.test(text)
    || /\b(?:I|I'm|I’m|my|me)\b/iu.test(text)) return text;
  return [...sentences.segment(text)].map(({ segment }) => {
    const match = segment.match(/^(\s*)(We\s+(?:also\s+)?)([\s\S]*?)(\s*)$/u);
    if (!match) return segment;
    const [, before, opening, predicate, after] = match;
    // Nested first-person clauses, contractions and reflexives require more parsing than this renderer does.
    if (/\b(?:we|us|ourselves|ours)\b|[‘’']/iu.test(predicate)) return segment;
    const choice = seed(`${company}\0${segment.trim()}`);

    // Front an existing range without changing its capability modal, agent or endpoints.
    const range = predicate.match(/^(can|could|will|would|may|might|must|should) ([^,;:]+), from ([^,;:.!?]+ to [^,;:.!?]+)([.!?]?)$/u);
    if (!opening.includes("also") && range && !/\b(?:but|although|unless|except|when|while|because)\b/u.test(range[3])) {
      return `${before}From ${range[3]}, we ${range[1]} ${range[2]}${range[4]}${after}`;
    }
    if (/,\s+from\b/u.test(predicate)) return segment;
    // The examples remain an explicitly non-exhaustive list, with the original agent and predicate.
    const examples = predicate.match(/^(perform|provide|offer) ([^,;:]+s), such as ([\s\S]+)$/u);
    if (!opening.includes("also") && examples && /\b(?:functions|services|programs|tasks|activities|products|solutions|tools)$/u.test(examples[2])
      && !/\b(?:no|not|never|only|each|every)\b/u.test(examples[2])
      && /,|\band\b/u.test(examples[3])) {
      const determiner = /^(?:a|an|the|our|your|their|its|these|those|some|any)\b/u.test(examples[2]) ? "" : "the ";
      return `${before}Among ${determiner}${examples[2]} we ${examples[1]} are ${examples[3]}${after}`;
    }

    const verb = predicate.match(/^(\w+)\b([\s\S]*)$/u);
    if (!verb || (!present[verb[1]] && !modals.has(verb[1]))) return segment;
    // Avoid ambiguous coordinated predicates and perfect aspect, including omitted auxiliary subjects.
    if (verb[1] === "have" || /\band\s+(?!(?:also\s+)?(?:can|could|will|would|may|might|must|should)\b)/u.test(verb[2])) return segment;
    const subjects = ["We", "The company", company, "The company", "It"];
    const subject = subjects[choice % subjects.length];
    const thirdPerson = subject !== "We";
    const body = `${thirdPerson && present[verb[1]] ? present[verb[1]] : verb[1]}${verb[2]}`;
    // A single recognized subject owns every possessive in this sentence; other first-person clauses were excluded.
    const agreed = thirdPerson ? body.replace(/\bour\b/gu, "its") : body;

    if (opening.includes("also")) {
      const continuation = subject === "The company" ? "the company" : subject === "We" ? "we" : subject === "It" ? "it" : subject;
      return `${before}In addition, ${continuation} ${agreed}${after}`;
    }
    return `${before}${subject} ${agreed}${after}`;
  }).join("");
}
