"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send, Sparkles, Trash2 } from "@/components/icons";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button, InlineError, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";

const STARTERS = ["Which jobs should I apply for?", "Which companies haven't responded?", "How can I increase my salary?", "What skills am I missing?", "Prepare me for my next interview.", "What should I focus on this week?"];

function Render({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-•*]|\d+\.)\s/.test(l)))
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j} dangerouslySetInnerHTML={{ __html: fmt(l.replace(/^\s*([-•*]|\d+\.)\s/, "")) }} />)}</ul>;
        return <p key={i} className="whitespace-pre-line" dangerouslySetInnerHTML={{ __html: fmt(block) }} />;
      })}
    </div>
  );
}
function fmt(s: string) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#{1,3}\s+(.*)$/gm, "<b>$1</b>");
}

function Assistant() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [cid, setCid] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const convs = useQuery({ queryKey: ["conversations"], queryFn: () => api("/assistant/conversations") });
  const send = useMutation({
    mutationFn: (m: string) => api("/assistant/messages", { body: { conversation_id: cid, message: m } }),
    onMutate: (m) => setMsgs((x) => [...x, { role: "user", content: m }]),
    onSuccess: (r) => { setCid(r.conversation_id); setMsgs((x) => [...x, { role: "assistant", content: r.message.content }]); qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: () => setMsgs((x) => x.slice(0, -1)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/assistant/conversations/${id}`, { method: "DELETE" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); setCid(null); setMsgs([]); } });
  const open = async (id: string) => { const c = await api(`/assistant/conversations/${id}`); setCid(id); setMsgs(c.messages); };
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, send.isPending]);
  useEffect(() => { const q = sp.get("q"); if (q && !msgs.length && !send.isPending) send.mutate(q); /* eslint-disable-next-line */ }, []);
  const submit = (m: string) => { if (!m.trim() || send.isPending) return; send.mutate(m.trim()); setText(""); };

  return (
    <div className="grid h-[calc(100vh-136px)] min-h-[520px] gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="card hidden flex-col overflow-hidden lg:flex">
        <div className="border-b border-line p-3"><Button variant="soft" size="sm" className="w-full" onClick={() => { setCid(null); setMsgs([]); }}><MessageSquarePlus className="h-4 w-4" />New chat</Button></div>
        <div className="flex-1 overflow-y-auto p-2">
          {(convs.data || []).map((c: any) => (
            <div key={c.id} className={cx("group flex items-center rounded-md", cid === c.id ? "bg-violet-100" : "hover:bg-lavender-50")}>
              <button onClick={() => open(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left"><p className="truncate text-sm font-medium">{c.title}</p><p className="text-[12px] text-ink-muted">{ago(c.updated_at)}</p></button>
              <button onClick={() => del.mutate(c.id)} className="mr-1 hidden rounded p-1 text-ink-muted hover:text-danger group-hover:block" aria-label="Delete conversation"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </aside>
      <section className="card flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {!msgs.length ? (
            <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-violet-600"><Sparkles className="h-7 w-7" /></span>
              <h1 className="h-display mt-4 text-2xl">How can I help with your career?</h1>
              <p className="mt-1 text-sm text-ink-muted">I can see your profile, resumes, applications, interviews and salary estimates — nothing from anyone else's account.</p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => <button key={s} onClick={() => submit(s)} className="rounded-md border border-violet-200 bg-white px-4 py-3 text-left text-sm hover:border-violet-400 hover:bg-lavender-50">{s}</button>)}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {msgs.map((m, i) => (
                <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cx("max-w-[85%] rounded-lg px-4 py-3 text-[15px] leading-6", m.role === "user" ? "rounded-br-sm bg-violet-600 text-white" : "rounded-bl-sm bg-lavender-50 text-ink")}>
                    {m.role === "user" ? m.content : <Render text={m.content} />}
                  </div>
                </div>
              ))}
              {send.isPending && <div className="flex"><div className="rounded-lg bg-lavender-50 px-4 py-3"><span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-violet-300" style={{ animationDelay: `${i * 0.15}s` }} />)}</span></div></div>}
              <div ref={end} />
            </div>
          )}
        </div>
        <div className="border-t border-line p-3 sm:p-4">
          <div className="mx-auto max-w-3xl">
            <InlineError error={send.error} />
            <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="mt-2 flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Ask about your applications, resume, salary or next steps…" aria-label="Message"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }}
                className="max-h-40 min-h-[48px] flex-1 resize-none rounded-md border border-violet-200 px-4 py-3 text-sm focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100" />
              <Button type="submit" size="lg" loading={send.isPending} aria-label="Send"><Send className="h-4 w-4" /></Button>
            </form>
            <p className="mt-2 text-center text-[12px] text-ink-muted">AI answers can be wrong. Check important details before you act on them.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Page() {
  return <Suspense><Assistant /></Suspense>;
}
