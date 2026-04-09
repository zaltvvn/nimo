export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // --- FIX 404: Logic nhận diện đường dẫn chuẩn ---
    // 1. Nếu ID chỉ gồm số -> Thường là ID phòng (Cần /live/)
    // 2. Nếu ID có chữ -> Thường là Username (Không cần /live/)
    let path = roomId;
    const isNumericId = /^\d+$/.test(roomId);
    if (isNumericId) {
        path = `live/${roomId}`;
    }

    const url = `https://m.nimo.tv/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.com/'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send(`Nimo trả về lỗi ${response.status} cho đường dẫn: ${url}`);
        }

        const html = await response.text();

        // --- FIX REGEX: Cải tiến để tránh trượt dữ liệu ---
        // Thêm khoảng trắng linh hoạt \s* để tránh Nimo đổi định dạng code
        const jsonMatch = html.match(/var\s+G_roomBaseInfo\s*=\s*({.*?});/);
        
        if (!jsonMatch) {
            // Nếu không tìm thấy biến, có thể Nimo đang chặn IP hoặc đổi tên biến
            return res.status(404).send(`Không tìm thấy dữ liệu stream. URL thử nghiệm: ${url}`);
        }

        const data = JSON.parse(jsonMatch[1]);
        
        // Kiểm tra Live
        if (data.liveStreamStatus === 0) {
            return res.status(200).send(`Kênh ${data.nickname || roomId} đang Offline.`);
        }

        // GIẢI MÃ VÀ LẤY THAM SỐ GỐC (Smart Quality)
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');
        const defaultRatio = decodedPkg.match(/ratio=(\d+)/)?.[1] || '2500';
        
        // Bóc tách các tham số bảo mật
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const streamId = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];
        const fm = decodedPkg.match(/fm=([^&|\\]+)/)?.[1];

        if (!domainMatch || !streamId || !wsSecret) {
            return res.status(500).send("Không bóc tách được mã bảo mật. Nimo có thể đã đổi cấu trúc gói tin.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        
        // Chất lượng: Ưu tiên q của người dùng, không có thì lấy mặc định (Smart Quality)
        const q = req.query.q;
        let ratio = defaultRatio;
        if (q === '1080') ratio = '6000';
        else if (q === '720') ratio = '2500';
        else if (q === '480') ratio = '1000';

        const needwm = ratio === '6000' ? '0' : '1';
        const finalUrl = `${domain}${streamId}.flv?ver=1&wsSecret=${wsSecret}&wsTime=${wsTime}${fm ? `&fm=${fm}` : ''}&ctype=nimo_media_web&appid=${appid}&tp=${Date.now()}&needwm=${needwm}&ratio=${ratio}${ratio === '6000' ? '' : '&sphd=1'}&u=0&t=100&sv=2601201119&a_block=0`;

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi: " + error.message);
    }
}
