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
            return res.status(404).send("Lỗi: Không tìm thấy HTML chứa dữ liệu.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Kênh hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // Bóc tách Domain, ID và TOÀN BỘ Query String
        // Thay vì chỉ tìm ".hls", mình nới lỏng Regex để xem nó trả về cái gì
        const domainMatch = decodedPkg.match(/(https?:\/\/[^\?]+)/); 
        const idMatch = decodedPkg.match(/id=([^&|\\]+)/);
        const parts = decodedPkg.split('?');
        let queryString = parts.length > 1 ? parts[1] : "";

        // ==========================================
        // MÁY BẮT LỖI (DEBUGGER)
        // Nếu thiếu bất kỳ thành phần nào, nó sẽ in cấu trúc gốc ra màn hình
        // ==========================================
        if (!domainMatch || !idMatch || !queryString) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(500).send(`
                <h3 style="color: red;">Lỗi bóc tách tham số luồng (Debug Mode)</h3>
                <p>Nimo đã trả về dữ liệu, nhưng cấu trúc không giống bình thường. Hãy copy toàn bộ ô bên dưới gửi cho AI:</p>
                <textarea style="width: 100%; height: 300px; padding: 10px; font-family: monospace;">${decodedPkg}</textarea>
                <hr>
                <p><strong>Test Regex:</strong></p>
                <ul>
                    <li>Domain tìm thấy: ${domainMatch ? domainMatch[1] : 'NULL'}</li>
                    <li>ID tìm thấy: ${idMatch ? idMatch[1] : 'NULL'}</li>
                    <li>Query String: ${queryString ? 'CÓ' : 'NULL'}</li>
                </ul>
            `);
        }

        // ... phần còn lại giữ nguyên để chạy bình thường nếu không lỗi
        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let streamId = idMatch[1];

        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        let currentRatio = ratioMatch ? ratioMatch[1] : '2500';

        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') currentRatio = '6000';
            else if (q === '720') currentRatio = '2500';
            else if (q === '480') currentRatio = '1000';
            else if (q === '360') currentRatio = '500';
        }

        queryString = queryString.replace(/ratio=\d+/, `ratio=${currentRatio}`);
        const needwm = currentRatio === '6000' ? '0' : '1';
        queryString = queryString.replace(/needwm=\d+/, `needwm=${needwm}`);
        
        if (currentRatio !== '6000' && !queryString.includes('sphd=')) {
            queryString += "&sphd=1";
        }

        const u = "17" + Math.floor(Math.random() * 10000000000);
        const seqid = Date.now().toString() + Math.floor(Math.random() * 1000);
        
        let finalUrl = `${domain}${streamId}.flv?${queryString}&ver=1&ctype=nimo_media_web&u=${u}&seqid=${seqid}&t=100&a_block=0`;
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
