export default async function handler(req, res) {
    // 1. Lấy ID (Mặc định là Kênh Số)
    const roomId = req.query.id || '879386692';
    
    // Tự động nhận diện ID số / chữ
    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }
    const url = `https://m.nimo.tv/${path}`;

    try {
        // 2. FETCH "TÀNG HÌNH" (Không dùng Referer để tránh 404)
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        const html = await response.text();
        
        // REGEX BẢN CŨ: Ổn định và chính xác
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).send("Lỗi: Không tìm thấy HTML chứa dữ liệu.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Kênh hiện đang Offline.");
        }

        // 3. GIẢI MÃ CHUỖI HEX
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // Bóc tách Domain, ID và TOÀN BỘ Query String (để giữ chữ ký fm)
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const idMatch = decodedPkg.match(/id=([^&|\\]+)/);
        const parts = decodedPkg.split('?');
        let queryString = parts.length > 1 ? parts[1] : "";

        if (!domainMatch || !idMatch || !queryString) {
            return res.status(500).send("Lỗi bóc tách tham số luồng.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let streamId = idMatch[1];

        // 4. CHẤT LƯỢNG "CHÂN ÁI" (Tôn trọng luồng gốc 100%)
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        let currentRatio = ratioMatch ? ratioMatch[1] : '2500'; // Lấy đúng những gì Nimo cấp

        // CHỈ đổi khi người dùng cố tình thêm ?q= vào URL
        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') currentRatio = '6000';
            else if (q === '720') currentRatio = '2500';
            else if (q === '480') currentRatio = '1000';
            else if (q === '360') currentRatio = '500';
        }

        // Cập nhật lại chuỗi tham số một cách an toàn
        queryString = queryString.replace(/ratio=\d+/, `ratio=${currentRatio}`);
        const needwm = currentRatio === '6000' ? '0' : '1';
        queryString = queryString.replace(/needwm=\d+/, `needwm=${needwm}`);
        
        if (currentRatio !== '6000' && !queryString.includes('sphd=')) {
            queryString += "&sphd=1";
        }

        // 5. Thêm tham số trình phát
        const u = "17" + Math.floor(Math.random() * 10000000000);
        const seqid = Date.now().toString() + Math.floor(Math.random() * 1000);
        
        // Lắp ráp link FLV
        let finalUrl = `${domain}${streamId}.flv?${queryString}&ver=1&ctype=nimo_media_web&u=${u}&seqid=${seqid}&t=100&a_block=0`;

        // ==========================================
        // 6. MÁY HÚT BỤI (FIX LỖI HEADER LOCATION)
        // ==========================================
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        // 7. CHUYỂN HƯỚNG
        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
