"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/ai";

type Part = ChatMessage["parts"][number];

function ToolBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">{children}</div>;
}

function PlanNightTool({ part }: { part: Extract<Part, { type: "tool-planNight" }> }) {
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">⚠️ planNight: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">🌌 ranking targets…</span></ToolBox>;
  const p = part.output;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">
        🌌 planNight · {p.dark_hours}h dark · moon {Math.round(p.moon_illumination * 100)}% · Bortle {p.bortle}
      </div>
      <ul className="mt-1 space-y-0.5">
        {p.targets.slice(0, 5).map((t) => (
          <li key={t.name} className="flex items-center gap-2">
            <Badge variant={t.rating}>{t.rating}</Badge>
            <span className="font-medium">{t.common_name}</span>
            <span className="text-muted-foreground font-mono">{t.score}</span>
          </li>
        ))}
      </ul>
    </ToolBox>
  );
}

function TargetDetailTool({ part }: { part: Extract<Part, { type: "tool-getTargetDetail" }> }) {
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">⚠️ getTargetDetail: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">🔭 checking {part.input?.name ?? "…"}…</span></ToolBox>;
  const t = part.output;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">🔭 getTargetDetail · {t.common_name}</div>
      <div className="mt-0.5 flex items-center gap-2">
        <Badge variant={t.rating}>{t.rating}</Badge>
        peak {t.peak_altitude_deg}° · up {t.hours_visible}h · moon sep {t.moon_separation_deg}° ·{" "}
        <span className="font-mono">score {t.score}</span>
      </div>
    </ToolBox>
  );
}

function KnowledgeTool({ part }: { part: Extract<Part, { type: "tool-searchKnowledge" }> }) {
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">⚠️ searchKnowledge: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">📚 searching literature for “{part.input?.query ?? "…"}”…</span></ToolBox>;
  const passages = part.output;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">📚 searchKnowledge · {passages.length} sources</div>
      {passages.length === 0 ? (
        <div className="text-muted-foreground mt-1">No matching passages.</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {passages.map((p, i) => (
            <li key={i} className="border-l-2 pl-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.title ?? p.bibcode ?? "Untitled"}</span>
                <span className="text-muted-foreground font-mono">{p.similarity.toFixed(2)}</span>
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground underline">
                  {p.bibcode ?? p.source}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </ToolBox>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat<ChatMessage>();
  const [input, setInput] = useState("");

  function submit() {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <main className="mx-auto flex h-dvh max-w-xl flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">AstroScout copilot</h1>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-muted-foreground font-medium">
              {m.role === "user" ? "You" : "AstroScout"}:{" "}
            </span>
            {m.parts.map((part, i) => {
              if (part.type === "text") return <span key={i}>{part.text}</span>;
              if (part.type === "tool-planNight") return <PlanNightTool key={i} part={part} />;
              if (part.type === "tool-getTargetDetail") return <TargetDetailTool key={i} part={part} />;
              if (part.type === "tool-searchKnowledge") return <KnowledgeTool key={i} part={part} />;
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <p className="text-muted-foreground text-sm">Thinking…</p>}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Why is the Orion Nebula a good target, and what's the science?"
        />
        <Button onClick={submit} disabled={status !== "ready"}>
          Send
        </Button>
      </div>
    </main>
  );
}
