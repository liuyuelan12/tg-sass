"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    pageTitle: "Profile Modifier",
    yourSessions: "Your Sessions",
    loading: "Loading...",
    noSessions: "No sessions. Go to Sessions to create one.",
    active: "Active",
    dead: "Dead",
    edit: "Edit",
    delete: "Delete",
    editProfile: "Edit Profile -",
    close: "Close",
    firstName: "First Name",
    lastName: "Last Name",
    username: "Username (without @)",
    newAvatar: "New Avatar",
    profileUpdated: "Profile updated!",
    failedLoad: "Failed to load profile",
    updateFailed: "Update failed",
    error: "Error",
    updating: "Updating...",
    updateProfileBtn: "Update Profile"
  },
  zh: {
    pageTitle: "修改资料",
    yourSessions: "你的 TG 账号",
    loading: "加载中...",
    noSessions: "暂无账号。请前往“账号管理”生成Session。",
    active: "正常",
    dead: "失效",
    edit: "编辑",
    delete: "删除",
    editProfile: "编辑资料 -",
    close: "关闭",
    firstName: "名 (First Name)",
    lastName: "姓 (Last Name)",
    username: "用户名 (不含 @)",
    newAvatar: "新头像",
    profileUpdated: "资料更新成功！",
    failedLoad: "加载资料失败",
    updateFailed: "更新失败",
    error: "错误",
    updating: "更新中...",
    updateProfileBtn: "更新资料"
  }
};

interface TgSession {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
}

interface EditState {
  sessionId: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarFile: File | null;
  loading: boolean;
  message: string;
}

export default function ProfileModifierPage() {
  const { lang, mounted } = useLanguage();
  const t = translations[lang];

  const [sessions, setSessions] = useState<TgSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/telegram/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function openEdit(sessionId: string) {
    setLoadingProfileId(sessionId);
    try {
      const res = await fetch(`/api/telegram/profile?sessionId=${sessionId}`);
      if (!res.ok) {
        const text = await res.text();
        let msg = t.failedLoad;
        try { msg = JSON.parse(text).error || msg; } catch { }
        throw new Error(msg);
      }
      const data = await res.json();
      setEditState({
        sessionId,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        username: data.username || "",
        avatarFile: null,
        loading: false,
        message: "",
      });
    } catch (err) {
      setEditState({
        sessionId,
        firstName: "",
        lastName: "",
        username: "",
        avatarFile: null,
        loading: false,
        message: err instanceof Error ? err.message : t.failedLoad,
      });
    } finally {
      setLoadingProfileId(null);
    }
  }

  async function handleUpdate() {
    if (!editState) return;
    setEditState({ ...editState, loading: true, message: "" });

    try {
      const formData = new FormData();
      formData.append("sessionId", editState.sessionId);
      formData.append("firstName", editState.firstName);
      formData.append("lastName", editState.lastName);
      formData.append("username", editState.username);
      if (editState.avatarFile) {
        formData.append("avatar", editState.avatarFile);
      }

      const res = await fetch("/api/telegram/profile", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = t.updateFailed;
        try { msg = JSON.parse(text).error || msg; } catch { }
        throw new Error(msg);
      }

      // Update session label in local state
      const newLabel = [editState.firstName, editState.lastName].filter(Boolean).join(" ")
        + (editState.username ? ` @${editState.username}` : "");
      setSessions((prev) =>
        prev.map((s) => (s.id === editState.sessionId ? { ...s, label: newLabel } : s))
      );

      setEditState({ ...editState, loading: false, message: t.profileUpdated });
    } catch (err) {
      setEditState({
        ...editState,
        loading: false,
        message: err instanceof Error ? err.message : t.error,
      });
    }
  }

  async function deleteSession(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/telegram/sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (editState?.sessionId === id) {
          setEditState(null);
        }
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t.pageTitle}</h1>

      {/* Session List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t.yourSessions} ({sessions.length})</h2>

        {loading ? (
          <p className="text-muted-foreground text-sm">{t.loading}</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.noSessions}</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card
                key={s.id}
                className={`bg-card/50 ${editState?.sessionId === s.id ? "ring-1 ring-blue-500" : ""}`}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.isActive ? "default" : "destructive"}>
                      {s.isActive ? t.active : t.dead}
                    </Badge>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(s.id)}
                      disabled={!s.isActive || loadingProfileId === s.id}
                    >
                      {loadingProfileId === s.id ? t.loading : t.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSession(s.id)}
                      disabled={deletingId === s.id}
                    >
                      {deletingId === s.id ? "..." : t.delete}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Panel */}
      {editState && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {t.editProfile} {sessions.find((s) => s.id === editState.sessionId)?.label}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditState(null)}>
                {t.close}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.firstName}</Label>
                <Input
                  value={editState.firstName}
                  onChange={(e) =>
                    setEditState({ ...editState, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t.lastName}</Label>
                <Input
                  value={editState.lastName}
                  onChange={(e) =>
                    setEditState({ ...editState, lastName: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.username}</Label>
              <Input
                value={editState.username}
                onChange={(e) =>
                  setEditState({ ...editState, username: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t.newAvatar}</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setEditState({
                    ...editState,
                    avatarFile: e.target.files?.[0] || null,
                  })
                }
              />
            </div>

            {editState.message && (
              <div
                className={`text-sm ${editState.message.includes("update") || editState.message.includes("更新成功")
                  ? "text-green-400"
                  : "text-destructive"
                  }`}
              >
                {editState.message}
              </div>
            )}

            <Button
              onClick={handleUpdate}
              disabled={editState.loading}
            >
              {editState.loading ? t.updating : t.updateProfileBtn}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
