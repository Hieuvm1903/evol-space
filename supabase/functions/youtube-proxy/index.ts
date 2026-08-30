// supabase/functions/youtube-proxy/index.ts
//
// Replaces utils/youtube.py and utils/ytmusic_search.py. Both did
// server-side HTTP scraping (YouTube's oEmbed endpoint, and parsing the
// `ytInitialData` JSON blob embedded in playlist/search result pages) —
// exactly the kind of cross-origin request a browser blocks via CORS.
// Streamlit could do this because Python's urllib runs server-side; the
// React app needs a server-side hop too, so this Edge Function plays that
// role. Same "no API key, just read the public page" philosophy as the
// original Python code — including the same fragility caveat: if YouTube
// changes its markup, the scraping here needs adjusting, same as before.
//
// Deploy with: supabase functions deploy youtube-proxy
// Call from the browser via: supabase.functions.invoke("youtube-proxy", { body: {...} })

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// URL helpers — same regexes as utils/youtube.py
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const PLAYLIST_ID_RE = /[?&]list=([A-Za-z0-9_-]+)/;

function extractVideoId(url: string): string | null {
  const m = url.match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

function extractPlaylistId(url: string): string | null {
  const m = url.match(PLAYLIST_ID_RE);
  return m ? m[1] : null;
}

function normalizeUrl(url: string): string | null {
  const id = extractVideoId(url.trim());
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

// ---------------------------------------------------------------------------
// action=metadata — port of fetch_metadata()
// ---------------------------------------------------------------------------

async function fetchMetadata(url: string): Promise<Record<string, string>> {
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(url)}&format=json`,
  ];
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.title) {
        return {
          title: data.title,
          author: data.author_name ?? "",
          thumbnail_url: data.thumbnail_url ?? "",
        };
      }
    } catch {
      continue;
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// ytInitialData extraction — port of _extract_balanced_json / _parse_ytinitialdata
// ---------------------------------------------------------------------------

function extractBalancedJson(text: string, startIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function parseYtInitialData(html: string): any | null {
  for (const marker of ['var ytInitialData = ', 'ytInitialData"] = ', '"ytInitialData":']) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const braceIdx = html.indexOf("{", idx);
    if (braceIdx === -1) continue;
    const jsonStr = extractBalancedJson(html, braceIdx);
    if (!jsonStr) continue;
    try {
      return JSON.parse(jsonStr);
    } catch {
      continue;
    }
  }
  return null;
}

// Generic recursive walk collecting every node that has one of the given
// renderer keys — used for playlist videos, search video results, and
// search playlist results alike.
function walkForRenderers(node: any, rendererKeys: string[], out: any[], limit: number) {
  if (out.length >= limit) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (out.length >= limit) return;
      walkForRenderers(item, rendererKeys, out, limit);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const key of rendererKeys) {
      if (node[key]) {
        out.push(node[key]);
        return; // don't also descend into a matched renderer's internals
      }
    }
    for (const value of Object.values(node)) {
      if (out.length >= limit) return;
      walkForRenderers(value, rendererKeys, out, limit);
    }
  }
}

function firstThumbnail(thumbObj: any): string {
  const thumbs = thumbObj?.thumbnails ?? [];
  return thumbs.length ? thumbs[thumbs.length - 1].url : "";
}

function runText(textObj: any): string {
  return textObj?.runs?.[0]?.text ?? textObj?.simpleText ?? "";
}

// ---------------------------------------------------------------------------
// action=playlist — port of fetch_playlist_videos()
// ---------------------------------------------------------------------------

const RAW_VIDEO_ID_RE = /"videoId":"([A-Za-z0-9_-]{11})"/g;

async function fetchPlaylistVideos(url: string, limit = 200) {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) return [];

  let html: string;
  try {
    const resp = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1", // skip the EU cookie-consent interstitial
      },
      signal: AbortSignal.timeout(10000),
    });
    html = await resp.text();
  } catch {
    return [];
  }

  const videos: { video_id: string; title: string; thumbnail_url: string }[] = [];
  const seen = new Set<string>();

  const data = parseYtInitialData(html);
  if (data) {
    const renderers: any[] = [];
    walkForRenderers(data, ["playlistVideoRenderer", "playlistPanelVideoRenderer"], renderers, limit);
    for (const r of renderers) {
      const videoId = r.videoId;
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      videos.push({
        video_id: videoId,
        title: runText(r.title),
        thumbnail_url: firstThumbnail(r.thumbnail),
      });
    }
  }

  if (videos.length === 0) {
    // Same last-resort fallback as the Python version: every video id
    // still appears as a bare "videoId":"..." pair even if the structured
    // parse above didn't find it.
    for (const m of html.matchAll(RAW_VIDEO_ID_RE)) {
      const videoId = m[1];
      if (!seen.has(videoId)) {
        seen.add(videoId);
        videos.push({ video_id: videoId, title: "", thumbnail_url: "" });
      }
      if (videos.length >= limit) break;
    }
  }

  return videos.slice(0, limit);
}

// ---------------------------------------------------------------------------
// action=search / action=search-playlists — via YouTube's InnerTube JSON
// API instead of scraping the HTML search page. The old approach pulled
// `ytInitialData` out of raw HTML with a hand-rolled brace-matcher, which
// broke whenever YouTube changed markup or served a consent/bot-check page
// instead of real results (this is why playlist search stopped working).
// InnerTube is the same JSON API youtube.com's own frontend calls, so it
// returns the renderer tree directly — no HTML/regex involved.
// ---------------------------------------------------------------------------

// Public, unauthenticated "WEB" client key baked into youtube.com's own
// frontend bundle (the same one yt-dlp ships with). No Google Cloud
// project or API key of your own needed.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_CLIENT_VERSION = "2.20240701.01.00";

async function innertubeSearch(query: string, params?: string): Promise<any | null> {
  const body: Record<string, unknown> = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: INNERTUBE_CLIENT_VERSION,
        hl: "en",
        gl: "US",
      },
    },
    query,
  };
  if (params) body.params = params;

  try {
    const resp = await fetch(
      `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": INNERTUBE_CLIENT_VERSION,
          Origin: "https://www.youtube.com",
          Cookie: "CONSENT=YES+1",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    console.log(`innertubeSearch: status=${resp.status} query=${query} params=${params ?? ""}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.log(`innertubeSearch: FETCH ERROR: ${e}`);
    return null;
  }
}

async function searchSongs(query: string, limit = 8) {
  const data = await innertubeSearch(query.trim());
  if (!data) return [];

  const renderers: any[] = [];
  walkForRenderers(data, ["videoRenderer"], renderers, limit * 3);
  console.log(`searchSongs: found ${renderers.length} videoRenderer nodes`);

  const results = [];
  for (const r of renderers) {
    if (results.length >= limit) break;
    const videoId = r.videoId;
    if (!videoId) continue;
    results.push({
      video_id: videoId,
      title: runText(r.title) || "Untitled",
      artist: runText(r.ownerText) || runText(r.longBylineText) || "",
      thumbnail_url: firstThumbnail(r.thumbnail),
      duration: r.lengthText?.simpleText ?? "",
    });
  }
  return results;
}

function lockupThumbnail(lockup: any): string {
  const sources =
    lockup?.contentImage?.collectionThumbnailViewModel?.primaryThumbnail
      ?.thumbnailViewModel?.image?.sources ?? [];
  return sources.length ? sources[sources.length - 1].url : "";
}

function lockupMetadataRows(lockup: any): string[] {
  const rows =
    lockup?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows ?? [];
  return rows.map((row: any) =>
    (row.metadataParts ?? []).map((p: any) => p?.text?.content ?? "").filter(Boolean).join(" "),
  );
}

async function searchPlaylists(query: string, limit = 8) {
  const data = await innertubeSearch(query.trim(), "EgIQAw==");
  if (!data) return [];

  const lockups: any[] = [];
  walkForRenderers(data, ["lockupViewModel"], lockups, limit * 4);
  console.log(`searchPlaylists: found ${lockups.length} lockupViewModel nodes`);

  const results = [];
  for (const lockup of lockups) {
    if (results.length >= limit) break;
    if (lockup.contentType && lockup.contentType !== "LOCKUP_CONTENT_TYPE_PLAYLIST") continue;

    const playlistId = lockup.contentId;
    if (!playlistId) continue;

    const title = lockup?.metadata?.lockupMetadataViewModel?.title?.content;
    if (!title) {
      // Shape drifted again — log a sample instead of silently skipping.
      console.log(`searchPlaylists: lockup missing title, sample: ${JSON.stringify(lockup).slice(0, 400)}`);
      continue;
    }

    const rows = lockupMetadataRows(lockup);
    // Row 0 is typically the channel/author, row 1 is typically "N videos".
    const author = rows[0] ?? "";
    const itemCountRow = rows.find((r) => /video/i.test(r)) ?? rows[1] ?? "";

    results.push({
      playlist_id: playlistId,
      title,
      author,
      item_count: itemCountRow,
      thumbnail_url: lockupThumbnail(lockup),
    });
  }
  return results;
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    let result: unknown;
    switch (action) {
      case "metadata": {
        const normalized = normalizeUrl(body.url ?? "");
        result = normalized ? await fetchMetadata(normalized) : {};
        break;
      }
      case "playlist":
        result = await fetchPlaylistVideos(body.url ?? "", body.limit ?? 200);
        break;
      case "search":
        result = await searchSongs(body.query ?? "", body.limit ?? 8);
        break;
      case "search-playlists":
        result = await searchPlaylists(body.query ?? "", body.limit ?? 8);
        break;
      case "extract-video-id":
        result = { video_id: extractVideoId(body.url ?? ""), normalized_url: normalizeUrl(body.url ?? "") };
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
