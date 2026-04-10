export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const roomId = req.query.id || '879386692';

    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }

    try {
        const pageRes = await fetch(`https://m.nimo.tv/${path}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        const html = await pageRes.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) return res.status(404).send("Không tìm thấy dữ liệu phòng.");

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) return res.status(200).send("Stream đang Offline.");

        const pkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        const appid      = pkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = pkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id         = pkg.match(/id=([^|\\]+)/)?.[1];
        const tp         = pkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        const wsSecret   = pkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime     = pkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) return res.status(500).send("Lỗi giải mã luồng.");

        const domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        const q = req.query.q || '1080';
        let ratio = '6000';
        if (q === '720') ratio = '2500';
        if (q === '480') ratio = '1000';
        if (q === '360') ratio = '500';
        if (q === '240') ratio = '250';

        const needwm = ratio === '6000' ? '0' : '1';

        const params = new URLSearchParams({
            ver:      '1',
            wsSecret,
            wsTime,
            ctype:    'nimo_media_web',
            appid,
            tp,
            needwm,
            ratio,
            u:        '0',
            t:        '100',
        });
        if (ratio !== '6000') params.set('sphd', '1');

        const streamUrl = `${domain}${id}.flv?${params.toString()}`;

        // PROXY STREAM — không redirect, pipe thẳng về client
        const streamRes = await fetch(streamUrl, {
            headers: {
                'User-Agent':  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Referer':     'https://www.nimo.tv/',
                'Origin':      'https://www.nimo.tv',
                // Forward Range header nếu client seek
                ...(req.headers['range'] ? { 'Range': req.headers['range'] } : {}),
            }
        });

        if (!streamRes.ok && streamRes.status !== 206) {
            return res.status(502).send(`Nimo từ chối stream: HTTP ${streamRes.status}`);
        }

        // Forward headers quan trọng từ Nimo về client
        const forward = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'transfer-encoding',
        ];
        forward.forEach(h => {
            const v = streamRes.headers.get(h);
            if (v) res.setHeader(h, v);
        });

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Stream-Quality', q);
        res.status(streamRes.status);

        // Pipe body về client
        const reader = streamRes.body.getReader();
        const pump = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const ok = res.write(value);
                // Backpressure — đợi drain nếu buffer đầy
                if (!ok) await new Promise(r => res.once('drain', r));
            }
            res.end();
        };

        // Nếu client ngắt kết nối → huỷ reader
        req.on('close', () => reader.cancel());

        await pump();

    } catch (error) {
        if (!res.headersSent) {
            res.status(500).send("Lỗi hệ thống: " + error.message);
        }
    }
}
