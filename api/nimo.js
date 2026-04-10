export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const roomId = req.query.id || '879386692';

    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }

    const url = `https://m.nimo.tv/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        const html = await response.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);

        if (!jsonMatch) {
            return res.status(404).send("Không tìm thấy dữ liệu phòng. Kiểm tra ID.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        const appid      = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id         = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp         = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        const wsSecret   = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime     = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).send("Lỗi giải mã tham số luồng.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        const q = req.query.q || '1080';
        let ratio = '6000';
        if (q === '720') ratio = '2500';
        if (q === '480') ratio = '1000';
        if (q === '360') ratio = '500';
        if (q === '240') ratio = '250';

        const needwm = ratio === '6000' ? '0' : '1';

        // u=0 cố định theo Streamlink gốc (random gây buff)
        const finalUrl = `${domain}${id}.flv?ver=1` +
                         `&wsSecret=${wsSecret}` +
                         `&wsTime=${wsTime}` +
                         `&ctype=nimo_media_web` +
                         `&appid=${appid}` +
                         `&tp=${tp}` +
                         `&needwm=${needwm}` +
                         `&ratio=${ratio}` +
                         (ratio !== '6000' ? '&sphd=1' : '') +
                         `&u=0` +
                         `&t=100`;

        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Stream-Quality', q);
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
