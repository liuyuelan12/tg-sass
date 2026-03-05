"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      if (!res.ok) throw new Error("Failed to load profile");
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
        message: err instanceof Error ? err.message : "Failed to load profile",
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
        const data = await res.json();
        throw new Error(data.error || "Update failed");
      }

      // Update session label in local state
      const newLabel = [editState.firstName, editState.lastName].filter(Boolean).join(" ")
        + (editState.username ? ` @${editState.username}` : "");
      setSessions((prev) =>
        prev.map((s) => (s.id === editState.sessionId ? { ...s, label: newLabel } : s))
      );

      setEditState({ ...editState, loading: false, message: "Profile updated!" });
    } catch (err) {
      setEditState({
        ...editState,
        loading: false,
        message: err instanceof Error ? err.message : "Error",
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

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Profile Modifier</h1>

      {/* Session List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your Sessions ({sessions.length})</h2>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sessions. Go to Sessions to create one.</p>
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
                      {s.isActive ? "Active" : "Dead"}
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
                      {loadingProfileId === s.id ? "Loading..." : "Edit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSession(s.id)}
                      disabled={deletingId === s.id}
                    >
                      {deletingId === s.id ? "..." : "Delete"}
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
                Edit Profile - {sessions.find((s) => s.id === editState.sessionId)?.label}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditState(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={editState.firstName}
                  onChange={(e) =>
                    setEditState({ ...editState, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={editState.lastName}
                  onChange={(e) =>
                    setEditState({ ...editState, lastName: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Username (without @)</Label>
              <Input
                value={editState.username}
                onChange={(e) =>
                  setEditState({ ...editState, username: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>New Avatar</Label>
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
                className={`text-sm ${
                  editState.message.includes("updated")
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
              {editState.loading ? "Updating..." : "Update Profile"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
