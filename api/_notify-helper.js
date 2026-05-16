// api/_notify-helper.js
// ホットリード通知の共通ロジック

// タイプ名のマッピング
const TYPE_NAMES = {
  CONTRACT: '業務委託バランス型',
  TOP: '指名売上トップ型',
  STAR: 'SNS発信スター型',
  MANAGER: 'マネジメントリーダー型',
  EDU: '教育トレーナー型',
  MENTOR: 'メンター指導型',
  CRAFTER: '純粋技術追求職人型',
  FREELANCE: 'ソロ独立スタイリスト型',
  CREATOR: '世界観クリエイター型',
  NO2: '最強ストラテジスト参謀型',
  EXEC: '組織執行役員型',
  SOLO: '孤高の職人オーナー型',
  MICRO: '小規模プレイングオーナー型',
  MULTI: '多店舗展開オーナー型',
  SCALE: '多店舗拡大オーナー型',
  FC: 'フランチャイズリスク分散型'
};

const POSITION_NAMES = {
  A: 'アシスタント',
  B: 'スタイリスト',
  C: '店長',
  D: '幹部',
  E: 'オーナー'
};

const AGE_NAMES = {
  A: '24歳以下',
  B: '25-30歳',
  C: '31-35歳',
  D: '36-40歳',
  E: '41歳以上'
};

const SALES_NAMES = {
  S1: '月50万以下',
  S2: '月50-100万',
  S3: '月100-150万',
  S4: '月150万以上'
};

/**
 * 転職意欲スコアを計算
 * @param {Object} data - 診断データ
 * @returns {Object} - {score, reasons}
 */
export function calcHotLeadScore(data) {
  let score = 0;
  const reasons = [];
  const { type, pattern, position, age, gender, scores } = data;

  // ① 結果タイプによる加点
  if (type === 'CONTRACT' || type === 'FREELANCE') {
    score += 1;
    reasons.push(`結果がCONTRACT/FREELANCE系 (+1)`);
  }

  // ② MOVE志向（環境を変えたい）
  if (scores && scores.MOVE >= 1) {
    score += 2;
    reasons.push(`MOVE志向 (+2)`);
  }

  // ③ FREE志向（業務委託・フリーランス志向）
  if (scores && scores.FREE >= 2) {
    score += 1;
    reasons.push(`FREE志向強 (+1)`);
  }
  if (scores && scores.FREE >= 3) {
    score += 1;
    reasons.push(`FREE志向特強 (+1)`);
  }

  // ④ 売上低 × 中堅年齢（30歳以上で売上低い＝不満溜まってる可能性）
  const salesLv = scores ? (scores.S4>=1 ? 4 : scores.S3>=1 ? 3 : scores.S2>=1 ? 2 : 1) : 1;
  if ((age === 'C' || age === 'D' || age === 'E') && salesLv === 1) {
    score += 3;
    reasons.push(`30歳以上×売上S1 (+3)`);
  } else if ((age === 'C' || age === 'D' || age === 'E') && salesLv === 2) {
    score += 2;
    reasons.push(`30歳以上×売上S2 (+2)`);
  }

  // ⑤ アシスタント・スタイリストで売上S1（伸び悩み）
  if ((position === 'A' || position === 'B') && salesLv === 1 && (age === 'B' || age === 'C')) {
    score += 1;
    reasons.push(`若手×売上S1 (+1)`);
  }

  return { score, reasons };
}

/**
 * 通知Bot経由でMakotoにプッシュメッセージ送信
 */
export async function sendHotLeadNotification(userId, data, scoreInfo, extraInfo = '') {
  const accessToken = process.env.NOTIFY_LINE_ACCESS_TOKEN;
  const targetUserId = process.env.NOTIFY_LINE_USER_ID;

  if (!accessToken || !targetUserId) {
    console.log('Notify env vars not set, skipping notification');
    return;
  }

  const { type, pattern, position, age, gender, displayName, salesLv } = data;
  const typeName = TYPE_NAMES[type] || type;
  const positionName = POSITION_NAMES[position] || '-';
  const ageName = AGE_NAMES[age] || '-';
  const genderName = gender === 'B' ? '女性' : '男性';
  const salesName = SALES_NAMES['S' + salesLv] || '-';

  // スコア表示用
  const reasons = scoreInfo.reasons.join('\n  ・');

  const text = `🔥 ホットリード検出 (${scoreInfo.score}点)\n\n`
    + `━━━━━━━━━━\n`
    + `👤 ${displayName || '名前未取得'}\n`
    + `📋 ${typeName} P${pattern}\n`
    + `🏢 ${positionName}\n`
    + `🎂 ${ageName} / ${genderName}\n`
    + `💰 ${salesName}\n`
    + `━━━━━━━━━━\n\n`
    + `📊 スコア内訳:\n  ・${reasons}\n\n`
    + `${extraInfo}\n\n`
    + `UserID: ${userId}`;

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        to: targetUserId,
        messages: [{ type: 'text', text }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Notify send error:', err);
    } else {
      console.log(`Hot lead notification sent for ${userId} (score: ${scoreInfo.score})`);
    }
  } catch (e) {
    console.error('Notify exception:', e);
  }
}

export { TYPE_NAMES, POSITION_NAMES, AGE_NAMES, SALES_NAMES };
