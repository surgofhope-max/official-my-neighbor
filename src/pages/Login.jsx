import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/supabaseClient";
import { createPageUrl } from "@/utils";

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 DEV ONLY: Temporary SUPER_ADMIN grant helper — REMOVE BEFORE PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════
// @ts-ignore - Vite env vars
const IS_DEV = import.meta.env?.DEV || import.meta.env?.MODE === "development";

async function grantSuperAdminRole() {
  if (!IS_DEV) {
    console.error("❌ Super Admin grant blocked: Not in development mode");
    return { success: false, error: "Not in development mode" };
  }

  try {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error("❌ No active session — login first");
      return { success: false, error: "Not logged in" };
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔐 DEV: Granting SUPER_ADMIN role to:", session.user.email);

    // Update user metadata to include super_admin role
    const { data, error } = await supabase.auth.updateUser({
      data: { role: "super_admin" }
    });

    if (error) {
      console.error("❌ Failed to update user:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ SUPER_ADMIN role granted!");
    console.log("   User ID:", data.user.id);
    console.log("   Email:", data.user.email);
    console.log("   user_metadata.role:", data.user.user_metadata?.role);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Force refresh session to pick up new metadata
    await supabase.auth.refreshSession();

    // Verify
    const { data: { user: refreshedUser } } = await supabase.auth.getUser();
    const isNowSuperAdmin = refreshedUser?.user_metadata?.role === "super_admin";
    console.log("🔍 Verification: isSuperAdmin() would return:", isNowSuperAdmin);

    return { success: true, user: refreshedUser };

  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}
// ═══════════════════════════════════════════════════════════════════════════

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [devMessage, setDevMessage] = useState(null);

  // DEV ONLY: Super Admin grant handler
  const handleDevGrantSuperAdmin = async () => {
    setDevMessage("Granting SUPER_ADMIN role...");
    const result = await grantSuperAdminRole();
    if (result.success) {
      setDevMessage(`✅ SUPER_ADMIN granted to ${result.user.email}. Refresh page to verify.`);
    } else {
      setDevMessage(`❌ Failed: ${result.error}`);
    }
  };

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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 🔐 DEV ONLY: SUPER_ADMIN grant button — REMOVE BEFORE PRODUCTION */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {IS_DEV && (
        <div style={{ 
          marginTop: "40px", 
          padding: "16px", 
          border: "2px dashed #dc2626", 
          borderRadius: "8px",
          backgroundColor: "#fef2f2"
        }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: "bold", color: "#991b1b" }}>
            🔐 DEV ONLY — SUPER_ADMIN Test Helper
          </p>
          <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#b91c1c" }}>
            Login first, then click to grant SUPER_ADMIN role.
            <br />
            SUPER_ADMIN bypasses ALL product gating (onboarding, safety, approval).
          </p>
          <button 
            type="button"
            onClick={handleDevGrantSuperAdmin}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              padding: "8px 16px",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Grant SUPER_ADMIN Role (DEV)
          </button>
          {devMessage && (
            <p style={{ marginTop: "8px", fontSize: "12px", color: "#374151" }}>
              {devMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}







