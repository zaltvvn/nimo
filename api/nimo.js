export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Tự động nhận diện ID là số hay chữ
    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }
    
    const url = `https://m.nimo.tv/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                // Dùng User-Agent mobile để lấy data mStreamPkg chuẩn nhất
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        const html = await response.text();
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        
        if (!jsonMatch) {
            return res.status(404).send("Không tìm thấy dữ liệu stream.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Kênh hiện đang Offline.");
        }

        // GIẢI MÃ MSTREAMPKG (HEX TO STRING)
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH THAM SỐ GỐC
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || Date.now().toString();
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];
        const fm = decodedPkg.match(/fm=([^&|\\]+)/)?.[1];
        
        // Lấy Ratio mặc định từ gói tin (Đây là điểm mấu chốt để không bị ép FHD)
        const defaultRatio = decodedPkg.match(/ratio=(\d+)/)?.[1] || '2500';

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).send("Lỗi giải mã tham số.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        
        // XỬ LÝ CHẤT LƯỢNG THÔNG MINH
        // Nếu không truyền q, nó sẽ lấy defaultRatio (thường là 720p hoặc auto)
        const q = req.query.q;
        let ratio = defaultRatio; 

        if (q === '1080') ratio = '6000';
        else if (q === '720') ratio = '2500';
        else if (q === '480') ratio = '1000';
        else if (q === '360') ratio = '500';

        const needwm = ratio === '6000' ? '0' : '1';

        // GIẢ LẬP ĐỊNH DANH
        const u = "0"; // Khách vãng lai dùng 0 cho ổn định
        const seqid = Date.now().toString() + Math.floor(Math.random() * 1000);

        // LẮP RÁP LINK
        const finalUrl = `${domain}${id}.flv?ver=1` +
                         `&wsSecret=${wsSecret}` +
                         `&wsTime=${wsTime}` +
                         (fm ? `&fm=${fm}` : '') +
                         `&ctype=nimo_media_web` +
                         `&appid=${appid}` +
                         `&tp=${tp}` +
                         `&needwm=${needwm}` +
                         `&ratio=${ratio}` +
                         (ratio === '6000' ? '' : '&sphd=1') +
                         `&u=${u}` +
                         `&t=100` +
                         `&seqid=${seqid}` +
                         `&sdk_sid=${Date.now()}` +
                         `&a_block=0&dMod=mseh-0`;

        // CHUYỂN HƯỚNG
        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi: " + error.message);
    }
}
