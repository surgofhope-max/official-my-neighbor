import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        // Login successful - check for stored return URL (e.g., from BUY NOW click)
        const returnUrl = sessionStorage.getItem("login_return_url");
        if (returnUrl) {
          sessionStorage.removeItem("login_return_url");
          // Use window.location for full page navigation to preserve query params
          window.location.href = returnUrl;
          return;
        }
        // No return URL - default navigation handled by auth state change
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <p style={{ marginTop: "16px" }}>
        Don't have an account?{" "}
        <button
          type="button"
          onClick={() => navigate(createPageUrl("Signup"))}
          style={{
            background: "none",
            border: "none",
            color: "#2563eb",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            font: "inherit"
          }}
        >
          Sign up
        </button>
      </p>
    </div>
  );
}
