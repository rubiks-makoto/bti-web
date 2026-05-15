// api/get-result.js
// KVからユーザーの診断結果を取得してレポートURLを返す

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    // KVからGET
    const kvResponse = await fetch(`${kvUrl}/get/bti:${userId}`, {
      headers: {
        Authorization: `Bearer ${kvToken}`
      }
    });

    if (!kvResponse.ok) {
      return res.status(404).json({ success: false, error: 'No result found' });
    }

    const kvData = await kvResponse.json();

    if (!kvData.result) {
      return res.status(404).json({ success: false, error: 'No result found' });
    }

    // kvData.resultはJSON文字列
    let data;
    try {
      data = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Invalid data format' });
    }

    const reportUrl = `https://bti-web.vercel.app/report.html?type=${data.type}&pattern=${data.pattern}`;

    return res.status(200).json({
      success: true,
      type: data.type,
      pattern: data.pattern,
      gender: data.gender || 'A',
      reportUrl: reportUrl
    });

  } catch (error) {
    console.error('Get result error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
