// src/auth.js
// Simple local auth for dev: stores users in localStorage under key "st_local_users"
// Stores session in "st_local_session" with { username, token, name, expiresAt }
// Exports: AuthProvider, useAuth, sha256Hex

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const USERS_KEY = "st_local_users";
const SESSION_KEY = "st_local_session";

// safe JSON read/write
function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to parse localStorage", key, e);
    return null;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Failed to write localStorage", key, e);
  }
}
function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function readUsers() {
  return readJson(USERS_KEY) || {};
}
function writeUsers(obj) {
  writeJson(USERS_KEY, obj);
}
function readSession() {
  return readJson(SESSION_KEY);
}
function writeSession(obj) {
  writeJson(SESSION_KEY, obj);
}
function clearSession() {
  removeKey(SESSION_KEY);
}

// SHA-256 helper (browser crypto)
export async function sha256Hex(message) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children, sessionTTL = 1000 * 60 * 60 * 24 * 7 }) {
  const [user, setUser] = useState(null);

  // restore session on init
  useEffect(() => {
    const s = readSession();
    if (s && s.username && s.expiresAt && Date.now() < s.expiresAt) {
      // ensure we have name — if session missing name but users store has it, fill it
      const users = readUsers();
      const storedUser = users[s.username];
      const name = s.name ?? (storedUser && storedUser.name) ?? s.username;
      setUser({ username: s.username, token: s.token, name });
    } else {
      clearSession();
      setUser(null);
    }
  }, []);

  // signup(username=email, password, name)
  const signup = useCallback(
    async (username, password, name) => {
      username = (username || "").trim().toLowerCase();
      name = (name || "").trim();
      if (!username || !password || !name) throw new Error("Name, email and password are required");
      const users = readUsers();
      if (users[username]) throw new Error("User already exists");
      const pwHash = await sha256Hex(password);
      // store with name
      users[username] = { hash: pwHash, name };
      writeUsers(users);

      const token = `${username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const session = { username, token, name, expiresAt: Date.now() + sessionTTL };
      writeSession(session);
      setUser({ username, token, name });
      return { username, token, name };
    },
    [sessionTTL]
  );

  // login(email, password)
  const login = useCallback(
    async (username, password) => {
      username = (username || "").trim().toLowerCase();
      const users = readUsers();
      const stored = users[username];
      if (!stored) throw new Error("User not found");
      const pwHash = await sha256Hex(password);
      if (pwHash !== stored.hash) throw new Error("Invalid credentials");
      const token = `${username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const name = stored.name ?? username;
      const session = { username, token, name, expiresAt: Date.now() + sessionTTL };
      writeSession(session);
      setUser({ username, token, name });
      return { username, token, name };
    },
    [sessionTTL]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signup, login, logout }), [user, signup, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
