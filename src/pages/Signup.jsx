import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        // Email confirmation required
        setSuccess(true);
      } else if (data.session) {
        // Auto-confirmed (e.g., in development or disabled confirmation)
        navigate(createPageUrl("BuyerProfile"), { replace: true });
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Show success message if email confirmation is required
  if (success) {
    return (
      <div>
        <h1>Check Your Email</h1>
        <p>
          We've sent a confirmation link to <strong>{email}</strong>.
        </p>
        <p>Please check your inbox and click the link to activate your account.</p>
        <br />
        <button onClick={() => navigate(createPageUrl("Login"))}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Create Account</h1>
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
            minLength={6}
          />
        </div>
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <br />
      <p>
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => navigate(createPageUrl("Login"))}
          style={{
            background: "none",
            border: "none",
            color: "blue",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Log in
        </button>
      </p>
    </div>
  );
}

