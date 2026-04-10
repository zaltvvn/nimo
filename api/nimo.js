export default async function handler(req, res) {
    // 1. Nhận ID
    const roomId = req.query.id || '879386692';
    
    // ==========================================
    // PHỤC HỒI LOGIC CỦA BẠN: Tự nhận diện ID Số (Fix lỗi 404 Nimo)
    // ==========================================
    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }
    
    const url = `https://m.nimo.tv/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
            }
        });

        const html = await response.text();
        
        // 2. Bắt HTML
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).send(`Stream Offline / Lỗi bóc tách HTML. Đã thử tìm tại URL: ${url}`);
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline");
        }

        const mStreamPkg = data.mStreamPkg;
        if (!mStreamPkg) {
            return res.status(500).send("Không tìm thấy mStreamPkg");
        }

        const decodedPkg = Buffer.from(mStreamPkg, 'hex').toString('utf-8');

        // 3. Giải mã 100% chuẩn Streamlink
        const appidMatch = decodedPkg.match(/appid=(\d+)/);
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const idMatch = decodedPkg.match(/id=([^|\\]+)/);
        const tpMatch = decodedPkg.match(/tp=(\d+)/);
        const wsSecretMatch = decodedPkg.match(/wsSecret=(\w+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=(\w+)/);

        if (!domainMatch || !idMatch || !wsSecretMatch) {
            return res.status(500).send("Lỗi: Regex Streamlink không bắt được dữ liệu.");
        }

        const appid = appidMatch ? appidMatch[1] : '81';
        let domain = domainMatch[1];
        const id_ = idMatch[1];
        const tp = tpMatch ? tpMatch[1] : '';
        const wsSecret = wsSecretMatch[1];
        const wsTime = wsTimeMatch[1];

        // HLS sang FLV
        domain = domain.replace('hls.nimo.tv', 'flv.nimo.tv');

        // 4. Chất lượng thông minh
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        let ratio = ratioMatch ? ratioMatch[1] : '2500';

        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') ratio = '6000';
            else if (q === '720') ratio = '2500';
            else if (q === '480') ratio = '1000';
            else if (q === '360') ratio = '500';
        }

        let needwm = (ratio === '6000') ? '0' : '1';
        let sphd = (ratio !== '6000') ? '&sphd=1' : '';

        // 5. Ráp link
        let finalUrl = `${domain}${id_}.flv?appid=${appid}&id=${id_}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}`;

        // Quét ký tự rác chống sập Vercel
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
