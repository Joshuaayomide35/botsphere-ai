import "server-only";
import { env } from "@/lib/env";

/**
 * Evolution API v2 adapter (WhatsApp QR / Baileys).
 * Every channel adapter maps provider payloads onto the unified InboundMessage shape below,
 * so the Inbox, CRM and AI layers never see provider specifics.
 */

export class EvolutionError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

export function evolutionConfigured() {
  return Boolean(env.evolutionUrl() && env.evolutionKey());
}

async function call<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const base = env.evolutionUrl();
  if (!base || !env.evolutionKey()) {
    throw new EvolutionError("Evolution API is not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.");
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", apikey: env.evolutionKey() },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new EvolutionError(`Cannot reach Evolution API at ${base} (${(e as Error).message}). Is the Docker container running?`);
  }
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg = extractError(json) ?? `Evolution API ${method} ${path} failed with ${res.status}`;
    throw new EvolutionError(msg, res.status, json);
  }
  return json as T;
}

function extractError(json: unknown): string | null {
  if (!json || typeof json !== "object") return typeof json === "string" && json ? json : null;
  const j = json as Record<string, unknown>;
  const r = j.response as Record<string, unknown> | undefined;
  const m = r?.message ?? j.message ?? j.error;
  if (Array.isArray(m)) return m.map(String).join("; ");
  return m ? String(m) : null;
}

const enc = encodeURIComponent;

export const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

export function webhookUrlFor(secret: string) {
  return `${env.webhookBaseUrl()}/api/webhooks/evolution?token=${enc(secret)}`;
}

export interface QrResult {
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
}

export type EvoState = "open" | "connecting" | "close" | string;

export const evolution = {
  async instanceExists(instance: string): Promise<boolean> {
    try {
      await call("GET", `/instance/connectionState/${enc(instance)}`);
      return true;
    } catch (e) {
      if (e instanceof EvolutionError && (e.status === 404 || e.status === 400)) return false;
      throw e;
    }
  },

  async createInstance(instance: string, webhookSecret: string) {
    return call<{ qrcode?: QrResult; hash?: unknown }>("POST", "/instance/create", {
      instanceName: instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
      webhook: {
        url: webhookUrlFor(webhookSecret),
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS,
      },
    });
  },

  async setWebhook(instance: string, webhookSecret: string) {
    return call("POST", `/webhook/set/${enc(instance)}`, {
      webhook: { enabled: true, url: webhookUrlFor(webhookSecret), byEvents: false, base64: false, events: WEBHOOK_EVENTS },
    });
  },

  async connect(instance: string) {
    return call<QrResult & { count?: number; instance?: { state?: EvoState } }>("GET", `/instance/connect/${enc(instance)}`);
  },

  async connectionState(instance: string): Promise<EvoState> {
    const r = await call<{ instance?: { state?: EvoState }; state?: EvoState }>("GET", `/instance/connectionState/${enc(instance)}`);
    return r.instance?.state ?? r.state ?? "close";
  },

  async fetchInstance(instance: string) {
    const r = await call<unknown>("GET", `/instance/fetchInstances?instanceName=${enc(instance)}`);
    const list = Array.isArray(r) ? r : [r];
    const row = (list[0] ?? {}) as Record<string, unknown>;
    const inner = (row.instance as Record<string, unknown>) ?? row;
    const owner = (inner.ownerJid ?? inner.owner ?? row.ownerJid ?? null) as string | null;
    return {
      ownerJid: owner,
      profileName: (inner.profileName ?? row.profileName ?? null) as string | null,
      status: (inner.connectionStatus ?? inner.status ?? row.connectionStatus ?? null) as string | null,
    };
  },

  async restart(instance: string) {
    return call("POST", `/instance/restart/${enc(instance)}`);
  },

  async logout(instance: string) {
    return call("DELETE", `/instance/logout/${enc(instance)}`);
  },

  async deleteInstance(instance: string) {
    return call("DELETE", `/instance/delete/${enc(instance)}`);
  },

  async sendText(instance: string, number: string, text: string) {
    const r = await call<SendResult>("POST", `/message/sendText/${enc(instance)}`, { number, text });
    return { id: r?.key?.id ?? null };
  },

  async sendAudio(instance: string, number: string, audioBase64: string) {
    const r = await call<SendResult>("POST", `/message/sendWhatsAppAudio/${enc(instance)}`, { number, audio: audioBase64, encoding: true }, 60000);
    return { id: r?.key?.id ?? null };
  },

  async sendImage(instance: string, number: string, url: string, mimetype: string, caption?: string) {
    const r = await call<SendResult>(
      "POST",
      `/message/sendMedia/${enc(instance)}`,
      { number, mediatype: "image", mimetype, media: url, caption: caption ?? "", fileName: "image" },
      60000,
    );
    return { id: r?.key?.id ?? null };
  },

  async sendPresence(instance: string, number: string, presence: "composing" | "recording" | "paused", delayMs: number) {
    try {
      await call("POST", `/chat/sendPresence/${enc(instance)}`, { number, presence, delay: delayMs }, delayMs + 15000);
    } catch {
      // Presence is cosmetic (anti-ban pacing); never block a reply on it.
    }
  },

  async getMediaBase64(instance: string, waMessageId: string) {
    const r = await call<{ base64?: string; mimetype?: string; mimeType?: string }>(
      "POST",
      `/chat/getBase64FromMediaMessage/${enc(instance)}`,
      { message: { key: { id: waMessageId } }, convertToMp4: false },
      60000,
    );
    if (!r?.base64) throw new EvolutionError("Media not available");
    return { base64: r.base64, mimetype: r.mimetype ?? r.mimeType ?? "application/octet-stream" };
  },
};

