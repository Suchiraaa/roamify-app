import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { UserIcon, LockIcon, MailIcon, XIcon, CompassIcon } from "./Icons";

export default function AuthModal() {
  const { authModalOpen, setAuthModalOpen, login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setAuthModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [authModalOpen, setAuthModalOpen]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isRegister) {
        if (!email || !password) {
          throw new Error("Please provide both email and password.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        await register(email, password, name);
      } else {
        if (!email || !password) {
          throw new Error("Please enter your email and password.");
        }
        await login(email, password);
      }
      setEmail("");
      setPassword("");
      setName("");
    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="roamify-modal-backdrop"
      onClick={() => setAuthModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="roamify-modal-card auth-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="roamify-modal-header">
          <div className="roamify-modal-header-left">
            <div className="roamify-modal-icon-badge emerald">
              <CompassIcon size={22} />
            </div>
            <div>
              <h2 id="auth-modal-title" className="roamify-modal-title">
                {isRegister ? "Join Roamify" : "Welcome Back"}
              </h2>
              <p className="roamify-modal-subtitle">
                {isRegister
                  ? "Save your road trips, bookmarks & custom routes"
                  : "Sign in to access your saved journeys & places"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            className="roamify-modal-close-btn"
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="roamify-modal-body">
          {/* Tab switch */}
          <div className="auth-tab-group">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError("");
              }}
              className={`auth-tab-btn ${!isRegister ? "is-active" : ""}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError("");
              }}
              className={`auth-tab-btn ${isRegister ? "is-active" : ""}`}
            >
              Create Account
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="auth-error-banner" role="alert">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {isRegister && (
              <div className="auth-field-group">
                <label className="auth-field-label">
                  Full Name
                </label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">
                    <UserIcon size={16} />
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Traveler"
                    className="auth-input"
                  />
                </div>
              </div>
            )}

            <div className="auth-field-group">
              <label className="auth-field-label">
                Email Address
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <MailIcon size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label className="auth-field-label">
                Password
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <LockIcon size={16} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? "At least 6 characters" : "••••••••"}
                  className="auth-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-submit-btn"
            >
              {isSubmitting ? (
                <span className="btn-spinner" />
              ) : isRegister ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <div className="roamify-modal-footer" style={{ justifyContent: "center" }}>
          Protected with Argon2id encryption & secure session cookies.
        </div>
      </div>
    </div>
  );
}
