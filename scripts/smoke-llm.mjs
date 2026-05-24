import { GoogleGenAI } from "@google/genai";
import { Langfuse } from "langfuse";

const required = [
  "GEMINI_API_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "Return a one-line JSON object like {\"ok\":true,\"task\":\"healthlog smoke\"}.";

const model = "gemini-2.5-flash-lite";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

const started = Date.now();
const trace = langfuse.trace({
  name: "healthlog-smoke-llm",
  metadata: { model, source: "npm run smoke:llm" },
});

try {
  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = result.text ?? "";
  trace.generation({
    name: "gemini-smoke",
    model,
    input: prompt,
    output: text,
    metadata: { latencyMs: Date.now() - started },
  });

  await langfuse.flushAsync();
  console.log(text);
  console.log(`Langfuse trace: healthlog-smoke-llm`);
} catch (error) {
  await langfuse.flushAsync();
  console.error(error);
  process.exit(1);
}
