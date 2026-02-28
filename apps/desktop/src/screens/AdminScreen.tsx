import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

interface UserRow {
  id: string;
  email: string;
  role: string;
}

export const AdminScreen: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "user">("user");
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (typeof window.tradingApp?.invoke !== "function" || !currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.tradingApp.invoke("auth:users", { adminUserId: currentUser.id });
      if (!res.ok) {
        setError(res.error ?? "Failed to load users.");
        return;
      }
      const data = res.data as { users: UserRow[] };
      setUsers(data.users ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAddUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentUser || typeof window.tradingApp?.invoke !== "function") return;
      setError(null);
      if (!addEmail.trim()) {
        setError("Email is required.");
        return;
      }
      if (addPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      setAddLoading(true);
      try {
        const res = await window.tradingApp.invoke("auth:userAdd", {
          adminUserId: currentUser.id,
          email: addEmail.trim(),
          password: addPassword,
          role: addRole
        });
        if (!res.ok) {
          setError(res.error ?? "Failed to add user.");
          return;
        }
        setAddEmail("");
        setAddPassword("");
        setAddRole("user");
        await loadUsers();
      } catch (err) {
        setError(String(err));
      } finally {
        setAddLoading(false);
      }
    },
    [currentUser, addEmail, addPassword, addRole, loadUsers]
  );

  const handleRemove = useCallback(
    async (targetId: string) => {
      if (!currentUser || typeof window.tradingApp?.invoke !== "function") return;
      setError(null);
      setRemoveLoadingId(targetId);
      try {
        const res = await window.tradingApp.invoke("auth:userRemove", {
          adminUserId: currentUser.id,
          targetUserId: targetId
        });
        if (!res.ok) {
          setError(res.error ?? "Failed to remove user.");
          return;
        }
        await loadUsers();
      } catch (err) {
        setError(String(err));
      } finally {
        setRemoveLoadingId(null);
      }
    },
    [currentUser, loadUsers]
  );

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div>
        <p style={{ color: "#94a3b8" }}>You do not have permission to view this page.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 320,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    marginBottom: 8
  };

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>User management</h1>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Add or remove users. Only admins can access this page.
      </p>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: "rgba(185, 28, 28, 0.3)",
            color: "#fecaca"
          }}
        >
          {error}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add user</h2>
        <form onSubmit={handleAddUser} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="newuser@example.com"
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              placeholder="Min 8 characters"
              style={inputStyle}
              minLength={8}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Role</label>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as "admin" | "user")}
              style={{ ...inputStyle, marginBottom: 0, minWidth: 100 }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={addLoading}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: addLoading ? "not-allowed" : "pointer",
              fontWeight: 500
            }}
          >
            {addLoading ? "Adding…" : "Add user"}
          </button>
        </form>
      </section>

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Users</h2>
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : (
          <table
            style={{
              width: "100%",
              maxWidth: 560,
              borderCollapse: "collapse",
              border: "1px solid #334155",
              borderRadius: 8,
              overflow: "hidden"
            }}
          >
            <thead>
              <tr style={{ background: "#1e293b" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                  Email
                </th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                  Role
                </th>
                <th style={{ padding: "10px 12px", width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #334155" }}>
                  <td style={{ padding: "10px 12px", color: "#e2e8f0" }}>{u.email}</td>
                  <td style={{ padding: "10px 12px", color: "#94a3b8", textTransform: "capitalize" }}>{u.role}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={() => handleRemove(u.id)}
                        disabled={removeLoadingId === u.id}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          borderRadius: 4,
                          border: "none",
                          background: "rgba(239, 68, 68, 0.2)",
                          color: "#fca5a5",
                          cursor: removeLoadingId === u.id ? "not-allowed" : "pointer"
                        }}
                      >
                        {removeLoadingId === u.id ? "…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
