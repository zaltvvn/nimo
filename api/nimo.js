export default async function handler(req, res) {
    // Lấy ID từ tham số ?id=... (Mặc định: 879386692)
    const roomId = req.query.id || '879386692';
    
    // Tự động nhận diện ID là số hay chữ để tạo đường dẫn m.nimo.tv chuẩn
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
        
        // --- MÁY BẮT LỖI ---
        if (!jsonMatch) {
            // Nếu lỗi 404, nó sẽ in ra 500 ký tự đầu tiên của trang web để xem Nimo đang chặn cái gì
            const htmlSnippet = html.substring(0, 500).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return res.status(404).send(`<h3>Lỗi 404: Không tìm thấy dữ liệu.</h3><p>Nimo đã trả về nội dung sau (có thể bị chặn IP):</p><pre>${htmlSnippet}</pre>`);
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        // GIẢI MÃ MSTREAMPKG (HEX TO STRING)
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH THAM SỐ
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).send("Lỗi giải mã tham số luồng.");
        }

        // Chuyển từ giao thức HLS sang FLV
        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        
        // ==========================================
        // VÙNG SỬA ĐỔI: XỬ LÝ CHẤT LƯỢNG THÔNG MINH
        // ==========================================
        let defaultRatio = '2500'; // Mặc định 720p
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);
        if (ratioMatch) {
            defaultRatio = ratioMatch[1]; // Bắt mức chất lượng Nimo đang cấp
        }

        const q = req.query.q; 
        let ratio = defaultRatio; // Ưu tiên chất lượng từ Nimo, không ép 1080p nữa

        if (q === '1080') ratio = '6000';
        else if (q === '720') ratio = '2500';
        else if (q === '480') ratio = '1000';
        else if (q === '360') ratio = '500';

        const needwm = ratio === '6000' ? '0' : '1';
        // ==========================================

        // TẠO THAM SỐ GIẢ LẬP NGƯỜI DÙNG THẬT (Fix Buffering)
        const u = Math.floor(Math.random() * 1000000000000) + 1700000000000;
        const seqid = Math.floor(Math.random() * 4000000000000) + 3000000000000;
        const now = Date.now();

        // LẮP RÁP LINK .FLV HOÀN CHỈNH
        const finalUrl = `${domain}${id}.flv?ver=1` +
                         `&wsSecret=${wsSecret}` +
                         `&wsTime=${wsTime}` +
                         `&ctype=nimo_media_web` +
                         `&appid=${appid}` +
                         `&tp=${tp}` +
                         `&needwm=${needwm}` +
                         `&ratio=${ratio}` +
                         (ratio === '6000' ? '' : '&sphd=1') +
                         `&u=${u}` +
                         `&t=100` +
                         `&seqid=${seqid}` +
                         `&sdk_sid=${now}` +
                         `&a_block=0`;

        // TRẢ VỀ VIDEO TRỰC TIẾP
        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
