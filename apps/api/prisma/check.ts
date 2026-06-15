import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const wips = await prisma.wIP.findMany({
    include: {
      item: true,
    }
  });
  console.log('--- ALL WIP RECORDS IN DB ---');
  console.log(JSON.stringify(wips, null, 2));
  
  const uniqueLocations = await prisma.wIP.findMany({
    select: {
      location: true,
    },
    distinct: ['location'],
  });
  console.log('--- UNIQUE LOCATIONS IN DB ---');
  console.log(uniqueLocations);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
