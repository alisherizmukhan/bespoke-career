import { AuthLayout, RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create account" };
export default function Page() {
  return (
    <AuthLayout title="Create your account" subtitle="Free forever plan. Takes about two minutes.">
      <RegisterForm />
    </AuthLayout>
  );
}
