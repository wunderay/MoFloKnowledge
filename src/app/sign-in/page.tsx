import { APP_NAME } from "../../lib/brand";
import { Brand } from "@/components/icons";
import { SignInForm } from "@/components/sign-in-form";
export default function SignInPage() {
  return (
    <main className="sign-in">
      <section className="sign-in__story">
        <a href="/" aria-label={`${APP_NAME} home`}>
          <Brand />
        </a>
        <div>
          <p className="eyebrow">A shared source of truth</p>
          <h1>
            Know the company.
            <br />
            Show the evidence.
          </h1>
          <p>
            Turn your website into clear, reviewed company knowledge. Keep every
            source, correction, and saved version in view.
          </p>
        </div>
        <small>Capture thoughtfully. Review confidently.</small>
      </section>
      <section className="sign-in__form">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your company knowledge.</p>
          <SignInForm />
          <p className="muted">
            <a href="/sign-up">Create an account</a>
          </p>
        </div>
      </section>
    </main>
  );
}
