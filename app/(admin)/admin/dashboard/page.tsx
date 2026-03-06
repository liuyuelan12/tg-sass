"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";

const translations = {
  en: {
    title: "Admin Dashboard",
    signOut: "Sign Out",
    totalUsers: "Total Users",
    paidUsers: "Paid Users",
    disabledUsers: "Disabled",
    usersTitle: "Users",
    loading: "Loading...",
    adminBadge: "Admin",
    paidBadge: "Paid",
    disabledBadge: "Disabled",
    joined: "Joined",
    trial: "Trial",
    sessions: "Sessions",
    scrapes: "Scrapes",
    chats: "Chats",
    hoursPlaceholder: "hours",
    addTime: "+Time",
    removePaid: "Remove Paid",
    markPaid: "Mark Paid",
    enable: "Enable",
    disable: "Disable",
    na: "N/A"
  },
  zh: {
    title: "大师兄控制台",
    signOut: "退出登录",
    totalUsers: "总用户数",
    paidUsers: "已付费用户",
    disabledUsers: "已禁用",
    usersTitle: "用户列表",
    loading: "加载中...",
    adminBadge: "管理员",
    paidBadge: "已付费",
    disabledBadge: "已禁用",
    joined: "加入时间",
    trial: "试用周期",
    sessions: "会话数",
    scrapes: "采集数",
    chats: "自动回复",
    hoursPlaceholder: "小时",
    addTime: "+时长",
    removePaid: "取消付费",
    markPaid: "标记付费",
    enable: "启用",
    disable: "禁用",
    na: "无"
  }
};

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
  const { lang, mounted } = useLanguage();

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

  if (!mounted) return null;
  const t = translations[lang];

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            {t.signOut}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-sm text-muted-foreground">{t.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {users.filter((u) => u.isPaid).length}
              </div>
              <div className="text-sm text-muted-foreground">{t.paidUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {users.filter((u) => u.isDisabled).length}
              </div>
              <div className="text-sm text-muted-foreground">{t.disabledUsers}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.usersTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">{t.loading}</p>
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
                          <Badge variant="default">{t.adminBadge}</Badge>
                        )}
                        {user.isPaid && <Badge variant="default">{t.paidBadge}</Badge>}
                        {user.isDisabled && (
                          <Badge variant="destructive">{t.disabledBadge}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.joined}: {new Date(user.createdAt).toLocaleDateString()}{" "}
                        | {t.trial}:{" "}
                        {user.trialExpiresAt
                          ? new Date(user.trialExpiresAt).toLocaleString()
                          : t.na}{" "}
                        | {t.sessions}: {user._count.tgSessions} | {t.scrapes}:{" "}
                        {user._count.scrapeJobs} | {t.chats}: {user._count.chatJobs}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Input
                          placeholder={t.hoursPlaceholder}
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
                          {t.addTime}
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
                        {user.isPaid ? t.removePaid : t.markPaid}
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
                        {user.isDisabled ? t.enable : t.disable}
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

