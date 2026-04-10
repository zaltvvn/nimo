export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Logic tự thêm /live quen thuộc của bạn
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
            return res.status(404).send("Lỗi Vercel: Không tìm thấy HTML (Kênh không tồn tại hoặc Offline).");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH NGUYÊN BẢN CỦA NIMO (Không tự chế biến)
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const idMatch = decodedPkg.match(/id=([^&|\\]+)/);
        
        // Tách lấy toàn bộ cái đuôi chứa wsSecret, ratio, fm Zin 100% của Nimo
        const parts = decodedPkg.split('?');
        const originalQuery = parts.length > 1 ? parts[1] : "";

        if (!domainMatch || !idMatch || !originalQuery) {
            return res.status(500).send("Lỗi giải mã mStreamPkg.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let streamId = idMatch[1];

        // LẮP RÁP LINK: Bê nguyên cụm Query gốc ghép vào, không thêm thắt mắm muối
        let finalUrl = `${domain}${streamId}.flv?${originalQuery}&ver=1&a_block=0`;

        // Quét rác chống lỗi sập Vercel
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
