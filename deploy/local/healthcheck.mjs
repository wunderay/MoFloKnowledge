// Container health: the entrypoint has finished starting (and created the demo login), and the app and auth answer on the public origin.
import { existsSync } from "node:fs";

const port = process.env.PUBLIC_PORT ?? "8080";
const ready = `${process.env.RUN_DIR ?? "/run/moflo-local"}/ready`;
if (!existsSync(ready)) {
  process.exit(1);
}
for (const path of ["/sign-in", "/auth/v1/health"]) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`).catch(() => null);
  if (!response?.ok) {
    process.exit(1);
  }
}
