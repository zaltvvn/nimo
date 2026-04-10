export default async function handler(req, res) {
    // Lấy Username hoặc ID
    const username = req.query.id || '879386692';
    
    // Theo đúng code Python: Nimo chấp nhận m.nimo.tv/username
    const url = `https://m.nimo.tv/${username}`;

    try {
        const response = await fetch(url, {
            headers: {
                // User-Agent y hệt Streamlink
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
            }
        });

        const html = await response.text();
        
        // Regex nồi đồng cối đá của Streamlink
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).send("Stream Offline / Lỗi bóc tách HTML");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline");
        }

        const mStreamPkg = data.mStreamPkg;
        if (!mStreamPkg) {
            return res.status(500).send("Không tìm thấy mStreamPkg");
        }

        // Giải mã Hex giống Python: bytes.fromhex(mStreamPkg)
        const decodedPkg = Buffer.from(mStreamPkg, 'hex').toString('utf-8');

        // ==========================================
        // DÙNG CHÍNH XÁC REGEX TỪ PYTHON STREAMLINK
        // ==========================================
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

        // Replace hls -> flv
        domain = domain.replace('hls.nimo.tv', 'flv.nimo.tv');

        // ==========================================
        // CHỌN CHẤT LƯỢNG (Tôn trọng luồng gốc)
        // ==========================================
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

        // ==========================================
        // LẮP RÁP URL CHUẨN 100% NHƯ PYTHON
        // Bỏ hết trò giả lập u ngẫu nhiên, dùng đúng u=0, t=100
        // ==========================================
        let finalUrl = `${domain}${id_}.flv?appid=${appid}&id=${id_}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}`;

        // Dọn dẹp byte ẩn (Chống lỗi Invalid Header)
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
