import { AppShell } from "@/components/shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell admin>{children}</AppShell>;
}
