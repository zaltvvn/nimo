/**
 * NimoTV Stream API
 * Vercel Serverless Function
 * GET /api/nimo?username=<username|id>
 * GET /api/nimo?id=<numeric_id>
 */

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36";

const RE_APPID    = /appid=(\d+)/;
const RE_DOMAIN   = /https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z.\/]+(?=V|&)/;
const RE_ID       = /id=([^|\\]+)/;
const RE_TP       = /tp=(\d+)/;
const RE_WSSECRET = /wsSecret=(\w+)/;
const RE_WSTIME   = /wsTime=(\w+)/;
const RE_ROOM     = /<script>var G_roomBaseInfo = ({.*?});<\/script>/s;

function hexToLatin1(hexStr) {
  return Buffer.from(hexStr, "hex").toString("latin1");
}

function extractGroup(regex, text, group = 1) {
  const m = regex.exec(text);
  if (!m) throw new Error(`Pattern not found: ${regex}`);
  return m[group];
}

async function fetchPage(username) {
  const isNumeric = /^\d+$/.test(username);
  const candidates = isNumeric
    ? [`https://m.nimo.tv/live/${username}`, `https://m.nimo.tv/${username}`]
    : [`https://m.nimo.tv/${username}`];

  let lastError = "unknown error";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": ANDROID_UA } });
      if (!res.ok) { lastError = `HTTP ${res.status} at ${url}`; continue; }
      const html = await res.text();
      if (RE_ROOM.test(html)) return { html, error: null };
      lastError = `G_roomBaseInfo not found at ${url}`;
    } catch (err) {
      lastError = err.message;
    }
  }
  return { html: null, error: lastError };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const username = req.query.username || req.query.id;
  if (!username) {
    return res.status(400).json({ error: "Missing ?username= or ?id= query parameter" });
  }

  // 1. Fetch page
  const { html, error: fetchError } = await fetchPage(username);
  if (!html) return res.status(502).json({ error: `Failed to fetch page: ${fetchError}` });

  // 2. Parse room info
  const roomMatch = RE_ROOM.exec(html);
  if (!roomMatch) return res.status(404).json({ error: "Room info not found." });

  let roomData;
  try { roomData = JSON.parse(roomMatch[1]); }
  catch { return res.status(500).json({ error: "Failed to parse room JSON" }); }

  const { title, nickname, game, liveStreamStatus, mStreamPkg } = roomData;

  if (liveStreamStatus === 0) {
    return res.status(200).json({ online: false, author: nickname, category: game, title, url: null });
  }

  if (!mStreamPkg) {
    return res.status(200).json({ online: true, author: nickname, category: game, title, url: null, error: "mStreamPkg missing" });
  }

  // 3. Decode hex pkg
  let pkgText;
  try { pkgText = hexToLatin1(mStreamPkg); }
  catch { return res.status(500).json({ error: "Failed to decode mStreamPkg" }); }

  let appid, domain, id, tp, wsSecret, wsTime;
  try {
    appid    = extractGroup(RE_APPID,    pkgText);
    domain   = extractGroup(RE_DOMAIN,   pkgText, 0);
    id       = extractGroup(RE_ID,       pkgText);
    tp       = extractGroup(RE_TP,       pkgText);
    wsSecret = extractGroup(RE_WSSECRET, pkgText);
    wsTime   = extractGroup(RE_WSTIME,   pkgText);
  } catch (err) {
    return res.status(500).json({ error: `Invalid mStreamPkg: ${err.message}` });
  }

  if (!domain.endsWith("/")) domain += "/";

  // 4. Build stream URL
  // Thay hls → flv subdomain
  const flvDomain = domain.replace(/[a-z]{2,3}\.hls\.nimo\.tv/, "flv.nimo.tv");
  const streamUrl = new URL(`${flvDomain}${id}.flv`);

  const params = {
    ver: "1",
    id,
    appid,
    tp,
    wsSecret,
    wsTime,
    u: "0",
    t: "100",
    needwm: "0",
    // ctype báo hiệu client là nimo web → tránh bị chặn
    ctype: "nimo_wapS",
  };
  for (const [k, v] of Object.entries(params)) streamUrl.searchParams.set(k, v);

  // 5. Trả về url + headers cần thiết để player dùng
  return res.status(200).json({
    online: true,
    author: nickname,
    category: game,
    title,
    url: streamUrl.toString(),
    // Client phải set các header này khi fetch stream
    headers: {
      Referer: "https://www.nimo.tv/",
      Origin: "https://www.nimo.tv",
    },
  });
}
