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

    const VIDEO_QUALITIES = [
        { ratio: 6000, label: '1080p', needwm: 0, sphd: false },
        { ratio: 2500, label: '720p',  needwm: 1, sphd: true  },
        { ratio: 1000, label: '480p',  needwm: 1, sphd: true  },
        { ratio: 500,  label: '360p',  needwm: 1, sphd: true  },
        { ratio: 250,  label: '240p',  needwm: 1, sphd: false },
    ];

    const Q_MAP = {
        '1080': 6000, '720': 2500,
        '480': 1000, '360': 500, '240': 250,
    };

    try {
        const response = await fetch(`https://m.nimo.tv/${path}`, {
            headers: {
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; Android SDK built for arm64 Build/SE1A.220630.001)',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        if (!response.ok) {
            return res.status(502).send(`Không thể kết nối tới Nimo (HTTP ${response.status}).`);
        }

        const html = await response.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);

        if (!jsonMatch) {
            return res.status(404).send("Không tìm thấy dữ liệu phòng. Kiểm tra lại ID.");
        }

        let data;
        try {
            data = JSON.parse(jsonMatch[1]);
        } catch {
            return res.status(500).send("Lỗi parse JSON từ trang Nimo.");
        }

        if (data.liveStreamStatus === 0) {
            return res.status(200).json({
                online:   false,
                title:    data.title    || '',
                author:   data.nickname || '',
                category: data.game     || '',
                message:  "Stream đang Offline.",
            });
        }

        if (!data.mStreamPkg) {
            return res.status(404).send("Thiếu mStreamPkg — stream có thể đang offline hoặc bị ẩn.");
        }

        let pkg;
        try {
            pkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');
        } catch {
            return res.status(500).send("Lỗi decode mStreamPkg hex.");
        }

        const appid     = pkg.match(/appid=(\d+)/)?.[1];
        const domainRaw = pkg.match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z.\/]+)(?:V|&)/)?.[1];
        const id_       = pkg.match(/id=([^|\\]+)/)?.[1];
        const tp        = pkg.match(/tp=(\d+)/)?.[1];
        const wsSecret  = pkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime    = pkg.match(/wsTime=(\w+)/)?.[1];

        if (!appid || !domainRaw || !id_ || !tp || !wsSecret || !wsTime) {
            return res.status(500).json({
                error: "Lỗi giải mã mStreamPkg — thiếu tham số.",
                debug: {
                    hasAppid:    !!appid,
                    hasDomain:   !!domainRaw,
                    hasId:       !!id_,
                    hasTp:       !!tp,
                    hasWsSecret: !!wsSecret,
                    hasWsTime:   !!wsTime,
                },
            });
        }

        const domain    = domainRaw.replace('hls.nimo.tv', 'flv.nimo.tv');
        const streamUrl = `${domain}${id_}.flv`;

        const buildParams = (q) => {
            const p = new URLSearchParams({
                appid,
                id:     id_,
                tp,
                wsSecret,
                wsTime,
                u:      '0',
                t:      '100',
                needwm: String(q.needwm),
                ratio:  String(q.ratio),
            });
            if (q.sphd) p.set('sphd', '1');
            return p.toString();
        };

        const qParam = req.query.q;

        if (qParam) {
            const targetRatio = Q_MAP[qParam];
            if (!targetRatio) {
                return res.status(400).send(`Chất lượng không hợp lệ. Dùng: ${Object.keys(Q_MAP).join(', ')}`);
            }
            const q = VIDEO_QUALITIES.find(v => v.ratio === targetRatio) || VIDEO_QUALITIES[0];
            const finalUrl = `${streamUrl}?${buildParams(q)}`;
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Stream-Quality', q.label);
            return res.redirect(302, finalUrl);
        }

        const qualities = VIDEO_QUALITIES.map(q => ({
            label: q.label,
            ratio: q.ratio,
            url:   `${streamUrl}?${buildParams(q)}`,
        }));

        return res.status(200).json({
            online:    true,
            title:     data.title    || '',
            author:    data.nickname || '',
            category:  data.game     || '',
            qualities,
        });

    } catch (err) {
        return res.status(500).json({
            error:   "Lỗi hệ thống.",
            message: err.message,
        });
    }
}
