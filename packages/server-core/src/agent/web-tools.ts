import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { tool } from "langchain";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";

const SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const MAX_SEARCH_RESPONSE_BYTES = 256 * 1024;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_PAGE_TEXT_CHARS = 12_000;
const MAX_FETCH_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

interface PageResponse {
  status: number;
  location?: string;
  contentType?: string;
  body?: Buffer;
}

export function createWebTools(braveSearchApiKey?: string) {
  return [
    tool(
      async ({ query }, config: RunnableConfig) =>
        searchWeb(query, braveSearchApiKey, config.signal),
      {
        name: "web_search",
        description:
          "Search the public web with Brave Search. Requires BRAVE_SEARCH_API_KEY to be configured. Search queries are sent to Brave; do not include secrets or private workspace content.",
        schema: z.object({
          query: z.string().trim().min(2).max(300),
        }),
      },
    ),
    tool(
      async ({ url }, config: RunnableConfig) =>
        fetchWebPage(url, config.signal),
      {
        name: "fetch_url",
        description:
          "Fetch and extract readable text from a public HTTP or HTTPS page. Local/private network addresses, nonstandard ports, redirects to private addresses, and non-text content are blocked.",
        schema: z.object({ url: z.string().url().max(2048) }),
      },
    ),
  ];
}

async function searchWeb(
  query: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
) {
  if (!apiKey?.trim())
    throw new Error("Configure BRAVE_SEARCH_API_KEY to enable web search.");

  const endpoint = new URL(SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", "5");
  endpoint.searchParams.set("safesearch", "moderate");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
      : AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = await readLimitedResponse(response, MAX_SEARCH_RESPONSE_BYTES);
  if (!response.ok)
    throw new Error(`Web search failed with HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Web search returned invalid JSON.");
  }
  const web = isRecord(payload) && isRecord(payload.web) ? payload.web : null;
  const results: SearchResult[] = Array.isArray(web?.results)
    ? web.results
        .filter(isRecord)
        .slice(0, 5)
        .flatMap((result) => {
          if (typeof result.url !== "string") return [];
          return [
            {
              title: typeof result.title === "string" ? result.title : "",
              url: result.url,
              description:
                typeof result.description === "string"
                  ? result.description
                  : "",
            },
          ];
        })
    : [];

  return JSON.stringify({ query, results }, null, 2);
}

async function readLimitedResponse(response: Response, maximumBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error("Web search returned too much data.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchWebPage(input: string, signal?: AbortSignal) {
  let url = parsePublicUrl(input);

  for (let redirect = 0; redirect <= MAX_FETCH_REDIRECTS; redirect += 1) {
    const address = await resolvePublicAddress(url.hostname);
    const response = await requestPage(url, address, signal);

    if (response.location) {
      if (redirect === MAX_FETCH_REDIRECTS)
        throw new Error("The page redirected too many times.");
      url = parsePublicUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Page fetch failed with HTTP ${response.status}.`);

    const contentType = response.contentType
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (
      !contentType ||
      ![
        "text/html",
        "application/xhtml+xml",
        "text/plain",
        "text/markdown",
        "application/json",
      ].includes(contentType)
    )
      throw new Error("The page did not return a supported text format.");

    const source = response.body?.toString("utf8") ?? "";
    const title = contentType.includes("html") ? extractTitle(source) : "";
    const text = contentType.includes("html")
      ? extractHtmlText(source)
      : source;
    const cleanText = text.replace(/\s+/g, " ").trim();

    return JSON.stringify(
      {
        url: url.href,
        title,
        text: cleanText.slice(0, MAX_PAGE_TEXT_CHARS),
        truncated: cleanText.length > MAX_PAGE_TEXT_CHARS,
      },
      null,
      2,
    );
  }

  throw new Error("Could not fetch the page.");
}

function parsePublicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Provide a valid public HTTP or HTTPS URL.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  )
    throw new Error(
      "Only public HTTP and HTTPS URLs on standard ports are allowed.",
    );

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example")
  )
    throw new Error("Local and reserved hostnames cannot be fetched.");

  url.hostname = hostname;
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<PinnedAddress> {
  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : hostname.includes(".")
        ? await dnsLookup(hostname, { all: true, verbatim: true })
        : [];

  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new Error("The URL must resolve only to public IP addresses.");

  const address = addresses[0]!;
  if (address.family !== 4 && address.family !== 6)
    throw new Error("The URL resolved to an unsupported address.");
  return { address: address.address, family: address.family };
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;

  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return false;
  const firstGroup = normalized.split(":").find(Boolean) ?? "0";
  const firstValue = Number.parseInt(firstGroup, 16);
  const secondValue = Number.parseInt(normalized.split(":")[1] ?? "0", 16);
  return (
    firstValue >= 0x2000 &&
    firstValue <= 0x3fff &&
    firstValue !== 0x3fff &&
    !(firstValue === 0x2001 && secondValue <= 0x01ff) &&
    firstValue !== 0x2002
  );
}

function isPublicIpv4(address: string) {
  const [first, second, third] = address.split(".").map(Number);
  if (first === undefined || second === undefined || third === undefined)
    return false;

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second! >= 64 && second! <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function requestPage(
  url: URL,
  address: PinnedAddress,
  signal?: AbortSignal,
): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    const options = {
      hostname: address.address,
      family: address.family,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: "GET" as const,
      signal,
      headers: {
        Host: url.host,
        Accept:
          "text/html,application/xhtml+xml,text/plain,text/markdown,application/json;q=0.9",
        "Accept-Encoding": "identity",
        "User-Agent": "AgentdockStarter/1.0",
      },
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
    };
    const clientRequest =
      url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = clientRequest(options, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve({ status, location });
        return;
      }

      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (contentLength > MAX_PAGE_BYTES) {
        response.destroy();
        reject(new Error("The page exceeds the 512 KB download limit."));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_PAGE_BYTES) {
          response.destroy();
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.once("end", () => {
        resolve({
          status,
          contentType: Array.isArray(response.headers["content-type"])
            ? response.headers["content-type"][0]
            : response.headers["content-type"],
          body: Buffer.concat(chunks),
        });
      });
      response.once("error", handleError);
      response.once("close", () => {
        if (!response.complete)
          handleError(
            new Error("The page exceeded the 512 KB download limit."),
          );
      });
    });

    request.setTimeout(FETCH_TIMEOUT_MS, () =>
      request.destroy(new Error("The page request timed out.")),
    );
    request.once("error", handleError);
    request.end();
  });
}

function extractTitle(html: string) {
  return decodeHtmlEntities(
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function extractHtmlText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_entity, value: string) => {
      const codePoint =
        value[0]?.toLowerCase() === "x"
          ? Number.parseInt(value.slice(1), 16)
          : Number.parseInt(value, 10);
      return codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : " ";
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
