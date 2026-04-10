export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Logic của bạn: Tự động thêm /live cho ID số
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

        // BÓC TÁCH (Sử dụng 100% logic của Streamlink Python)
        const appidMatch = decodedPkg.match(/appid=(\d+)/);
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const idMatch = decodedPkg.match(/id=([^|\\]+)/);
        const tpMatch = decodedPkg.match(/tp=(\d+)/);
        const wsSecretMatch = decodedPkg.match(/wsSecret=(\w+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=(\w+)/);

        if (!domainMatch || !idMatch || !wsSecretMatch) {
            return res.status(500).send("Lỗi giải mã tham số luồng.");
        }

        const appid = appidMatch ? appidMatch[1] : '81';
        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        const id = idMatch[1];
        const tp = tpMatch ? tpMatch[1] : '';
        const wsSecret = wsSecretMatch[1];
        const wsTime = wsTimeMatch[1];

        // XỬ LÝ CHẤT LƯỢNG THÔNG MINH (Không bị ép lag)
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        let ratio = ratioMatch ? ratioMatch[1] : '2500';

        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') ratio = '6000';
            else if (q === '720') ratio = '2500';
            else if (q === '480') ratio = '1000';
            else if (q === '360') ratio = '500';
        }

        const needwm = ratio === '6000' ? '0' : '1';
        const sphd = ratio !== '6000' ? '&sphd=1' : '';

        // LẮP RÁP LINK (Chuẩn Streamlink: u=0, t=100, tuyệt đối KHÔNG có fm)
        let finalUrl = `${domain}${id}.flv?appid=${appid}&id=${id}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}`;

        // Dọn rác byte ẩn
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
