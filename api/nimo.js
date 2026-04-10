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
            return res.status(404).send("Lỗi Vercel: Không tìm thấy dữ liệu phòng.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        // Dữ liệu gốc chứa rất nhiều ký tự rác nhị phân tàng hình
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // ==========================================
        // BỘ LỌC KIM CƯƠNG: CHỈ BẮT CHỮ VÀ SỐ, ÉP VĂNG MỌI RÁC NHỊ PHÂN
        // ==========================================
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        
        // ID: Chỉ lấy chữ và số
        const idMatch = decodedPkg.match(/id=([a-zA-Z0-9]+)/);
        // Chìa khóa: Chỉ lấy mã Hex
        const wsSecretMatch = decodedPkg.match(/wsSecret=([a-f0-9]+)/);
        const wsTimeMatch = decodedPkg.match(/wsTime=([a-f0-9]+)/);
        
        // Chữ ký fm: Chỉ lấy Base64 url-encoded (chữ, số, %, _, -, +, =)
        const fmMatch = decodedPkg.match(/fm=([a-zA-Z0-9%_+\-=]+)/);
        const fm = fmMatch ? `&fm=${fmMatch[1]}` : '';

        // Tên miền: Bắt cực chuẩn xác
        const cdnMatch = decodedPkg.match(/(https?:\/\/[a-zA-Z0-9-]+\.hls\.nimo\.tv)/);
        
        if (!idMatch || !wsSecretMatch || !wsTimeMatch) {
            return res.status(500).send("Lỗi: Không tìm thấy tham số xác thực cốt lõi.");
        }

        const id = idMatch[1];
        const wsSecret = wsSecretMatch[1];
        const wsTime = wsTimeMatch[1];
        const domain = cdnMatch ? cdnMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv') + '/live/' : 'https://al.flv.nimo.tv/live/';

        // ==========================================
        // XỬ LÝ CHẤT LƯỢNG (TỰ ĐỘNG LẤY GỐC ĐỂ CHỐNG LAG)
        // ==========================================
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

        // Tạo thông số giả lập
        const u = Math.floor(Math.random() * 1000000000000) + 1700000000000;
        const seqid = Math.floor(Math.random() * 4000000000000) + 3000000000000;
        const now = Date.now();

        // ==========================================
        // LẮP RÁP LINK: TUYỆT ĐỐI KHÔNG CÓ "&id=" Ở GIỮA LINK NỮA
        // ==========================================
        let finalUrl = `${domain}${id}.flv?ver=1` +
                         `&wsSecret=${wsSecret}` +
                         `&wsTime=${wsTime}` +
                         fm +
                         `&ctype=nimo_media_web` +
                         `&appid=${appid}` +
                         `&tp=${tp}` +
                         `&needwm=${needwm}` +
                         `&ratio=${ratio}` +
                         sphd +
                         `&u=${u}` +
                         `&t=100` +
                         `&seqid=${seqid}` +
                         `&sdk_sid=${now}` +
                         `&a_block=0`;

        // Quét rác tàng hình
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
