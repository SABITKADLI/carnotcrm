"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react";
export function Login({
  demo,
  initialized,
}: {
  demo: boolean;
  initialized: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Link className="wordmark" href="/">
          carnot<span>®</span>
        </Link>
        <div>
          <span className="eyebrow">THE WORKING STUDIO</span>
          <h1>
            From the first
            <br />
            thread to the
            <br />
            <em>finished piece.</em>
          </h1>
          <p>
            A considered workspace for the people,
            <br />
            materials and craft behind every collection.
          </p>
        </div>
        <div className="login-flow">
          <span>01 &nbsp; Source</span>
          <span>02 &nbsp; Make</span>
          <span>03 &nbsp; Deliver</span>
        </div>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">CARNOT WORKSPACE</span>
          <h2>Welcome to the studio.</h2>
          <p className="muted">Sign in to keep things moving.</p>
          {!initialized && (
            <div className="notice">
              Your workspace is ready for its first administrator. Run{" "}
              <code>npm run admin:create</code> on the server to create your
              account.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              login({ email: f.get("email"), password: f.get("password") });
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || !initialized}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <>
                  Enter workspace <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {demo && (
            <div className="demo-entry">
              <span className="eyebrow">EXPLORE WITH SAMPLE DATA</span>
              <button
                disabled={busy}
                onClick={() => login({ action: "demo", role: "admin" })}
              >
                Open admin studio <ArrowUpRight size={17} />
              </button>
              <button
                disabled={busy}
                onClick={() => login({ action: "demo", role: "tailor" })}
              >
                Open tailor portal <ArrowUpRight size={17} />
              </button>
              <small>
                Fictional records. Demo access is disabled in production.
              </small>
            </div>
          )}
          <p className="login-help">
            Need access? Ask your workspace administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
