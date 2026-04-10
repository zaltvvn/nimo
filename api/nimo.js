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
        
        if (!jsonMatch) {
            return res.status(404).send("Không tìm thấy dữ liệu phòng. Kiểm tra ID.");
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

        // 🟢 ĐIỂM CHẠM 1: Bắt tỷ lệ gốc do Nimo cấp
        const defaultRatio = decodedPkg.match(/ratio=(\d+)/)?.[1] || '2500';

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).send("Lỗi giải mã tham số luồng.");
        }

        // Chuyển từ giao thức HLS sang FLV
        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        
        // 🟢 ĐIỂM CHẠM 2: Sửa logic chất lượng (Không ép FHD nữa)
        const q = req.query.q; 
        let ratio = defaultRatio; // Mặc định lấy luồng gốc (Thường là 720p - cực mượt)

        if (q === '1080') ratio = '6000';
        else if (q === '720') ratio = '2500';
        else if (q === '480') ratio = '1000';
        else if (q === '360') ratio = '500';

        const needwm = ratio === '6000' ? '0' : '1';

        // TẠO THAM SỐ GIẢ LẬP NGƯỜI DÙNG THẬT
        const u = Math.floor(Math.random() * 1000000000000) + 1700000000000;
        const seqid = Math.floor(Math.random() * 4000000000000) + 3000000000000;
        const now = Date.now();

        // LẮP RÁP LINK .FLV HOÀN CHỈNH
        let finalUrl = `${domain}${id}.flv?ver=1` +
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

        // 🟢 ĐIỂM CHẠM 3: Hút sạch ký tự ẩn rác để chống sập Vercel (Lỗi Invalid header)
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        // TRẢ VỀ VIDEO TRỰC TIẾP
        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
