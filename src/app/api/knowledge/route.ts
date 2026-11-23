import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handleApiError, requireApiContext } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 200_000;

/** Add a knowledge item: text, URL (fetched + cleaned) or uploaded PDF/TXT/MD (stored in Storage + extracted). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireApiContext({ manage: true });
    const type = req.headers.get("content-type") ?? "";

    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError("No file uploaded");
      if (file.size > 20 * 1024 * 1024) throw new ApiError("File is larger than 20 MB");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isText = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith("text/");
      if (!isPdf && !isText) throw new ApiError("Upload a PDF, TXT or Markdown file");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = isPdf ? "pdf" : file.name.toLowerCase().endsWith(".md") ? "md" : "txt";
      const path = `${ctx.workspaceId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await ctx.supabase.storage
        .from("knowledge")
        .upload(path, bytes, { contentType: isPdf ? "application/pdf" : ext === "md" ? "text/markdown" : "text/plain" });
      if (upErr) throw new ApiError(`Upload failed: ${upErr.message}`, 500);

      let content = "";
      let status: "ready" | "failed" = "ready";
      let err: string | null = null;
      try {
        content = isPdf ? await extractPdf(bytes) : new TextDecoder().decode(bytes);
        content = clean(content);
        if (!content) throw new Error("No selectable text found (scanned PDFs need OCR first).");
      } catch (e) {
        status = "failed";
        err = (e as Error).message;
      }
      const title = String(form.get("title") || file.name).slice(0, 200);
      return insert(ctx, { type: isPdf ? "pdf" : "text", title, content_extracted: content.slice(0, MAX_CHARS) || null, file_url: path, size_bytes: file.size, status, error: err });
    }

    const body = (await req.json()) as { type?: string; title?: string; content?: string; url?: string };
    if (body.type === "text") {
      const content = clean(body.content ?? "");
      if (!body.title?.trim() || !content) throw new ApiError("Title and content are required");
      return insert(ctx, { type: "text", title: body.title.trim().slice(0, 200), content_extracted: content.slice(0, MAX_CHARS), size_bytes: content.length, status: "ready" });
    }
    if (body.type === "url") {
      const url = safeUrl(body.url ?? "");
      const { title, text } = await fetchPage(url);
      return insert(ctx, { type: "url", title: (body.title?.trim() || title || url.hostname).slice(0, 200), content_extracted: text.slice(0, MAX_CHARS), file_url: url.toString(), size_bytes: text.length, status: "ready" });
    }
    throw new ApiError("Unknown knowledge type");
  } catch (e) {
    return handleApiError(e);
  }
}

async function insert(ctx: Awaited<ReturnType<typeof requireApiContext>>, row: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.from("knowledge_items").insert({ workspace_id: ctx.workspaceId, ...row }).select("*").single();
  if (error) throw new ApiError(error.message, 500);
  return NextResponse.json({ item: data });
}

async function extractPdf(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function clean(s: string) {
  return s.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function safeUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ApiError("Enter a valid URL starting with https://");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new ApiError("Only http(s) URLs are supported");
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.includes(":")) {
    throw new ApiError("That address is not allowed");
  }
  return u;
}

async function fetchPage(url: URL) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "BotSphereBot/1.0 (+knowledge import)" } }).catch(() => {
    throw new ApiError("Could not reach that URL");
  });
  if (!res.ok) throw new ApiError(`The page returned ${res.status}`);
  const html = (await res.text()).slice(0, 3_000_000);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const text = clean(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"'),
  );
  if (!text) throw new ApiError("No readable text found on that page");
  return { title, text };
}
