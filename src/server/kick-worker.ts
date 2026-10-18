import "server-only";
import { after } from "next/server";
import { appOrigin } from "../lib/config/server";
import { logError } from "./log";

/**
 * Starts the one-shot worker route once the response has been sent. Without CRON_SECRET (a VM deployment running
 * `npm run worker`) this does nothing: that worker polls the queue itself.
 */
export function kickWorker() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return;
  }
  after(async () => {
    try {
      await fetch(`${appOrigin()}/api/worker/run`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
    } catch (error) {
      logError("could not start the worker", { error });
    }
  });
}
