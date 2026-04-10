export default async function handler(req, res) {
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

        // GIẢI MÃ MSTREAMPKG (HEX TO STRING)
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH THAM SỐ CƠ BẢN
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).send("Lỗi giải mã tham số luồng.");
        }

        // TỰ NHẬN DIỆN CÁC CHẤT LƯỢNG CÓ SẴN TỪ STREAM PKG
        // Nimo thường nhúng danh sách ratio dạng: ratio=6000|2500|1000|500
        const ratioListMatch = decodedPkg.match(/ratio=([\d|]+)/);
        const availableRatios = ratioListMatch
            ? ratioListMatch[1].split('|').map(Number).filter(Boolean).sort((a, b) => b - a)
            : null;

        // MAP ratio → label để debug / info
        const RATIO_LABEL = {
            6000: '1080p', 4000: '1080p', 3000: '720p',
            2500: '720p',  1500: '480p',  1000: '480p',
            500:  '360p',  300:  '360p'
        };

        // XỬ LÝ THAM SỐ ?q= (tuỳ chọn ép chất lượng cụ thể)
        const qParam = req.query.q; // '1080' | '720' | '480' | '360' | undefined

        const Q_TO_RATIO = {
            '1080': [6000, 4000],
            '720':  [3000, 2500],
            '480':  [1500, 1000],
            '360':  [500,  300],
        };

        let selectedRatio;

        if (qParam && Q_TO_RATIO[qParam]) {
            // Người dùng yêu cầu chất lượng cụ thể → tìm ratio gần nhất có sẵn
            const preferred = Q_TO_RATIO[qParam];
            if (availableRatios) {
                selectedRatio = preferred.find(r => availableRatios.includes(r))
                             ?? availableRatios[0]; // fallback → cao nhất
            } else {
                selectedRatio = preferred[0];
            }
        } else {
            // Không truyền ?q= → tự chọn cao nhất có sẵn
            selectedRatio = availableRatios ? availableRatios[0] : 6000;
        }

        const needwm  = selectedRatio >= 4000 ? '0' : '1';
        const isLower = selectedRatio < 4000;

        // Chuyển từ HLS → FLV domain
        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        // TẠO THAM SỐ GIẢ LẬP NGƯỜI DÙNG THẬT
        const u      = Math.floor(Math.random() * 1000000000000) + 1700000000000;
        const seqid  = Math.floor(Math.random() * 4000000000000) + 3000000000000;
        const now    = Date.now();

        // LẮP RÁP LINK .FLV HOÀN CHỈNH
        const finalUrl = `${domain}${id}.flv?ver=1` +
                         `&wsSecret=${wsSecret}` +
                         `&wsTime=${wsTime}` +
                         `&ctype=nimo_media_web` +
                         `&appid=${appid}` +
                         `&tp=${tp}` +
                         `&needwm=${needwm}` +
                         `&ratio=${selectedRatio}` +
                         (isLower ? '&sphd=1' : '') +
                         `&u=${u}` +
                         `&t=100` +
                         `&seqid=${seqid}` +
                         `&sdk_sid=${now}` +
                         `&a_block=0`;

        // Header debug (xem chất lượng được chọn)
        res.setHeader('X-Stream-Quality', RATIO_LABEL[selectedRatio] ?? `${selectedRatio}kbps`);
        res.setHeader('X-Available-Ratios', availableRatios ? availableRatios.join('|') : 'unknown');
        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
