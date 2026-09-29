"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react";
export function Login({
  demo,
  initialized,
}: {
  demo: boolean;
  initialized: boolean;
}) {
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
      window.location.assign(window.location.origin + "/");
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
          <p className="muted">
            {initialized
              ? "Sign in to keep things moving."
              : "Create the first administrator to open this workspace."}
          </p>
          {initialized ? (
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
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <>
                    Enter workspace <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const password = f.get("password");
                const confirmPassword = f.get("confirmPassword");
                if (password !== confirmPassword) {
                  setError("Passwords do not match");
                  return;
                }
                login({
                  action: "bootstrap",
                  name: f.get("name"),
                  email: f.get("email"),
                  password,
                });
              }}
            >
              <label>
                Administrator name
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  maxLength={100}
                />
              </label>
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
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <>
                    Create administrator <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}
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
          {initialized && (
            <p className="login-help">
              Need access? Ask your workspace administrator.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
