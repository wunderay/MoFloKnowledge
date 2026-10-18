import { APP_NAME } from "../../lib/brand";
import { Brand } from "@/components/shared/icons";
import { SignUpForm } from "@/components/auth/sign-up-form";
export default function SignUpPage() {
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
          <h2>Create your account</h2>
          <p className="muted">Sign up to start your company knowledge.</p>
          <SignUpForm />
          <p className="muted sign-in__alt">
            Already have an account? <a href="/sign-in">Sign in</a>
          </p>
        </div>
      </section>
    </main>
  );
}
