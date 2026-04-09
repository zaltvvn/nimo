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

        // GIẢI MÃ DỮ LIỆU
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const idMatch = decodedPkg.match(/id=([^&|\\]+)/);
        
        const parts = decodedPkg.split('?');
        let queryString = parts.length > 1 ? parts[1] : "";

        if (!domainMatch || !idMatch || !queryString) {
            return res.status(500).send("Lỗi bóc tách chuỗi tham số.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let streamId = idMatch[1];

        // CHẤT LƯỢNG THÔNG MINH
        const q = req.query.q || '720'; 
        let newRatio = '2500'; 
        if (q === '1080') newRatio = '6000';
        else if (q === '480') newRatio = '1000';
        else if (q === '360') newRatio = '500';

        queryString = queryString.replace(/ratio=\d+/, `ratio=${newRatio}`);
        const needwm = newRatio === '6000' ? '0' : '1';
        queryString = queryString.replace(/needwm=\d+/, `needwm=${needwm}`);
        
        if (newRatio !== '6000' && !queryString.includes('sphd=')) {
            queryString += "&sphd=1";
        }

        const u = "17" + Math.floor(Math.random() * 10000000000);
        const seqid = Date.now().toString() + Math.floor(Math.random() * 1000);
        
        // Lắp ráp link thô
        let finalUrl = `${domain}${streamId}.flv?${queryString}&ver=1&ctype=nimo_media_web&u=${u}&seqid=${seqid}&t=100&a_block=0`;

        // ==========================================
        // BỘ LỌC KÝ TỰ RÁC (FIX LỖI HEADER LOCATION)
        // Loại bỏ toàn bộ khoảng trắng, dấu xuống dòng, và ký tự null
        // ==========================================
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
