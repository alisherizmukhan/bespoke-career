"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Field, InlineError, Input, PageHeader } from "@/components/ui";
import { api, setToken } from "@/lib/api";

export default function Settings() {
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => api("/account/preferences") });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [delPw, setDelPw] = useState("");
  const changePw = useMutation({
    mutationFn: () => api("/auth/change-password", { body: pw }),
    // Changing the password signs out every other device; this one keeps working with the fresh token
    onSuccess: (r: any) => { if (r?.access_token) setToken(r.access_token); setPw({ current_password: "", new_password: "" }); },
  });
  const setAi = useMutation({ mutationFn: (v: boolean) => api("/account/preferences", { method: "PATCH", body: { ai_consent: v } }), onSuccess: () => prefs.refetch() });
  const exportData = useMutation({
    mutationFn: async () => {
      const d = await api("/account/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
      a.download = "bespoke-data-export.json";
      a.click();
    },
  });
  const del = useMutation({ mutationFn: () => api("/account/delete", { body: { password: delPw } }), onSuccess: () => { setToken(null); window.location.href = "/"; } });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Security, privacy and your data." />
      <div className="space-y-5">
        <Card>
          <h2 className="mb-4 font-medium">Password</h2>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}>
            <Field label="Current password" id="cp"><Input id="cp" type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" id="np" hint="8+ characters, letters and numbers"><Input id="np" type="password" required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" loading={changePw.isPending}>Update password</Button>{changePw.isSuccess && <span className="text-sm text-success">Password updated.</span>}</div>
            <div className="sm:col-span-2"><InlineError error={changePw.error} /></div>
          </form>
        </Card>
        <Card>
          <h2 className="font-medium">AI processing</h2>
          <p className="mt-1 text-sm text-ink-muted">When on, the relevant parts of your profile, resumes and applications are sent to our AI provider (OpenAI) to generate answers. When off, the assistant uses rule-based answers only.</p>
          <label className="mt-4 flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-violet-600" checked={!!prefs.data?.ai_consent} disabled={prefs.isLoading || setAi.isPending} onChange={(e) => setAi.mutate(e.target.checked)} />
            Allow AI processing of my career data
          </label>
        </Card>
        <Card>
          <h2 className="font-medium">Export your data</h2>
          <p className="mt-1 text-sm text-ink-muted">Download your profile, resumes, applications, interviews, salary estimates and assistant messages as JSON.</p>
          <Button className="mt-4" variant="secondary" loading={exportData.isPending} onClick={() => exportData.mutate()}>Download my data</Button>
        </Card>
        <Card className="border-danger-soft">
          <h2 className="font-medium text-danger">Delete account</h2>
          <p className="mt-1 text-sm text-ink-muted">Permanently deletes your profile, resumes, uploaded files, applications and conversations. This cannot be undone.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input type="password" placeholder="Confirm with your password" value={delPw} onChange={(e) => setDelPw(e.target.value)} className="sm:max-w-xs" aria-label="Password" />
            <Button variant="danger" disabled={!delPw} loading={del.isPending} onClick={() => confirm("Delete your account permanently?") && del.mutate()}>Delete my account</Button>
          </div>
          <div className="mt-2"><InlineError error={del.error} /></div>
        </Card>
      </div>
    </div>
  );
}
