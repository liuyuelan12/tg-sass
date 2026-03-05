"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  isPaid: boolean;
  isDisabled: boolean;
  trialExpiresAt: string | null;
  createdAt: string;
  _count: {
    tgSessions: number;
    scrapeJobs: number;
    chatJobs: number;
  };
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [extendHours, setExtendHours] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(userId: string, action: string, value?: string) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, value }),
    });
    fetchUsers();
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign Out
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {users.filter((u) => u.isPaid).length}
              </div>
              <div className="text-sm text-muted-foreground">Paid Users</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {users.filter((u) => u.isDisabled).length}
              </div>
              <div className="text-sm text-muted-foreground">Disabled</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border/40"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{user.email}</span>
                        {user.role === "ADMIN" && (
                          <Badge variant="default">Admin</Badge>
                        )}
                        {user.isPaid && <Badge variant="default">Paid</Badge>}
                        {user.isDisabled && (
                          <Badge variant="destructive">Disabled</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Joined: {new Date(user.createdAt).toLocaleDateString()}{" "}
                        | Trial:{" "}
                        {user.trialExpiresAt
                          ? new Date(user.trialExpiresAt).toLocaleString()
                          : "N/A"}{" "}
                        | Sessions: {user._count.tgSessions} | Scrapes:{" "}
                        {user._count.scrapeJobs} | Chats: {user._count.chatJobs}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Input
                          placeholder="hours"
                          className="w-16 h-8 text-xs"
                          value={extendHours[user.id] || ""}
                          onChange={(e) =>
                            setExtendHours((prev) => ({
                              ...prev,
                              [user.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateUser(
                              user.id,
                              "extend",
                              extendHours[user.id] || "3"
                            )
                          }
                        >
                          +Time
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateUser(
                            user.id,
                            user.isPaid ? "unpaid" : "paid"
                          )
                        }
                      >
                        {user.isPaid ? "Remove Paid" : "Mark Paid"}
                      </Button>
                      <Button
                        variant={user.isDisabled ? "outline" : "destructive"}
                        size="sm"
                        onClick={() =>
                          updateUser(
                            user.id,
                            user.isDisabled ? "enable" : "disable"
                          )
                        }
                      >
                        {user.isDisabled ? "Enable" : "Disable"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
