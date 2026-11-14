"use client";

import { useState } from "react";
import { ChipsInput, INDUSTRIES, PROFILE_TYPES, SENIORITY, ToggleGroup } from "./forms";
import { Field, Input, Select, Textarea } from "./ui";

export type ProfileData = Record<string, any>;

const SKILL_SUGGESTIONS: Record<string, string[]> = {
  technology: ["Python", "JavaScript", "SQL", "AWS", "React", "Docker", "Git", "TypeScript"],
  healthcare: ["Patient care", "EHR", "BLS", "Medication administration", "HIPAA", "Triage"],
  finance: ["Excel", "Financial modeling", "GAAP", "Forecasting", "QuickBooks", "Reconciliation"],
  marketing: ["SEO", "Content strategy", "Google Analytics", "HubSpot", "Copywriting", "Social media"],
  sales: ["Salesforce", "Negotiation", "Lead generation", "Account management", "B2B", "CRM"],
  business: ["Project management", "Stakeholder management", "Excel", "Budgeting", "Agile"],
};

export function ProfileSections({ data, set, sections }: { data: ProfileData; set: (k: string, v: any) => void; sections: ("basics" | "work" | "education" | "goals" | "links")[] }) {
  const [edu, setEdu] = useState(data.education?.[0] || { degree: "", field: "", institution: "", end: "" });
  const setEduField = (k: string, v: string) => {
    const n = { ...edu, [k]: v };
    setEdu(n);
    set("education", n.degree || n.institution ? [n, ...(data.education || []).slice(1)] : []);
  };
  return (
    <div className="space-y-8">
      {sections.includes("basics") && (
        <div className="space-y-5">
          <Field label="Full name" id="fn"><Input id="fn" value={data.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Which best describes you?"><ToggleGroup options={PROFILE_TYPES} value={data.profile_type || "professional"} onChange={(v) => set("profile_type", v)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City or preferred location" id="city" hint="For example: Austin, TX — or Remote"><Input id="city" value={data.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Country" id="country"><Input id="country" value={data.country || "United States"} onChange={(e) => set("country", e.target.value)} /></Field>
          </div>
        </div>
      )}
      {sections.includes("work") && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employment status" id="es">
              <Select id="es" value={data.employment_status || ""} onChange={(e) => set("employment_status", e.target.value)}>
                <option value="">Select…</option>
                {[["employed", "Employed"], ["unemployed", "Looking for work"], ["student", "Student"], ["self_employed", "Self-employed"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Industry" id="ind">
              <Select id="ind" value={data.industry || ""} onChange={(e) => set("industry", e.target.value)}>
                <option value="">Select…</option>
                {INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Current job title" id="ct"><Input id="ct" value={data.current_title || ""} onChange={(e) => set("current_title", e.target.value)} placeholder="e.g. Marketing Coordinator" /></Field>
            <Field label="Occupation" id="occ" hint="Your field, e.g. Registered Nurse, Software Developer"><Input id="occ" value={data.occupation || ""} onChange={(e) => set("occupation", e.target.value)} /></Field>
            <Field label="Years of experience" id="ye"><Input id="ye" type="number" min={0} max={60} step={0.5} value={data.years_experience ?? ""} onChange={(e) => set("years_experience", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          </div>
          <Field label="Level"><ToggleGroup options={SENIORITY} value={data.seniority || ""} onChange={(v) => set("seniority", v)} /></Field>
          <Field label="Previous employers" hint="Press Enter after each one."><ChipsInput value={(data.previous_employers || []).map((x: any) => (typeof x === "string" ? x : x.company)).filter(Boolean)} onChange={(v) => set("previous_employers", v)} placeholder="Company names" /></Field>
        </div>
      )}
      {sections.includes("education") && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Highest degree or diploma" id="deg"><Input id="deg" value={edu.degree} onChange={(e) => setEduField("degree", e.target.value)} placeholder="e.g. B.S., High school diploma" /></Field>
            <Field label="Field of study" id="fos"><Input id="fos" value={edu.field} onChange={(e) => setEduField("field", e.target.value)} /></Field>
            <Field label="School" id="sch"><Input id="sch" value={edu.institution} onChange={(e) => setEduField("institution", e.target.value)} /></Field>
            <Field label="Graduation year" id="gy"><Input id="gy" value={edu.end} onChange={(e) => setEduField("end", e.target.value)} placeholder="2024" /></Field>
          </div>
          <Field label="Skills" hint="Add the skills you can back up with experience.">
            <ChipsInput value={(data.skills || []).map((s: any) => (typeof s === "string" ? s : s.skill))} onChange={(v) => set("skills", v)} placeholder="Type a skill and press Enter" suggestions={SKILL_SUGGESTIONS[data.industry] || SKILL_SUGGESTIONS.business} />
          </Field>
          <Field label="Certifications & licenses"><ChipsInput value={data.certifications || []} onChange={(v) => set("certifications", v)} placeholder="e.g. PMP, RN license (TX)" /></Field>
          <Field label="Achievements" hint="Awards, honors, notable results — only real ones."><ChipsInput value={data.achievements || []} onChange={(v) => set("achievements", v)} placeholder="Add an achievement" /></Field>
        </div>
      )}
      {sections.includes("goals") && (
        <div className="space-y-5">
          <Field label="Target job title" id="tt"><Input id="tt" value={data.target_title || ""} onChange={(e) => set("target_title", e.target.value)} placeholder="The role you want next" /></Field>
          <Field label="Career goals" id="cg"><Textarea id="cg" value={data.career_goals || ""} onChange={(e) => set("career_goals", e.target.value)} placeholder="Where do you want to be in 1–3 years?" /></Field>
          <Field label="Employment type"><ToggleGroup multi options={[{ value: "full-time", label: "Full-time" }, { value: "part-time", label: "Part-time" }, { value: "contract", label: "Contract" }, { value: "internship", label: "Internship" }]} value={data.employment_types || []} onChange={(v) => set("employment_types", v)} /></Field>
          <Field label="Work arrangement"><ToggleGroup multi options={[{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" }]} value={data.work_formats || []} onChange={(v) => set("work_formats", v)} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary from (per year)" id="smin"><Input id="smin" type="number" min={0} value={data.salary_min ?? ""} onChange={(e) => set("salary_min", e.target.value === "" ? null : Number(e.target.value))} placeholder="80000" /></Field>
            <Field label="Salary to (per year)" id="smax"><Input id="smax" type="number" min={0} value={data.salary_max ?? ""} onChange={(e) => set("salary_max", e.target.value === "" ? null : Number(e.target.value))} placeholder="100000" /></Field>
            <Field label="Currency" id="cur"><Select id="cur" value={data.currency || "USD"} onChange={(e) => set("currency", e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option></Select></Field>
          </div>
        </div>
      )}
      {sections.includes("links") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="LinkedIn URL (optional)" id="li"><Input id="li" value={data.linkedin_url || ""} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
          <Field label="Portfolio or website (optional)" id="pf"><Input id="pf" value={data.portfolio_url || ""} onChange={(e) => set("portfolio_url", e.target.value)} /></Field>
        </div>
      )}
    </div>
  );
}

export function toPayload(d: ProfileData) {
  const keys = ["full_name", "profile_type", "country", "city", "employment_status", "industry", "occupation", "current_title", "years_experience",
    "seniority", "education", "career_goals", "target_title", "employment_types", "work_formats", "salary_min", "salary_max", "currency",
    "linkedin_url", "portfolio_url", "certifications", "achievements", "previous_employers", "skills"];
  const out: any = {};
  for (const k of keys) {
    let v = d[k];
    if (v === "" || v === undefined) continue;
    if (k === "skills" && Array.isArray(v)) v = v.map((s: any) => (typeof s === "string" ? s : s.skill));
    if (k === "previous_employers" && Array.isArray(v)) v = v.map((x: any) => (typeof x === "string" ? x : x.company)).filter(Boolean);
    out[k] = v;
  }
  return out;
}
