// Creates the demo login through the gateway (a GoTrue signup, auto-confirmed), the same way a person signing up would.
// Safe to run on every start: an already registered demo user is not an error.
const origin = process.env.PUBLIC_URL;
const { ANON_KEY, DEMO_EMAIL, DEMO_PASSWORD } = process.env;
if (!origin || !ANON_KEY || !DEMO_EMAIL || !DEMO_PASSWORD) {
  throw new Error("PUBLIC_URL, ANON_KEY, DEMO_EMAIL and DEMO_PASSWORD are required");
}
const response = await fetch(`${origin}/auth/v1/signup`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON_KEY },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
});
const body = await response.text();
if (response.ok) {
  console.log(`demo user ${DEMO_EMAIL} created`);
} else if (/already|exists|registered/i.test(body)) {
  console.log(`demo user ${DEMO_EMAIL} already exists`);
} else {
  console.error(`demo user signup failed: HTTP ${response.status} ${body}`);
  process.exit(1);
}
