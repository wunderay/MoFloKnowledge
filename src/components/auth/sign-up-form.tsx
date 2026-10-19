"use client";
import { useState } from "react";
export function SignUpForm() {
  const [message, setMessage] = useState("");
  const ok = message.startsWith("Check your email");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="sign-in-fields"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (form.get("password") !== form.get("confirmPassword")) {
          setMessage("Passwords do not match.");
          return;
        }
        setBusy(true);
        try {
          const response = await fetch("/api/auth/sign-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: form.get("email"),
              password: form.get("password"),
            }),
          });
          const result = (await response.json()) as { error?: { message?: string }; data?: { signedIn?: boolean } };
          if (!response.ok) {
            setMessage(result.error?.message || "Unable to sign up.");
          } else if (result.data?.signedIn) {
            window.location.assign("/knowledge");
          } else {
            setMessage("Check your email to confirm your account.");
          }
        } catch {
          setMessage("Unable to connect. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span className="field__label">Email</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />
      </label>
      <label className="field">
        <span className="field__label">Confirm password</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <button className="button button--primary" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p role="status" className={ok ? "sign-in__status--success" : undefined}>{message}</p>
    </form>
  );
}
