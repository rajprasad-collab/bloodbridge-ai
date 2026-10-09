
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import "./index.css";
import Inventory from "./components/Inventory";
import BloodRequests from "./components/BloodRequests";
import RequestMatching from "./components/RequestMatching";
import DonorManagement from "./components/DonorManagement";
import DonorCooldown from "./components/DonorCooldown";

type Role = "admin" | "staff" | "hospital" | "donor";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
};

const roleDetails: Record<
  Role,
  { title: string; description: string }
> = {
  admin: {
    title: "Administrator Dashboard",
    description:
      "Manage authorized users, blood-bank facilities, system settings, and audit activities.",
  },
  staff: {
    title: "Blood Bank Dashboard",
    description:
      "Manage inventory, donation records, expiry monitoring, and blood requests.",
  },
  hospital: {
    title: "Hospital Dashboard",
    description:
      "Create blood requests and track their status and fulfillment.",
  },
  donor: {
    title: "Donor Dashboard",
    description:
      "Manage your donor profile and review your donation information.",
  },
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;

      if (error) {
        setError(error.message);
      }

      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      setProfile(null);
      setError("");

      if (!session?.user.id) {
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!alive) return;

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (!data) {
        setError(
          "Your profile was not found. Please contact the system administrator."
        );
        return;
      }

      setProfile(data as Profile);
    }

    void loadProfile();

    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });

        if (authError) throw authError;

        if (data.session) {
          setMessage("Registration successful. Welcome to BloodBridge AI.");
        } else {
          setMessage(
            "Registration received. Check your email to confirm your account, then sign in."
          );
          setMode("login");
        }
      } else {
        const { error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (authError) throw authError;
        setMessage("Login successful.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setError("");
    setMessage("");

    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError(logoutError.message);
    } else {
      setProfile(null);
      setPassword("");
      setMessage("You have signed out.");
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <div className="loading-card">Loading BloodBridge AI...</div>
      </main>
    );
  }

  if (session && !profile) {
    return (
      <main className="page-shell">
        <div className="loading-card">
          {error ? (
            <>
              <p className="error-message">{error}</p>
              <button className="secondary-button" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            "Loading your profile..."
          )}
        </div>
      </main>
    );
  }

  if (session && profile) {
    if (!profile.is_active) {
      return (
        <main className="page-shell">
          <section className="dashboard-card">
            <p className="eyebrow">ACCOUNT DISABLED</p>
            <h1>Access unavailable</h1>
            <p>Contact your system administrator for assistance.</p>
            <button className="primary-button" onClick={handleLogout}>
              Sign out
            </button>
          </section>
        </main>
      );
    }

    const details = roleDetails[profile.role];

    return (
      <main className="dashboard-shell">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">B+</span>
            <span>BloodBridge <span className="brand-ai">AI</span></span>
          </a>
          <button className="secondary-button" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <section className="welcome-section">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Welcome, {profile.full_name}</h1>
          <p className="muted">
            Your account is signed in to BloodBridge AI.
          </p>
        </section>

        {profile.role === "admin" || profile.role === "staff" ? (
          <>
            <Inventory canManage />
            <BloodRequests canManage />
            <RequestMatching />
            <DonorManagement />
            <DonorCooldown />
          </>
        ) : (
          <section className="dashboard-grid">
            <article className="dashboard-card role-card">
              <span className="role-label">
                {profile.role.toUpperCase()}
              </span>
              <h2>{details.title}</h2>
              <p>{details.description}</p>
              <div className="coming-soon">
                <span className="status-dot" />
                Dashboard foundation ready
              </div>
            </article>

            <article className="dashboard-card account-card">
              <h2>Account details</h2>
              <div className="detail-row">
                <span>Name</span>
                <strong>{profile.full_name}</strong>
              </div>
              <div className="detail-row">
                <span>Email</span>
                <strong>{profile.email}</strong>
              </div>
              <div className="detail-row">
                <span>Role</span>
                <strong>{profile.role}</strong>
              </div>
              <div className="detail-row">
                <span>Account status</span>
                <strong>Active</strong>
              </div>
            </article>
          </section>
        )}

        <p className="disclaimer">
          BloodBridge AI supports operational coordination. Blood
          compatibility and transfusion decisions must follow approved
          clinical protocols and qualified professional review.
        </p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="auth-layout">
        <div className="intro-panel">
          <a className="brand brand-light" href="/">
            <span className="brand-mark">B+</span>
            <span>BloodBridge <span className="brand-ai">AI</span></span>
          </a>

          <div className="intro-copy">
            <p className="eyebrow">INTELLIGENT BLOOD BANK COORDINATION</p>
            <h1>Connecting blood supply to urgent needs.</h1>
            <p>
              A unified platform for blood-bank operations, donor
              coordination, hospital requests, and inventory visibility.
            </p>
          </div>

          <div className="feature-list">
            <div><span>01</span> Inventory and expiry tracking</div>
            <div><span>02</span> Emergency request coordination</div>
            <div><span>03</span> Role-based workspaces</div>
          </div>
          <p className="intro-footer">A responsible approach to smarter coordination.</p>
        </div>

        <div className="auth-panel">
          <div className="auth-card">
            <p className="eyebrow">WELCOME TO BLOODBRIDGE</p>
            <h2>{mode === "login" ? "Sign in" : "Create your account"}</h2>
            <p className="muted">
              {mode === "login"
                ? "Enter your details to access your workspace."
                : "Register to get started as a donor."}
            </p>

            <div className="mode-switch">
              <button
                type="button"
                className={mode === "login" ? "mode-active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === "register" ? "mode-active" : ""}
                onClick={() => {
                  setMode("register");
                  setError("");
                  setMessage("");
                }}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {mode === "register" && (
                <label>
                  Full name
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter your full name"
                    required
                    maxLength={100}
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </label>

              {error && <p className="error-message">{error}</p>}
              {message && <p className="success-message">{message}</p>}

              <button
                type="submit"
                className="primary-button"
                disabled={submitting}
              >
                {submitting
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign in to BloodBridge"
                    : "Create donor account"}
              </button>
            </form>

            <p className="security-note">
              Registration creates a donor account by default. Other roles
              require authorized assignment.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;