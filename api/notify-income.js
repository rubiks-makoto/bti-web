// api/notify-income.js
// 年収シミュレーター完了時にホットリード判定して通知

import { sendHotLeadNotification, TYPE_NAMES } from './_notify-helper.js';

const INCOME_HOT_LEAD_THRESHOLD = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, employ, shimei, free, diff } = req.body;

    if (!userId) {
      // userIdなしでも200を返す（フロント側はfire-and-forgetでOK）
      return res.status(200).json({ success: true, note: 'No userId, skipping' });
    }

    // KVからBTI診断データ取得
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      return res.status(200).json({ success: true });
    }

    let btiData = null;
    try {
      const kvResponse = await fetch(`${kvUrl}/get/bti:${userId}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      if (kvResponse.ok) {
        const kvJson = await kvResponse.json();
        if (kvJson.result) {
          btiData = typeof kvJson.result === 'string' ? JSON.parse(kvJson.result) : kvJson.result;
        }
      }
    } catch (e) {
      console.error('KV fetch error:', e);
    }

    // オーナーは通知対象外
    if (btiData && btiData.position === 'E') {
      console.log(`Owner used income sim, skipping notification: ${userId}`);
      return res.status(200).json({ success: true });
    }

    // ===== スコア計算 =====
    let score = 2; // 年収シミュ利用自体で+2
    const reasons = ['年収シミュ実行 (+2)'];

    if (diff && diff > 10) {
      score += 2;
      reasons.push(`月収差+${diff.toFixed(1)}万円 (+2)`);
    } else if (diff && diff > 3) {
      score += 1;
      reasons.push(`月収差+${diff.toFixed(1)}万円 (+1)`);
    }

    if (employ === 'seishain') {
      score += 1;
      reasons.push('正社員から検討中 (+1)');
    }

    if (btiData && (btiData.type === 'CONTRACT' || btiData.type === 'FREELANCE')) {
      score += 1;
      reasons.push('CONTRACT/FREELANCE型 (+1)');
    }

    if (btiData && btiData.scores && btiData.scores.MOVE >= 1) {
      score += 2;
      reasons.push('MOVE志向 (+2)');
    }

    const total = (parseFloat(shimei) || 0) + (parseFloat(free) || 0);
    if (total > 0 && total < 60) {
      score += 1;
      reasons.push('低売上 (+1)');
    }

    if (score < INCOME_HOT_LEAD_THRESHOLD) {
      console.log(`Income sim - Not hot lead: score=${score}`);
      return res.status(200).json({ success: true });
    }

    // 通知送信
    const extraInfo = `【年収シミュ使用】\n`
      + `現職: ${employ === 'seishain' ? '正社員' : employ === 'gyomu' ? '業務委託' : 'フリーランス'}\n`
      + `指名: ${shimei}万 / フリー: ${free || 0}万\n`
      + `月収差: +${diff ? diff.toFixed(1) : '?'}万`;

    const dataForNotify = btiData ? {
      type: btiData.type,
      pattern: btiData.pattern,
      position: btiData.position,
      age: btiData.age,
      gender: btiData.gender,
      displayName: btiData.displayName,
      salesLv: btiData.scores ? (btiData.scores.S4>=1 ? 4 : btiData.scores.S3>=1 ? 3 : btiData.scores.S2>=1 ? 2 : 1) : 1
    } : {
      type: 'unknown', pattern: 0, position: null, age: null, gender: null, displayName: null, salesLv: 0
    };

    await sendHotLeadNotification(userId, dataForNotify, { score, reasons }, extraInfo);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Notify-income error:', error);
    // エラーでも200返す（フロントのUXを邪魔しない）
    return res.status(200).json({ success: false });
  }
}
