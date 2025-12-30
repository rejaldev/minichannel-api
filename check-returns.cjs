const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const returns = await p.return.findMany({
    where: { status: 'PENDING' },
    select: { id: true, returnNo: true, status: true }
  });
  console.log('PENDING returns:', JSON.stringify(returns, null, 2));
  
  const all = await p.return.findMany({
    select: { id: true, returnNo: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('\nRecent 5 returns:', JSON.stringify(all, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
