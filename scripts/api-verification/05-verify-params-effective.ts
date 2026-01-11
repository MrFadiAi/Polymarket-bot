/**
 * 详细验证 - 确认参数确实生效（不只是返回 200）
 */

const DATA_API = 'https://data-api.polymarket.com';

// 获取一个有活动的用户 - 从排行榜
async function getActiveUser(): Promise<string> {
  const resp = await fetch(`${DATA_API}/v1/leaderboard?limit=1`);
  const data = await resp.json() as Array<{ proxyWallet: string }>;
  return data[0]?.proxyWallet || '0x58c3f5d66c95d4c41b093fbdd2520e46b6c9de74';
}

interface ActivityItem {
  timestamp: number;
  [key: string]: unknown;
}

interface PositionItem {
  curCashPnl: number;
  [key: string]: unknown;
}

interface TradeItem {
  proxyWallet: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  // 1. 获取活跃用户
  const user = await getActiveUser();
  console.log('Testing with active user:', user);

  console.log('\n=== 1. 验证 offset 分页 ===');
  // 获取前5条
  const page1 = await fetch(`${DATA_API}/activity?user=${user}&limit=5`).then((r) =>
    r.json()
  ) as ActivityItem[];
  console.log('Page 1 (offset=0, limit=5):', page1.length, 'items');
  if (page1.length > 0) {
    console.log('  First item timestamp:', page1[0]?.timestamp);
  }

  // 获取 offset=5 的5条
  const page2 = await fetch(
    `${DATA_API}/activity?user=${user}&limit=5&offset=5`
  ).then((r) => r.json()) as ActivityItem[];
  console.log('Page 2 (offset=5, limit=5):', page2.length, 'items');
  if (page2.length > 0) {
    console.log('  First item timestamp:', page2[0]?.timestamp);
  }

  // 验证两页不重复
  if (page1.length > 0 && page2.length > 0) {
    const page1LastTs = page1[page1.length - 1]?.timestamp;
    const page2FirstTs = page2[0]?.timestamp;
    console.log('  Page1 last:', page1LastTs, '-> Page2 first:', page2FirstTs);
    console.log(
      '  ✅ Offset 验证:',
      page1LastTs !== page2FirstTs ? '不同数据，有效' : '⚠️ 可能重复'
    );
  }

  console.log('\n=== 2. 验证 start/end 时间过滤 ===');
  // 获取所有 (无时间过滤)
  const allActivity = await fetch(
    `${DATA_API}/activity?user=${user}&limit=20`
  ).then((r) => r.json()) as ActivityItem[];
  console.log('Without time filter:', allActivity.length, 'items');

  if (allActivity.length > 0) {
    const timestamps = allActivity.map((a) => a.timestamp);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    console.log(
      '  Time range:',
      new Date(minTs * 1000).toISOString(),
      'to',
      new Date(maxTs * 1000).toISOString()
    );

    // 用中间时间点过滤
    const midTs = Math.floor((minTs + maxTs) / 2);
    console.log(
      '  Mid timestamp:',
      midTs,
      '=',
      new Date(midTs * 1000).toISOString()
    );

    // start = midTs (只要之后的)
    const afterMid = await fetch(
      `${DATA_API}/activity?user=${user}&limit=20&start=${midTs}`
    ).then((r) => r.json()) as ActivityItem[];
    console.log('  With start=' + midTs + ':', afterMid.length, 'items');

    // end = midTs (只要之前的)
    const beforeMid = await fetch(
      `${DATA_API}/activity?user=${user}&limit=20&end=${midTs}`
    ).then((r) => r.json()) as ActivityItem[];
    console.log('  With end=' + midTs + ':', beforeMid.length, 'items');

    console.log(
      '  ✅ Time filter 验证:',
      afterMid.length < allActivity.length ||
        beforeMid.length < allActivity.length
        ? '有效 (返回数量减少)'
        : '⚠️ 可能无效'
    );
  }

  console.log('\n=== 3. 验证 Positions 排序 ===');
  const positions = await fetch(`${DATA_API}/positions?user=${user}`).then((r) =>
    r.json()
  ) as PositionItem[];
  console.log('Positions count:', positions.length);

  if (positions.length > 1) {
    // 按 CASHPNL 排序
    const sortedAsc = await fetch(
      `${DATA_API}/positions?user=${user}&sortBy=CASHPNL&sortDirection=ASC`
    ).then((r) => r.json()) as PositionItem[];
    const sortedDesc = await fetch(
      `${DATA_API}/positions?user=${user}&sortBy=CASHPNL&sortDirection=DESC`
    ).then((r) => r.json()) as PositionItem[];

    if (sortedAsc.length > 0 && sortedDesc.length > 0) {
      console.log('  ASC first PnL:', sortedAsc[0]?.curCashPnl);
      console.log('  DESC first PnL:', sortedDesc[0]?.curCashPnl);
      console.log(
        '  ✅ Sort 验证:',
        sortedAsc[0]?.curCashPnl !== sortedDesc[0]?.curCashPnl
          ? '有效 (顺序不同)'
          : '⚠️ 可能无效'
      );
    }
  }

  console.log('\n=== 4. 验证 Value 端点 ===');
  const value = await fetch(`${DATA_API}/value?user=${user}`).then((r) =>
    r.json()
  ) as Record<string, unknown>;
  console.log('Value response:', JSON.stringify(value));
  console.log(
    '  ✅ Value 端点:',
    value && 'value' in value ? '有效' : '⚠️ 可能无效'
  );

  console.log('\n=== 5. 验证 Trades user 参数 ===');
  const trades = await fetch(`${DATA_API}/trades?user=${user}&limit=5`).then(
    (r) => r.json()
  ) as TradeItem[];
  console.log('Trades by user:', trades.length, 'items');
  if (trades.length > 0) {
    console.log('  First trade user:', trades[0]?.proxyWallet);
    console.log(
      '  ✅ Trades user 验证:',
      trades[0]?.proxyWallet?.toLowerCase() === user.toLowerCase()
        ? '有效 (用户匹配)'
        : '⚠️ 用户不匹配'
    );
  }

  console.log('\n✅ 验证完成');
}

main().catch(console.error);
