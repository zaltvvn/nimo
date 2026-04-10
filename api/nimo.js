export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';

    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }

    const url = `https://m.nimo.tv/${path}`;

    // Map đúng theo Streamlink gốc
    const VIDEO_QUALITIES = [
        { ratio: 6000, label: '1080p', needwm: 0, sphd: false },
        { ratio: 2500, label: '720p',  needwm: 1, sphd: true  },
        { ratio: 1000, label: '480p',  needwm: 1, sphd: true  },
        { ratio: 500,  label: '360p',  needwm: 1, sphd: true  },
        { ratio: 250,  label: '240p',  needwm: 1, sphd: false },
    ];

    try {
        const response = await fetch(url, {
            headers: {
                // Dùng đúng Android UA như Streamlink
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; Android SDK built for arm64 Build/SE1A.220630.001)',
            }
        });

        const html = await response.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);

        if (!jsonMatch) {
            return res.status(404).send("Không tìm thấy dữ liệu phòng.");
        }

        const data = JSON.parse(jsonMatch[1]);

        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream đang Offline.");
        }

        if (!data.mStreamPkg) {
            return res.status(404).send("Thiếu mStreamPkg.");
        }

        // Decode hex → bytes → string (giống bytes.fromhex() trong Python)
        const pkg = Buffer.from(data.mStreamPkg, 'hex');

        const appid     = pkg.toString().match(/appid=(\d+)/)?.[1];
        const domainRaw = pkg.toString().match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z.\/]+)(?:V|&)/)?.[1];
        const id_       = pkg.toString().match(/id=([^|\\]+)/)?.[1];
        const tp        = pkg.toString().match(/tp=(\d+)/)?.[1];
        const wsSecret  = pkg.toString().match(/wsSecret=(\w+)/)?.[1];
        const wsTime    = pkg.toString().match(/wsTime=(\w+)/)?.[1];

        if (!appid || !domainRaw || !id_ || !tp || !wsSecret || !wsTime) {
            return res.status(500).send("Lỗi giải mã mStreamPkg.");
        }

        // Chuyển HLS → FLV domain
        const domain   = domainRaw.replace('hls.nimo.tv', 'flv.nimo.tv');
        const streamUrl = `${domain}${id_}.flv`;

        // Nếu ?q= được truyền → redirect thẳng 1 chất lượng
        // Nếu không → trả JSON danh sách tất cả quality (để client tự chọn)
        const qParam = req.query.q; // '1080' | '720' | '480' | '360' | '240'

        const Q_MAP = {
            '1080': 6000, '720': 2500,
            '480': 1000, '360': 500, '240': 250,
        };

        const buildParams = (q) => {
            // Đúng theo Streamlink gốc: u=0, t=100, không có seqid/sdk_sid/a_block/ctype
            const p = new URLSearchParams({
                appid,
                id: id_,
                tp,
                wsSecret,
                wsTime,
                u: '0',       // cố định 0 như bản gốc
                t: '100',
                needwm: String(q.needwm),
                ratio: String(q.ratio),
            });
            if (q.sphd) p.set('sphd', '1');
            return p.toString();
        };

        if (qParam && Q_MAP[qParam]) {
            // Redirect thẳng vào quality được chọn
            const q = VIDEO_QUALITIES.find(v => v.ratio === Q_MAP[qParam]) || VIDEO_QUALITIES[0];
            const finalUrl = `${streamUrl}?${buildParams(q)}`;
            res.setHeader('Cache-Control', 'no-cache');
            return res.redirect(302, finalUrl);
        }

        // Không truyền ?q= → trả JSON tất cả quality để client chọn
        const qualities = VIDEO_QUALITIES.map(q => ({
            label: q.label,
            url: `${streamUrl}?${buildParams(q)}`,
        }));

        return res.status(200).json({
            title:    data.title    || '',
            author:   data.nickname || '',
            category: data.game     || '',
            qualities,              // client chọn quality rồi play trực tiếp
        });

    } catch (err) {
        res.status(500).send("Lỗi hệ thống: " + err.message);
    }
}
