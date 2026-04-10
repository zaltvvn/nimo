export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const roomId = req.query.id || '879386692';
    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) path = `live/${roomId}`;

    try {
        const pageRes = await fetch(`https://m.nimo.tv/${path}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36 Edg/146.0.0.0',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        const html = await pageRes.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) return res.status(404).send("Không tìm thấy dữ liệu phòng.");

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) return res.status(200).send("Stream đang Offline.");
        if (!data.mStreamPkg) return res.status(404).send("Thiếu mStreamPkg.");

        const pkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // Parse toàn bộ params từ pkg — không tự tạo
        const appid       = pkg.match(/appid=(\d+)/)?.[1]                                    || '81';
        const domainMatch = pkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id          = pkg.match(/id=([^|\\]+)/)?.[1];
        const tp          = pkg.match(/tp=(\d+)/)?.[1];
        const wsSecret    = pkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime      = pkg.match(/wsTime=(\w+)/)?.[1];
        const fm          = pkg.match(/fm=([^&|\\]+)/)?.[1];  // token quan trọng
        const seqid       = pkg.match(/seqid=(\d+)/)?.[1];
        const u           = pkg.match(/u=(\d+)/)?.[1];        // lấy từ pkg, không random
        const dMod        = pkg.match(/dMod=([^&|\\]+)/)?.[1];
        const sdkPcdn     = pkg.match(/sdkPcdn=([^&|\\]+)/)?.[1];
        const sv          = pkg.match(/sv=(\d+)/)?.[1];

        if (!domainMatch || !id || !wsSecret || !wsTime) {
            return res.status(500).json({
                error: "Lỗi giải mã luồng.",
                debug: { hasId: !!id, hasWsSecret: !!wsSecret, hasWsTime: !!wsTime, hasDomain: !!domainMatch }
            });
        }

        const domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        const q = req.query.q || '1080';
        let ratio = '6000';
        if (q === '720') ratio = '2500';
        if (q === '480') ratio = '1000';
        if (q === '360') ratio = '500';
        if (q === '240') ratio = '250';

        const needwm = ratio === '6000' ? '0' : '1';
        const now    = Date.now();

        // Build params đúng thứ tự như curl thực tế
        const params = new URLSearchParams();
        params.set('ver',     '1');
        params.set('wsSecret', wsSecret);
        params.set('wsTime',   wsTime);
        if (fm)      params.set('fm',      fm);
        params.set('ctype',   'nimo_media_web');
        params.set('appid',    appid);
        if (tp)      params.set('tp',      tp);
        params.set('needwm',   needwm);
        if (seqid)   params.set('seqid',   seqid);
        params.set('ratio',    ratio);
        if (dMod)    params.set('dMod',    dMod);
        if (sdkPcdn) params.set('sdkPcdn', sdkPcdn);
        params.set('u',        u || '1702937825833'); // fallback giá trị thực tế
        params.set('t',        '100');
        if (sv)      params.set('sv',      sv);
        params.set('sdk_sid',  String(now));
        params.set('a_block',  '0');
        if (ratio !== '6000') params.set('sphd', '1');

        const streamUrl = `${domain}${id}.flv?${params.toString()}`;

        const streamRes = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36 Edg/146.0.0.0',
                'Referer':    'https://www.nimo.tv/',
                'Origin':     'https://www.nimo.tv',
                'Accept':     '*/*',
                ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {}),
            }
        });

        if (!streamRes.ok && streamRes.status !== 206) {
            return res.status(502).send(`Nimo từ chối stream: HTTP ${streamRes.status}`);
        }

        ['content-type', 'content-length', 'content-range', 'accept-ranges', 'transfer-encoding']
            .forEach(h => { const v = streamRes.headers.get(h); if (v) res.setHeader(h, v); });

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Stream-Quality', q);
        res.setHeader('X-Stream-URL', streamUrl); // debug — xoá khi production
        res.status(streamRes.status);

        const reader = streamRes.body.getReader();
        req.on('close', () => reader.cancel());

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const ok = res.write(value);
            if (!ok) await new Promise(r => res.once('drain', r));
        }
        res.end();

    } catch (error) {
        if (!res.headersSent) res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
