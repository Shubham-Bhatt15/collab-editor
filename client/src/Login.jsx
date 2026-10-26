import { useState } from "react";
import { api } from "./api.js";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      onAuth(await api(`/${mode}`, { method: "POST", body: form }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
      {mode === "signup" && <input placeholder="Name" value={form.name} onChange={set("name")} />}
      <input placeholder="Email" value={form.email} onChange={set("email")} />
      <input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={set("password")} />
      {error && <p className="error">{error}</p>}
      <button type="submit">{mode === "login" ? "Log in" : "Sign up"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </form>
  );
}