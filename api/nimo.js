export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Logic thêm /live của bạn
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
            return res.status(404).send("Lỗi Vercel: Không tìm thấy HTML.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // ==========================================
        // DÙNG REGEX "GẮP" TỪNG THÔNG SỐ (Không dùng split nữa)
        // ==========================================
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const idMatch = decodedPkg.match(/id=([A-Za-z0-9_-]+)/);
        const wsSecretMatch = decodedPkg.match(/wsSecret=([A-Za-z0-9]+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=([A-Za-z0-9]+)/);

        if (!domainMatch || !idMatch || !wsSecretMatch) {
            return res.status(500).send("Lỗi bóc tách tham số bằng Regex.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let streamId = idMatch[1];
        let wsSecret = wsSecretMatch[1];
        let wsTime = wsTimeMatch[1];

        // GẮP THÊM CHỮ KÝ "fm" VÀ CÁC THAM SỐ KHÁC (Chống 404 Tengine)
        let fmMatch = decodedPkg.match(/fm=([A-Za-z0-9%_-]+)/);
        let fmStr = fmMatch ? `&fm=${fmMatch[1]}` : "";
        let appid = decodedPkg.match(/appid=(\d+)/)?.[1] || "81";
        let tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();

        // CHẤT LƯỢNG THÔNG MINH (Tự lấy luồng gốc)
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        let ratio = ratioMatch ? ratioMatch[1] : '2500';

        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') ratio = '6000';
            else if (q === '720') ratio = '2500';
            else if (q === '480') ratio = '1000';
            else if (q === '360') ratio = '500';
        }

        let needwm = ratio === '6000' ? '0' : '1';
        let sphd = ratio !== '6000' ? '&sphd=1' : '';

        // LẮP RÁP LINK ĐẦY ĐỦ
        let finalUrl = `${domain}${streamId}.flv?appid=${appid}&id=${streamId}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}${fmStr}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}&a_block=0`;

        // Lọc ký tự rác
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
