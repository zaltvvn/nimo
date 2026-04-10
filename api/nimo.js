export default async function handler(req, res) {
    const roomId = req.query.id || '879386692';
    
    // Tự động nhận diện ID số thêm /live
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
            return res.status(404).send("Lỗi: Không tìm thấy dữ liệu phòng.");
        }

        const data = JSON.parse(jsonMatch[1]);
        if (data.liveStreamStatus === 0) {
            return res.status(200).send("Stream hiện đang Offline.");
        }

        // GIẢI MÃ
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // BÓC TÁCH DOMAIN VÀ ID
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z0-9]{2,3}\.hls[A-Za-z\.\/]+)/);
        const idMatch = decodedPkg.match(/id=([A-Za-z0-9_-]+)/);

        if (!domainMatch || !idMatch) {
            return res.status(500).send("Lỗi bóc tách Domain/ID.");
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        let id = idMatch[1];

        // 🟢 TUYỆT CHIÊU HÚT TRỌN Ổ (Bảo tồn 100% chữ ký fm và wsSecret)
        // Kéo dài lấy trọn vẹn chuỗi URL sạch, tự động dừng khi gặp ký tự rác nhị phân
        const queryMatch = decodedPkg.match(/(wsSecret=[A-Za-z0-9=&%_+\-/]+)/);
        
        if (!queryMatch) {
            return res.status(500).send("Lỗi: Không tìm thấy bộ tham số bảo mật của Nimo.");
        }

        let queryParams = queryMatch[1]; 
        // Lúc này queryParams đã ôm trọn: wsSecret=...&wsTime=...&fm=...&ctype=...&ratio=...

        // 🟢 ĐỔI CHẤT LƯỢNG (Chỉ đổi nếu bạn truyền ?q= vào URL)
        if (req.query.q) {
            const q = req.query.q;
            let newRatio = '2500';
            if (q === '1080') newRatio = '6000';
            else if (q === '720') newRatio = '2500';
            else if (q === '480') newRatio = '1000';
            else if (q === '360') newRatio = '500';

            let newNeedwm = newRatio === '6000' ? '0' : '1';

            // Ghi đè vào chuỗi zin
            if (queryParams.includes('ratio=')) {
                queryParams = queryParams.replace(/ratio=\d+/, `ratio=${newRatio}`);
            } else {
                queryParams += `&ratio=${newRatio}`;
            }

            if (queryParams.includes('needwm=')) {
                queryParams = queryParams.replace(/needwm=\d+/, `needwm=${newNeedwm}`);
            } else {
                queryParams += `&needwm=${newNeedwm}`;
            }

            if (newRatio !== '6000' && !queryParams.includes('sphd=')) {
                queryParams += "&sphd=1";
            }
        }

        // LẮP RÁP LINK HOÀN CHỈNH
        let finalUrl = `${domain}${id}.flv?ver=1&id=${id}&${queryParams}&u=0&t=100&a_block=0`;

        // Quét rác lần cuối chống sập Vercel
        finalUrl = finalUrl.replace(/[\r\n\s\0]+/g, '');

        res.setHeader('Cache-Control', 'no-cache');
        res.redirect(302, finalUrl);

    } catch (error) {
        res.status(500).send("Lỗi hệ thống: " + error.message);
    }
}
