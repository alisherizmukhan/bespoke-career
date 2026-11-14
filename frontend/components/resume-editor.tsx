"use client";

import { Plus, Trash2 } from "lucide-react";
import { ChipsInput } from "./forms";
import { Button, Field, Input, Textarea } from "./ui";

export type ResumeContent = any;

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Section({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <section className="space-y-3 border-t border-line pt-5 first:border-0 first:pt-0">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{title}</h3>{onAdd && <Button type="button" size="sm" variant="soft" onClick={onAdd}><Plus className="h-4 w-4" />Add</Button>}</div>
      {children}
    </section>
  );
}

export function ResumeEditor({ value, onChange }: { value: ResumeContent; onChange: (v: ResumeContent) => void }) {
  const c = { contact: {}, experience: [], education: [], skills: [], certifications: [], projects: [], publications: [], awards: [], volunteering: [], languages: [], extra_sections: [], ...value };
  const set = (k: string, v: any) => onChange({ ...c, [k]: v });
  const setContact = (k: string, v: string) => set("contact", { ...c.contact, [k]: v });
  const setItem = (k: string, i: number, patch: any) => set(k, c[k].map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)));
  const remove = (k: string, i: number) => set(k, c[k].filter((_: any, j: number) => j !== i));
  return (
    <div className="space-y-6">
      <Section title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          {[["full_name", "Full name"], ["email", "Email"], ["phone", "Phone"], ["location", "City, State"], ["linkedin", "LinkedIn"], ["website", "Website / portfolio"]].map(([k, l]) => (
            <Field key={k} label={l} id={`c-${k}`}><Input id={`c-${k}`} value={c.contact[k] || ""} onChange={(e) => setContact(k, e.target.value)} /></Field>
          ))}
        </div>
      </Section>
      <Section title="Headline & summary">
        <Field label="Headline" id="hl"><Input id="hl" value={c.headline || ""} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Registered Nurse — ICU, Telemetry" /></Field>
        <Field label="Summary" id="sm"><Textarea id="sm" value={c.summary || ""} onChange={(e) => set("summary", e.target.value)} /></Field>
      </Section>
      <Section title="Experience" onAdd={() => set("experience", [...c.experience, { title: "", company: "", location: "", start: "", end: "", current: false, bullets: [] }])}>
        {c.experience.map((e: any, i: number) => (
          <div key={i} className="space-y-3 rounded-md border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={e.title} onChange={(x) => setItem("experience", i, { title: x.target.value })} placeholder="Job title" aria-label="Job title" />
              <Input value={e.company} onChange={(x) => setItem("experience", i, { company: x.target.value })} placeholder="Company" aria-label="Company" />
              <Input value={e.location} onChange={(x) => setItem("experience", i, { location: x.target.value })} placeholder="Location" aria-label="Location" />
              <Input value={e.start} onChange={(x) => setItem("experience", i, { start: x.target.value })} placeholder="Start (Mon YYYY)" aria-label="Start" />
              <Input value={e.end} disabled={e.current} onChange={(x) => setItem("experience", i, { end: x.target.value })} placeholder="End" aria-label="End" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet-600" checked={!!e.current} onChange={(x) => setItem("experience", i, { current: x.target.checked })} />Current role</label>
            </div>
            <Textarea value={(e.bullets || []).join("\n")} onChange={(x) => setItem("experience", i, { bullets: lines(x.target.value) })} placeholder="One accomplishment per line" aria-label="Bullets" />
            <Button type="button" size="sm" variant="ghost" onClick={() => remove("experience", i)}><Trash2 className="h-4 w-4" />Remove role</Button>
          </div>
        ))}
      </Section>
      <Section title="Education" onAdd={() => set("education", [...c.education, { degree: "", field: "", institution: "", location: "", start: "", end: "", gpa: "", honors: "" }])}>
        {c.education.map((e: any, i: number) => (
          <div key={i} className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-3">
            <Input value={e.degree} onChange={(x) => setItem("education", i, { degree: x.target.value })} placeholder="Degree" aria-label="Degree" />
            <Input value={e.field} onChange={(x) => setItem("education", i, { field: x.target.value })} placeholder="Field" aria-label="Field" />
            <Input value={e.institution} onChange={(x) => setItem("education", i, { institution: x.target.value })} placeholder="School" aria-label="School" />
            <Input value={e.end} onChange={(x) => setItem("education", i, { end: x.target.value })} placeholder="Graduation year" aria-label="Year" />
            <Input value={e.gpa} onChange={(x) => setItem("education", i, { gpa: x.target.value })} placeholder="GPA (optional)" aria-label="GPA" />
            <Button type="button" size="sm" variant="ghost" onClick={() => remove("education", i)}><Trash2 className="h-4 w-4" />Remove</Button>
          </div>
        ))}
      </Section>
      <Section title="Skills"><ChipsInput value={c.skills} onChange={(v) => set("skills", v)} placeholder="Type a skill and press Enter" /></Section>
      <Section title="Certifications & licenses">
        <Textarea value={c.certifications.map((x: any) => [x.name, x.issuer, x.date].filter(Boolean).join(" | ")).join("\n")}
          onChange={(e) => set("certifications", lines(e.target.value).map((l) => { const [name, issuer = "", date = ""] = l.split("|").map((s) => s.trim()); return { name, issuer, date }; }))}
          placeholder="Name | Issuer | Year — one per line" className="min-h-[80px]" />
      </Section>
      <Section title="Projects" onAdd={() => set("projects", [...c.projects, { name: "", description: "", url: "", bullets: [] }])}>
        {c.projects.map((p: any, i: number) => (
          <div key={i} className="space-y-3 rounded-md border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={p.name} onChange={(x) => setItem("projects", i, { name: x.target.value })} placeholder="Project name" aria-label="Project name" />
              <Input value={p.url} onChange={(x) => setItem("projects", i, { url: x.target.value })} placeholder="Link (optional)" aria-label="Link" />
            </div>
            <Textarea value={p.description} onChange={(x) => setItem("projects", i, { description: x.target.value })} placeholder="Short description" className="min-h-[70px]" aria-label="Description" />
            <Button type="button" size="sm" variant="ghost" onClick={() => remove("projects", i)}><Trash2 className="h-4 w-4" />Remove</Button>
          </div>
        ))}
      </Section>
      {([["awards", "Awards & honors"], ["publications", "Publications"], ["volunteering", "Volunteering & activities"], ["languages", "Languages"]] as const).map(([k, t]) => (
        <Section key={k} title={t}><Textarea value={(c[k] || []).join("\n")} onChange={(e) => set(k, lines(e.target.value))} placeholder="One per line" className="min-h-[70px]" /></Section>
      ))}
    </div>
  );
}
