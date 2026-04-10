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
            return res.status(404).send("Lỗi Vercel: Không tìm thấy dữ liệu phòng.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // ==========================================
        // 1. SỬA LỖI CHỮ "V" GÂY 403 FORBIDDEN
        // Chỉ bắt đoạn "https://al" hoặc "https://tx", sau đó tự ráp đuôi chuẩn
        // ==========================================
        const cdnMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3})\.hls\.nimo\.tv/);
        const baseUrl = cdnMatch ? cdnMatch[1] : 'https://al';
        const domain = `${baseUrl}.flv.nimo.tv/live/`; 

        // ==========================================
        // 2. GẮP CHÍNH XÁC TỪNG THÔNG SỐ (Không sót 1 chữ)
        // ==========================================
        const idMatch = decodedPkg.match(/id=([A-Za-z0-9_-]+)/);
        const wsSecretMatch = decodedPkg.match(/wsSecret=([A-Za-z0-9]+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=([A-Za-z0-9]+)/);
        const fmMatch = decodedPkg.match(/fm=([A-Za-z0-9%_-]+)/);
        const ctypeMatch = decodedPkg.match(/ctype=([A-Za-z0-9_-]+)/);
        const appidMatch = decodedPkg.match(/appid=(\d+)/);
        const tpMatch = decodedPkg.match(/tp=(\d+)/);
        const ratioMatch = decodedPkg.match(/ratio=(\d+)/);

        if (!idMatch || !wsSecretMatch) {
            return res.status(500).send("Lỗi: Không thể bóc tách ID hoặc wsSecret.");
        }

        const id = idMatch[1];
        const wsSecret = wsSecretMatch[1];
        const wsTime = wsTimeMatch ? wsTimeMatch[1] : '';
        const fm = fmMatch ? fmMatch[1] : '';
        const ctype = ctypeMatch ? ctypeMatch[1] : 'nimo_media_web';
        const appid = appidMatch ? appidMatch[1] : '81';
        const tp = tpMatch ? tpMatch[1] : Date.now().toString();
        let ratio = ratioMatch ? ratioMatch[1] : '2500';

        // ==========================================
        // 3. XỬ LÝ CHẤT LƯỢNG THÔNG MINH
        // ==========================================
        if (req.query.q) {
            const q = req.query.q;
            if (q === '1080') ratio = '6000';
            else if (q === '720') ratio = '2500';
            else if (q === '480') ratio = '1000';
            else if (q === '360') ratio = '500';
        }

        const needwm = ratio === '6000' ? '0' : '1';
        const sphd = ratio !== '6000' ? '&sphd=1' : '';

        // ==========================================
        // 4. RÁP LINK (An toàn tuyệt đối)
        // ==========================================
        let finalUrl = `${domain}${id}.flv?ver=1&id=${id}` +
                       `&wsSecret=${wsSecret}` +
                       (wsTime ? `&wsTime=${wsTime}` : '') +
                       (fm ? `&fm=${fm}` : '') +
                       (ctype ? `&ctype=${ctype}` : '') +
                       `&appid=${appid}` +
                       `&tp=${tp}` +
                       `&needwm=${needwm}` +
                       `&ratio=${ratio}${sphd}` +
                       `&u=0&t=100&a_block=0`;

        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