interface SendResult {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
}

// ─── Unified inbound schema (channel adapter → core) ───────────────────────────

export interface InboundMessage {
  waId: string;
  phone: string; // +E164 digits
  jid: string;
  pushName: string | null;
  fromMe: boolean;
  text: string;
  media: "text" | "audio" | "image";
  durationSec: number | null;
  timestamp: string;
}

const PHONE_JID = /^(\d{6,20})(?::\d+)?@s\.whatsapp\.net$/;

/** Pick the phone-number JID for a message; newer WhatsApp builds address chats by @lid. */
function resolvePhoneJid(key: Record<string, unknown>, data: Record<string, unknown>): string | null {
  const candidates = [key.remoteJid, key.remoteJidAlt, key.senderPn, key.participantPn, data.senderPn, data.remoteJidAlt];
  for (const c of candidates) {
    if (typeof c === "string") {
      if (PHONE_JID.test(c)) return c;
      if (/^\d{6,20}$/.test(c)) return `${c}@s.whatsapp.net`;
    }
  }
  return null;
}

/** Map an Evolution `messages.upsert` payload to the unified schema. Returns null for anything we ignore. */
export function parseMessageUpsert(data: unknown): InboundMessage | null {
  const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!raw) return null;
  const d = ((raw.messages as unknown[])?.[0] as Record<string, unknown>) ?? raw;
  const key = (d.key ?? {}) as Record<string, unknown>;
  const remote = String(key.remoteJid ?? "");
  if (!key.id || remote.endsWith("@g.us") || remote === "status@broadcast" || remote.endsWith("@newsletter") || remote.endsWith("@broadcast")) return null;

  const jid = resolvePhoneJid(key, d);
  if (!jid) return null;
  const digits = jid.match(PHONE_JID)?.[1];
  if (!digits) return null;

  const m = (d.message ?? {}) as Record<string, any>;
  const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m;
  let text = "";
  let media: InboundMessage["media"] = "text";
  let durationSec: number | null = null;

  if (typeof inner.conversation === "string") text = inner.conversation;
  else if (inner.extendedTextMessage?.text) text = inner.extendedTextMessage.text;
  else if (inner.audioMessage) {
    media = "audio";
    durationSec = Number(inner.audioMessage.seconds ?? 0) || null;
  } else if (inner.imageMessage) {
    media = "image";
    text = inner.imageMessage.caption ?? "";
  } else if (inner.videoMessage) text = inner.videoMessage.caption ? `🎬 ${inner.videoMessage.caption}` : "🎬 Video";
  else if (inner.documentMessage || inner.documentWithCaptionMessage) {
    const doc = inner.documentMessage ?? inner.documentWithCaptionMessage?.message?.documentMessage;
    text = `📎 ${doc?.fileName ?? "Document"}`;
  } else if (inner.locationMessage) text = `📍 Location: ${inner.locationMessage.degreesLatitude}, ${inner.locationMessage.degreesLongitude}`;
  else if (inner.contactMessage) text = `👤 Contact: ${inner.contactMessage.displayName ?? ""}`;
  else if (inner.stickerMessage) text = "Sticker";
  else if (inner.reactionMessage) return null;
  else if (inner.protocolMessage || inner.senderKeyDistributionMessage) return null;
  else if (inner.buttonsResponseMessage) text = inner.buttonsResponseMessage.selectedDisplayText ?? "";
  else if (inner.listResponseMessage) text = inner.listResponseMessage.title ?? "";
  else return null;

  const ts = Number(d.messageTimestamp ?? 0);
  return {
    waId: String(key.id),
    phone: `+${digits}`,
    jid,
    pushName: typeof d.pushName === "string" ? d.pushName : null,
    fromMe: Boolean(key.fromMe),
    text,
    media,
    durationSec,
    timestamp: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
  };
}

export function jidToPhone(jid?: string | null) {
  const digits = jid?.match(/^(\d{6,20})/)?.[1];
  return digits ? `+${digits}` : null;
}

/** Number format Evolution expects when sending. */
export function toWaNumber(phone: string) {
  return phone.replace(/[^\d]/g, "");
}
