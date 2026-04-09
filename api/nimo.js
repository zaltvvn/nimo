export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // TRÁNH 404: Gọi thẳng URL gốc, để Nimo tự điều hướng bên trong HTML
    const url = `https://m.nimo.tv/${roomId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.nimo.tv/'
            }
        });

        const html = await response.text();
        
        // REGEX linh hoạt: Bắt được cả khi có hoặc không có khoảng trắng
        const jsonMatch = html.match(/var\s+G_roomBaseInfo\s*=\s*({.*?});/) || html.match(/G_roomBaseInfo=({.*?});/);
        
        if (!jsonMatch) {
            return res.status(404).send("Nimo không nhả dữ liệu. Kiểm tra lại ID hoặc Proxy.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send(`Kênh ${data.nickname || roomId} đang Offline.`);
        }

        // GIẢI MÃ MSTREAMPKG
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH THÀNH PHẦN GỐC
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const streamId = decodedPkg.match(/id=([^&|\\]+)/)?.[1];
        let queryString = decodedPkg.split('?')[1] || "";

        if (!domainMatch || !streamId) return res.status(500).send("Lỗi bóc tách link gốc.");

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        // XỬ LÝ CHẤT LƯỢNG TỰ ĐỘNG (Smart Quality)
        // Nếu không có tham số ?q= thì giữ nguyên ratio gốc của Nimo (tránh Buffering)
        if (req.query.q) {
            const q = req.query.q;
            let ratio = '6000';
            if (q === '720') ratio = '2500';
            if (q === '480') ratio = '1000';
            
            queryString = queryString.replace(/ratio=\d+/, `ratio=${ratio}`);
            queryString = queryString.replace(/needwm=\d+/, `needwm=${ratio === '6000' ? '0' : '1'}`);
            
            if (ratio !== '6000' && !queryString.includes('sphd=')) {
                queryString += "&sphd=1";
            }
        }

        const finalUrl = `${domain}${streamId}.flv?${queryString}&ver=1&a_block=0`;

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
