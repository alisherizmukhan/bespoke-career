"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type SiteContent = {
  announcement?: { active: boolean; text: string; link: string; link_label: string };
  landing_hero?: { headline: string; subhead: string; cta: string };
  pricing?: { headline: string; subhead: string };
  pricing_faq?: { items: { q: string; a: string }[] };
};

/** Admin-editable public copy. Pages keep their own defaults, so a slow or failed request never blanks the page. */
export function useContent() {
  return useQuery<SiteContent>({ queryKey: ["content"], queryFn: () => api("/content"), staleTime: 60_000, retry: 1 }).data || {};
}
