import { Suspense } from "react";
import { AuthLayout, LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Log in" };
export default function Page() {
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue your search.">
      <Suspense><LoginForm /></Suspense>
    </AuthLayout>
  );
}
