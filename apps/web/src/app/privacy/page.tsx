export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-12 text-sm leading-6">
      <h1 className="text-2xl font-semibold tracking-tight">Chat privacy</h1>
      <p>
        AstroScout stores a text-only copy of your chat conversation in this browser so it can be
        restored after navigation or reload. It stays in local storage until you use Clear
        conversation or clear this browser&apos;s site data. Tool inputs, tool results, literature
        payloads, and coordinates are not included in chat history. The planner&apos;s trusted
        observer coordinates are stored separately in this browser as observing context.
      </p>
      <p>
        When you send a prompt, the conversation and current observer context are transmitted to
        AstroScout&apos;s server and its configured model, embedding, reranking, and Supabase
        providers to produce the response. Do not enter secrets or sensitive personal data.
      </p>
      <p>
        The server stores content-free usage records for abuse prevention and cost accounting:
        your user id, request time, status, latency, model/backend name, token counts, billing
        units, and estimated cost. It does not store prompt text, response text, or tool payloads
        in those records.
      </p>
      <p>
        Anyone with access to this browser profile may be able to read locally saved conversation
        text. Clear the conversation before leaving a shared device.
      </p>
    </main>
  );
}
