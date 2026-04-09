export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let roomId = req.query.id || '15476973';
    
    // TỰ ĐỘNG FIX 404: 
    // Nếu roomId là số và chưa có chữ "live/", ta tự thêm vào.
    let path = roomId;
    if (!isNaN(roomId) && !roomId.includes('/')) {
        path = `live/${roomId}`;
    }
    
    const url = `https://m.nimo.tv/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.google.com/',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                error: `Nimo phản hồi lỗi ${response.status}`,
                debug_url: url 
            });
        }

        const html = await response.text();

        // Tìm G_roomBaseInfo
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).json({ 
                success: false, 
                error: "Không tìm thấy dữ liệu stream. Có thể kênh đang bảo trì hoặc đổi cấu trúc.",
                debug_url: url
            });
        }

        const data = JSON.parse(jsonMatch[1]);

        if (data.liveStreamStatus === 0) {
            return res.status(200).json({ success: false, error: "Kênh hiện đang Offline.", channel: data.nickname });
        }

        // Giải mã mStreamPkg (Hex -> String)
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // Regex lấy tham số như bản Streamlink Python
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || '0';
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).json({ success: false, error: "Lỗi giải mã gói dữ liệu.", debug: decodedPkg });
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        const ratio = req.query.q === '720' ? '2500' : '6000';
        const needwm = ratio === '6000' ? '0' : '1';

        const flvUrl = `${domain}${id}.flv?appid=${appid}&id=${id}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${ratio === '6000' ? '' : '&sphd=1'}`;

        return res.status(200).json({
            success: true,
            channel: data.nickname,
            title: data.title,
            game: data.game,
            link: flvUrl
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: "Lỗi kết nối Serverless: " + error.message });
    }
}
