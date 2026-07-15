"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/ai";
import {
  formatObserverContext,
  readObserverContext,
  writeObserverContext,
  type ObserverContext,
} from "@/lib/observer-context";

type Part = ChatMessage["parts"][number];

const AUCKLAND_CONTEXT: ObserverContext = {
  lat: -36.85,
  lon: 174.76,
  source: "manual",
  label: "Auckland starter",
};

function ToolBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">{children}</div>;
}

function PlanNightTool({ part }: { part?: Extract<Part, { type: "tool-planNight" }> }) {
  if (!part?.state) return null;
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">planNight error: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">planNight · ranking targets…</span></ToolBox>;
  if (part.output.status === "location_required") {
    return (
      <ToolBox>
        <div className="font-mono text-amber-300">planNight · location required</div>
        <div className="text-muted-foreground mt-1">No trusted observer coordinates were used.</div>
      </ToolBox>
    );
  }
  const { plan: p, observer } = part.output;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">
        planNight · {p.dark_hours}h dark · moon {Math.round(p.moon_illumination * 100)}% · Bortle {p.bortle}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-sky-300">
        observer {formatObserverContext(observer)}
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

function TargetDetailTool({ part }: { part?: Extract<Part, { type: "tool-getTargetDetail" }> }) {
  if (!part?.state) return null;
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">getTargetDetail error: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">getTargetDetail · checking {part.input?.name ?? "…"}…</span></ToolBox>;
  if (part.output.status === "location_required") {
    return (
      <ToolBox>
        <div className="font-mono text-amber-300">getTargetDetail · location required</div>
        <div className="text-muted-foreground mt-1">No trusted observer coordinates were used.</div>
      </ToolBox>
    );
  }
  const { target: t, observer } = part.output;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">getTargetDetail · {t.common_name}</div>
      <div className="mt-0.5 font-mono text-[11px] text-sky-300">
        observer {formatObserverContext(observer)}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <Badge variant={t.rating}>{t.rating}</Badge>
        peak {t.peak_altitude_deg}° · up {t.hours_visible}h · moon sep {t.moon_separation_deg}° ·{" "}
        <span className="font-mono">score {t.score}</span>
      </div>
    </ToolBox>
  );
}

function KnowledgeTool({ part }: { part?: Extract<Part, { type: "tool-searchKnowledge" }> }) {
  if (!part?.state) return null;
  if (part.state === "output-error")
    return <ToolBox><span className="text-destructive">searchKnowledge error: {part.errorText}</span></ToolBox>;
  if (part.state !== "output-available")
    return <ToolBox><span className="text-muted-foreground animate-pulse font-mono">searchKnowledge · searching literature for “{part.input?.query ?? "…"}”…</span></ToolBox>;
  const passages = part.output.passages;
  return (
    <ToolBox>
      <div className="text-muted-foreground font-mono">searchKnowledge · {passages.length} sources</div>
      {passages.length === 0 ? (
        <div className="text-muted-foreground mt-1">No matching passages.</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {passages.map((p, i) => (
            <li key={i} className="border-l-2 pl-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.title ?? "Untitled"}</span>
                <span className="text-muted-foreground font-mono">{p.bibcode ?? "no bibcode"}</span>
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
  const { messages, sendMessage, status, error, regenerate } = useChat<ChatMessage>();
  const [input, setInput] = useState("");
  const [observer, setObserver] = useState<ObserverContext | null>(null);
  const [observerLoaded, setObserverLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const canSend = observerLoaded && (status === "ready" || status === "error");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      setObserver(readObserverContext(window.localStorage));
      setObserverLoaded(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function submit() {
    if (!input.trim() || !canSend) return;
    void sendMessage({ text: input }, { body: { observer } });
    setInput("");
  }

  function sendStarter(text: string, context: ObserverContext | null = observer) {
    if (!canSend) return;
    if (context) writeObserverContext(window.localStorage, context);
    setObserver(context);
    void sendMessage({ text }, { body: { observer: context } });
  }

  const comparisonPrompt = observer
    ? "Compare M31 and M42 for imaging tonight using my saved observer context."
    : "Compare M31 and M42 for imaging tonight; ask me to set observer coordinates first.";

  return (
    <main className="mx-auto flex h-[calc(100dvh-3rem)] max-w-xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">AstroScout copilot</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Plan a night, inspect a target, or explore the cited astronomy literature.
        </p>
      </header>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        {observer ? (
          <>
            <span className="font-medium">Trusted observer:</span>{" "}
            <span className="font-mono text-sky-300">{formatObserverContext(observer)}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-amber-300">No trusted observer location.</span>{" "}
            <Link href="/plan" className="underline underline-offset-2">
              Set coordinates on Plan
            </Link>{" "}
            before requesting location-specific advice.
          </>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2" aria-label="Starter prompts">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal py-2 text-left"
              onClick={() =>
                sendStarter(
                  "What should I observe tonight from Auckland (-36.85, 174.76)?",
                  AUCKLAND_CONTEXT,
                )
              }
              disabled={!canSend}
            >
              What should I observe tonight from Auckland (-36.85, 174.76)?
            </Button>
            {[comparisonPrompt, "Why is the Orion Nebula scientifically interesting?"].map(
              (prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  onClick={() => sendStarter(prompt)}
                  disabled={!canSend}
                >
                  {prompt}
                </Button>
              ),
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-muted-foreground font-medium">
              {m.role === "user" ? "You" : "AstroScout"}:{" "}
            </span>
            {m.parts.map((part, i) => {
              if (!part || typeof part !== "object" || !("type" in part)) return null;
              if (part.type === "text") return <span key={i}>{part.text}</span>;
              if (part.type === "tool-planNight") return <PlanNightTool key={i} part={part} />;
              if (part.type === "tool-getTargetDetail") return <TargetDetailTool key={i} part={part} />;
              if (part.type === "tool-searchKnowledge") return <KnowledgeTool key={i} part={part} />;
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <p className="text-muted-foreground text-sm">Thinking…</p>}
        {error && (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="text-destructive">Something went wrong talking to the model.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void regenerate({ body: { observer } })}
            >
              Retry
            </Button>
          </div>
        )}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Why is the Orion Nebula a good target, and what's the science?"
        />
        <Button onClick={submit} disabled={!canSend}>
          Send
        </Button>
      </div>
    </main>
  );
}
