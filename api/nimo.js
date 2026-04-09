export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const roomId = req.query.id || '15476973';
    const url = `https://m.nimo.tv/${roomId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.com/',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate', // Đã xóa dấu hai chấm dư ở đây!
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                error: `Nimo phản hồi lỗi ${response.status}` 
            });
        }

        const html = await response.text();

        // Tìm G_roomBaseInfo
        const jsonMatch = html.match(/<script>var G_roomBaseInfo = ({.*?});<\/script>/);
        if (!jsonMatch) {
            return res.status(404).json({ success: false, error: "Không tìm thấy dữ liệu luồng. Có thể bị Cloudflare chặn." });
        }

        const data = JSON.parse(jsonMatch[1]);

        if (data.liveStreamStatus === 0) {
            return res.status(200).json({ success: false, error: "Kênh đang Offline." });
        }

        // Giải mã mStreamPkg
        const decodedPkg = Buffer.from(data.mStreamPkg, 'hex').toString('utf-8');

        // Regex lấy tham số
        const appid = decodedPkg.match(/appid=(\d+)/)?.[1] || '81';
        const domainMatch = decodedPkg.match(/(https?:\/\/[A-Za-z]{2,3}\.hls[A-Za-z\.\/]+)(?:V|&)/);
        const id = decodedPkg.match(/id=([^|\\]+)/)?.[1];
        const tp = decodedPkg.match(/tp=(\d+)/)?.[1] || '0';
        const wsSecret = decodedPkg.match(/wsSecret=(\w+)/)?.[1];
        const wsTime = decodedPkg.match(/wsTime=(\w+)/)?.[1];

        if (!domainMatch || !id || !wsSecret) {
            return res.status(500).json({ success: false, error: "Lỗi Regex.", debug: decodedPkg });
        }

        let domain = domainMatch[1].replace('hls.nimo.tv', 'flv.nimo.tv');
        const ratio = req.query.q === '720' ? '2500' : '6000';
        const needwm = ratio === '6000' ? '0' : '1';

        const flvUrl = `${domain}${id}.flv?appid=${appid}&id=${id}&tp=${tp}&wsSecret=${wsSecret}&wsTime=${wsTime}&u=0&t=100&needwm=${needwm}&ratio=${ratio}${ratio === '6000' ? '' : '&sphd=1'}`;

        return res.status(200).json({
            success: true,
            channel: data.nickname,
            title: data.title,
            link: flvUrl
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
