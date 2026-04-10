export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Tự động nhận diện ID để thêm /live
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
            return res.status(404).send("Lỗi Vercel: Không tìm thấy HTML.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH CHUẨN FORM STREAMLINK PYTHON
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        
        const idMatch = decodedPkg.match(/id=([a-zA-Z0-9_-]+)/);
        const wsSecretMatch = decodedPkg.match(/wsSecret=([a-f0-9]+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=([a-f0-9]+)/);
        const fmMatch = decodedPkg.match(/fm=([a-zA-Z0-9%_+\-=]+)/);
        
        const cdnMatch = decodedPkg.match(/(https?:\/\/[a-zA-Z0-9-]+\.hls\.nimo\.tv)/);

        if (!idMatch || !wsSecretMatch || !wsTimeMatch) {
            return res.status(500).send("Lỗi: Không tìm thấy tham số xác thực cốt lõi.");
        }

        const id = idMatch[1];
        const wsSecret = wsSecretMatch[1];
        const wsTime = wsTimeMatch[1];
        const fm = fmMatch ? `&fm=${fmMatch[1]}` : '';
        const domain = cdnMatch ? cdnMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv') + '/live/' : 'https://al.flv.nimo.tv/live/';

        // XỬ LÝ CHẤT LƯỢNG (Chống lag)
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
        const sphd = ratio === '6000' ? '' : '&sphd=1';

        // LẮP RÁP Y HỆT CẤU TRÚC PYTHON (Bỏ qua các biến rác ctype)
        let finalUrl = `${domain}${id}.flv?appid=${appid}&id=${id}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}${fm}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}&a_block=0`;

        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        // ==========================================
        // CÁC HEADER SỐNG CÒN DÀNH CHO LOCALHOST / WEB PLAYER
        // ==========================================
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Referrer-Policy', 'no-referrer'); // <-- "Tàng hình" trước Nimo Tengine
        res.setHeader('Cache-Control', 'no-cache');

        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
