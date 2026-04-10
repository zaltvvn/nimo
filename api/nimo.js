/**
 * NimoTV Stream API
 * Vercel Serverless Function
 * GET /api/nimo?username=<username>
 */

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36";

const VIDEO_QUALITIES = {
  250: "240p",
  500: "360p",
  1000: "480p",
  2500: "720p",
  6000: "1080p",
};

// --- regex patterns (applied to Buffer/Uint8Array via string from latin1) ---
const RE_APPID    = /appid=(\d+)/;
const RE_DOMAIN   = /https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z.\/]+(?=V|&)/;
const RE_ID       = /id=([^|\\]+)/;
const RE_TP       = /tp=(\d+)/;
const RE_WSSECRET = /wsSecret=(\w+)/;
const RE_WSTIME   = /wsTime=(\w+)/;
const RE_ROOM     = /<script>var G_roomBaseInfo = ({.*?});<\/script>/s;

/**
 * Parse a hex string → Buffer → latin1 string so regex work correctly.
 */
function hexToLatin1(hexStr) {
  const buf = Buffer.from(hexStr, "hex");
  return buf.toString("latin1");
}

function extractGroup(regex, text, group = 1) {
  const m = regex.exec(text);
  if (!m) throw new Error(`Pattern not found: ${regex}`);
  return m[group];
}

function buildStreamUrl(baseUrl, id, params) {
  const url = new URL(baseUrl + id + ".flv");
  url.hostname = url.hostname.replace("hls.nimo.tv", "flv.nimo.tv");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: "Missing ?username= query parameter" });
  }

  const pageUrl = `https://m.nimo.tv/${encodeURIComponent(username)}`;

  // 1. Fetch the mobile page
  let html;
  try {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": ANDROID_UA },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch page: ${err.message}` });
  }

  // 2. Extract G_roomBaseInfo JSON
  const roomMatch = RE_ROOM.exec(html);
  if (!roomMatch) {
    return res.status(404).json({ error: "Room info not found. Stream may not exist." });
  }

  let roomData;
  try {
    roomData = JSON.parse(roomMatch[1]);
  } catch {
    return res.status(500).json({ error: "Failed to parse room JSON" });
  }

  const { title, nickname, game, liveStreamStatus, mStreamPkg } = roomData;

  // 3. Check live status
  if (liveStreamStatus === 0) {
    return res.status(200).json({
      online: false,
      author: nickname,
      category: game,
      title,
      streams: [],
    });
  }

  if (!mStreamPkg) {
    return res.status(200).json({
      online: true,
      error: "mStreamPkg missing — stream data unavailable",
      author: nickname,
      category: game,
      title,
      streams: [],
    });
  }

  // 4. Decode hex → latin1 string and extract params
  let pkgText;
  try {
    pkgText = hexToLatin1(mStreamPkg);
  } catch {
    return res.status(500).json({ error: "Failed to decode mStreamPkg hex" });
  }

  let appid, domain, id, tp, wsSecret, wsTime;
  try {
    appid    = extractGroup(RE_APPID,    pkgText);
    domain   = extractGroup(RE_DOMAIN,   pkgText, 0); // full match
    id       = extractGroup(RE_ID,       pkgText);
    tp       = extractGroup(RE_TP,       pkgText);
    wsSecret = extractGroup(RE_WSSECRET, pkgText);
    wsTime   = extractGroup(RE_WSTIME,   pkgText);
  } catch (err) {
    return res.status(500).json({ error: `Invalid mStreamPkg: ${err.message}` });
  }

  // Ensure domain ends with /
  if (!domain.endsWith("/")) domain += "/";

  // 5. Build stream URLs for each quality
  const baseParams = { appid, id, tp, wsSecret, wsTime, u: "0", t: "100", needwm: "1" };

  const streams = Object.entries(VIDEO_QUALITIES).map(([ratio, label]) => {
    const params = { ...baseParams, ratio };
    if (label === "1080p") {
      params.needwm = "0";
    } else if (["720p", "480p", "360p"].includes(label)) {
      params.sphd = "1";
    }
    const url = buildStreamUrl(domain, id, params);
    return { quality: label, ratio: Number(ratio), url };
  });

  return res.status(200).json({
    online: true,
    author: nickname,
    category: game,
    title,
    streams,
  });
}
