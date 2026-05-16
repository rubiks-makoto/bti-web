// api/register.js
// LIFF経由で診断結果を受け取り、Vercel KV (Upstash Redis) に保存する
// + ホットリード判定して通知Botからプッシュ

import { calcHotLeadScore, sendHotLeadNotification } from './_notify-helper.js';

// ホットリード通知の閾値
const HOT_LEAD_THRESHOLD = 5;

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
    const { userId, type, pattern, gender, position, age, scores, displayName, salonWork } = req.body;

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

    // 保存データ（追加情報を含む）
    const data = JSON.stringify({
      type: type.toUpperCase(),
      pattern: parseInt(pattern, 10),
      gender: gender || 'A',
      position: position || null,
      age: age || null,
      salonWork: salonWork || null,
      scores: scores || null,
      displayName: displayName || null,
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

    // ===== ホットリード判定 =====
    // オーナー（position=E）は通知対象外
    if (position !== 'E') {
      const upperType = type.toUpperCase();
      const salesLv = scores ? (scores.S4>=1 ? 4 : scores.S3>=1 ? 3 : scores.S2>=1 ? 2 : 1) : 1;

      const scoreInfo = calcHotLeadScore({
        type: upperType,
        pattern: parseInt(pattern, 10),
        position,
        age,
        gender,
        scores
      });

      if (scoreInfo.score >= HOT_LEAD_THRESHOLD) {
        // ホットリードとして通知
        await sendHotLeadNotification(
          userId,
          { type: upperType, pattern: parseInt(pattern, 10), position, age, gender, displayName, salesLv },
          scoreInfo,
          '【診断完了タイミング】'
        );
      } else {
        console.log(`Not hot lead: score=${scoreInfo.score}, userId=${userId}`);
      }
    } else {
      console.log(`Owner (E), skipping hot lead check: ${userId}`);
    }

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
