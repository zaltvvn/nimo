export default async function handler(req, res) {
    // Cấu hình CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const roomId = req.query.id || '879386692';
    const url = `https://m.nimo.tv/${roomId}`;

    try {
        // 1. Gọi đến trang Mobile Nimo
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
                'Accept-Encoding': 'gzip, deflate, br' // Yêu cầu nén để tăng tốc
            }
        });

        if (!response.ok) throw new Error('Không thể kết nối đến Nimo TV');
        const html = await response.text();

        // 2. Dùng Regex lọc dữ liệu JSON
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).json({ 
                success: false, 
                error: "Không tìm thấy dữ liệu phòng. IP có thể bị chặn hoặc kênh sai ID." 
            });
        }

        const data = JSON.parse(jsonMatch[1]);

        // 3. Kiểm tra trạng thái Live
        if (data.liveStreamStatus === 0) {
            return res.status(200).json({ success: false, error: "Kênh hiện đang Offline." });
        }

        // 4. Giải mã mStreamPkg (Hex to String)
        if (!data.mStreamPkg) {
            return res.status(404).json({ success: false, error: "Không thấy mStreamPkg." });
        }

        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // 5. Bóc tách tham số bằng Regex (Logic từ Streamlink)
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || '0';
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).json({ 
                success: false, 
                error: "Không thể bóc tách tham số từ gói giải mã.",
                debug: decodedPkg 
            });
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');

        // 6. Cấu hình chất lượng (q=720 hoặc mặc định 1080p)
        const ratio = req.query.q === '720' ? '2500' : '6000';
        const needwm = ratio === '6000' ? '0' : '1';
        const sphd = ratio === '6000' ? '' : '&sphd=1';

        // 7. Lắp link FLV
        const flvUrl = `${domain}${id}.flv?appid=${appid}&id=${id}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${sphd}`;

        return res.status(200).json({
            success: true,
            channel: data.nickname,
            game: data.game,
            title: data.title,
            quality: ratio === '6000' ? '1080p' : '720p',
            link: flvUrl
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}