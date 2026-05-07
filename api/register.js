// api/register.js
// LIFF経由で診断結果を受け取り、Vercel KV (Upstash Redis) に保存する

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { userId, type, pattern } = req.body;
    
    if (!userId || !type || !pattern) {
      return res.status(400).json({ error: 'Missing required fields: userId, type, pattern' });
    }
    
    // Vercel KV (Upstash Redis) REST API でデータ保存
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    
    if (!kvUrl || !kvToken) {
      console.error('KV environment variables not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // キー: bti:{userId}, 値: {type, pattern, timestamp}
    const data = JSON.stringify({
      type: type.toUpperCase(),
      pattern: parseInt(pattern, 10),
      registeredAt: new Date().toISOString()
    });
    
    // SET コマンド（有効期限: 90日）
    const kvResponse = await fetch(`${kvUrl}/set/bti:${userId}/${encodeURIComponent(data)}/EX/7776000`, {
      headers: {
        Authorization: `Bearer ${kvToken}`
      }
    });
    
    if (!kvResponse.ok) {
      const errText = await kvResponse.text();
      console.error('KV error:', errText);
      return res.status(500).json({ error: 'Failed to save data' });
    }
    
    console.log(`Registered: ${userId} -> ${type} pattern ${pattern}`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Registration successful',
      reportUrl: `https://bti-web.vercel.app/report.html?type=${type.toUpperCase()}&pattern=${pattern}`
    });
    
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
