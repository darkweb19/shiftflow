"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { User, Mail, CheckCircle2, XCircle, LogOut, Upload } from "lucide-react";
import type { Profile } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employerEmail, setEmployerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const gmailStatus = searchParams.get("gmail");

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data as Profile);
        setEmployerEmail(data.employer_email ?? "");
      }
    };

    loadProfile();
  }, []);

  const saveEmployerEmail = async () => {
    if (!userId) return;
    setSaving(true);

    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ employer_email: employerEmail })
      .eq("id", userId);

    setProfile((prev) =>
      prev ? { ...prev, employer_email: employerEmail } : prev
    );
    setSaving(false);
  };

  const connectGmail = () => {
    if (!userId) return;
    window.location.href = `${API_URL}/gmail/connect?userId=${userId}`;
  };

  const uploadSchedulePdf = async (file: File | null) => {
    if (!file) return;
    setUploadMessage(null);
    setUploadingPdf(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setUploadMessage({ type: "err", text: "Sign in again to upload." });
        return;
      }
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch(`${API_URL}/schedule/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        shiftsCount?: number;
        code?: string;
      };
      if (!res.ok) {
        if (res.status === 409 && body.code === "duplicate") {
          setUploadMessage({
            type: "err",
            text: "This PDF was already imported. Use a new file or remove the old row in pdfs.",
          });
        } else {
          setUploadMessage({
            type: "err",
            text: body.error ?? `Upload failed (${res.status})`,
          });
        }
        return;
      }
      setUploadMessage({
        type: "ok",
        text: `Imported ${body.shiftsCount ?? 0} shift(s). Open Schedule to view.`,
      });
    } catch {
      setUploadMessage({ type: "err", text: "Network error — try again." });
    } finally {
      setUploadingPdf(false);
    }
  };

  const disconnectGmail = async () => {
    if (!userId) return;
    await fetch(`${API_URL}/gmail/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setProfile((prev) =>
      prev ? { ...prev, gmail_connected: false } : prev
    );
  };

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex flex-col">
      <header className="bg-[#3B6FB6] px-5 pb-5 pt-12 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <h1 className="text-xl font-bold">Settings</h1>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <User className="h-5 w-5" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-5 py-6">
        {gmailStatus === "connected" && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Gmail connected successfully!
          </div>
        )}
        {gmailStatus === "error" && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            <XCircle className="h-4 w-4" />
            Failed to connect Gmail. Please try again.
          </div>
        )}

        {/* Profile Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="text-sm font-medium">{profile?.name ?? "..."}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium">{profile?.email ?? "..."}</p>
            </div>
          </CardContent>
        </Card>

        {/* Employer Email */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Employer Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              The email address your schedule PDFs come from
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="schedules@company.com"
                value={employerEmail}
                onChange={(e) => setEmployerEmail(e.target.value)}
              />
              <Button
                onClick={saveEmployerEmail}
                disabled={saving}
                size="sm"
                className="bg-[#3B6FB6] hover:bg-[#2a5290]"
              >
                {saving ? "..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Manual PDF upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import schedule (PDF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Upload the same weekly schedule PDF you get by email. Shifts appear on your
              dashboard and schedule. Gmail sync below is optional for automatic imports.
            </p>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              disabled={uploadingPdf}
              className="cursor-pointer text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                void uploadSchedulePdf(f ?? null);
                e.target.value = "";
              }}
            />
            {uploadingPdf ? (
              <p className="text-xs text-muted-foreground">Processing PDF…</p>
            ) : null}
            {uploadMessage ? (
              <div
                className={`rounded-lg p-3 text-sm ${
                  uploadMessage.type === "ok"
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {uploadMessage.text}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Gmail Integration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Gmail Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  profile?.gmail_connected ? "bg-green-400" : "bg-gray-300"
                }`}
              />
              <span className="text-sm">
                {profile?.gmail_connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {profile?.gmail_connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={disconnectGmail}
                className="text-red-500 border-red-200 hover:bg-red-50"
              >
                Disconnect Gmail
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={connectGmail}
                className="bg-[#3B6FB6] hover:bg-[#2a5290]"
              >
                Connect Gmail
              </Button>
            )}
          </CardContent>
        </Card>

        <Separator />

        <Button
          variant="ghost"
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </main>
    </div>
  );
}
