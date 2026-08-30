"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { BACKEND_API_URL, backendRequest } from "@/lib/backend-api";

export type AuthUser = {
  id: number;
  username: string;
  avatarPreset: string;
  hasCustomAvatar: boolean;
  avatarVersion: number;
};

type AuthContextValue = {
  isLoading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateAvatarPreset: (preset: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function getAvatarImageUrl(user: AuthUser) {
  return `${BACKEND_API_URL}/api/auth/avatar/image?v=${user.avatarVersion}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const currentUser = await backendRequest<AuthUser>("/api/auth/me", { method: "GET" });
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    user,
    async login(username, password) {
      const result = await backendRequest<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUser(result.user);
    },
    async register(username, password, confirmPassword) {
      await backendRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, confirmPassword }),
      });
    },
    async logout() {
      try {
        await backendRequest("/api/auth/logout", { method: "POST" });
      } finally {
        setUser(null);
      }
    },
    async updateAvatarPreset(preset) {
      const updatedUser = await backendRequest<AuthUser>("/api/auth/avatar/preset", {
        method: "PUT",
        body: JSON.stringify({ preset }),
      });
      setUser(updatedUser);
    },
    async uploadAvatar(file) {
      const formData = new FormData();
      formData.append("file", file);
      const updatedUser = await backendRequest<AuthUser>("/api/auth/avatar/upload", {
        method: "POST",
        body: formData,
      });
      setUser(updatedUser);
    },
    refresh,
  }), [isLoading, refresh, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
