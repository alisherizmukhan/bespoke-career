"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field, InlineError, Input, Logo } from "./ui";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <h1 className="h-display text-[32px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-b from-lavender-100 to-violet-200 lg:block">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="max-w-md">
            <span className="eyebrow">Your career, thoughtfully built</span>
            <p className="h-display mt-6 text-[40px] leading-[1.05]">Resumes, salary data and jobs — <span className="text-violet-600">connected.</span></p>
            <ul className="mt-8 space-y-3 text-[15px] text-ink/80">
              <li>• Profession-aware resumes that never invent facts</li>
              <li>• Salary ranges from live postings with disclosed pay</li>
              <li>• An AI assistant grounded in your own search</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().email("Enter a valid email address."), password: z.string().min(1, "Enter your password.") });

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [err, setErr] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setErr(null);
    try {
      const r = await api("/auth/login", { body: v });
      signIn(r.access_token, r.user);
      const next = sp.get("next");
      router.push(next && next.startsWith("/") ? next : r.user.role === "admin" ? "/admin" : r.user.onboarding_completed ? "/app" : "/app/onboarding");
    } catch (e) {
      setErr(e);
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {sp.get("expired") && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Your session expired. Sign in again.</p>}
      <Field label="Email" id="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} /></Field>
      <Field label="Password" id="password" error={errors.password?.message}><Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register("password")} /></Field>
      <div className="text-right"><Link href="/forgot-password" className="link text-sm">Forgot password?</Link></div>
      <InlineError error={err} />
      <Button type="submit" loading={isSubmitting} className="w-full" size="lg">Log in</Button>
      <p className="text-center text-sm text-ink-muted">New to Bespoke? <Link href="/register" className="link font-semibold">Create an account</Link></p>
    </form>
  );
}

const regSchema = z.object({
  full_name: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").regex(/[A-Za-z]/, "Add at least one letter.").regex(/\d/, "Add at least one number."),
  accept_terms: z.literal(true, { errorMap: () => ({ message: "Accept the Terms and Privacy Policy to continue." }) }),
});

export function RegisterForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [err, setErr] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setErr(null);
    try {
      const r = await api("/auth/register", { body: v });
      signIn(r.access_token, r.user);
      if (r.dev_verification_url) sessionStorage.setItem("bespoke_verify", r.dev_verification_url);
      router.push("/verify-email?sent=1");
    } catch (e) {
      setErr(e);
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Full name" id="name" error={errors.full_name?.message}><Input id="name" autoComplete="name" invalid={!!errors.full_name} {...register("full_name")} /></Field>
      <Field label="Email" id="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} /></Field>
      <Field label="Password" id="password" error={errors.password?.message} hint="At least 8 characters with letters and numbers.">
        <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register("password")} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-ink-muted">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" {...register("accept_terms")} />
        <span>I agree to the <Link href="/terms" className="link">Terms of Service</Link> and <Link href="/privacy" className="link">Privacy Policy</Link>.</span>
      </label>
      {errors.accept_terms && <p className="text-xs font-medium text-danger">{errors.accept_terms.message}</p>}
      <InlineError error={err} />
      <Button type="submit" loading={isSubmitting} className="w-full" size="lg">Create free account</Button>
      <p className="text-center text-sm text-ink-muted">Already have an account? <Link href="/login" className="link font-semibold">Log in</Link></p>
    </form>
  );
}
