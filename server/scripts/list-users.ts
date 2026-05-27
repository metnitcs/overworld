import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true, username: true, email: true, role: true, status: true, createdAt: true,
      _count: { select: { characters: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${users.length} user(s) in DB. ADMIN_USERS env: ${process.env.ADMIN_USERS ?? '(unset)'}\n`)
  for (const u of users) {
    console.log(`  ${u.role.padEnd(5)}  ${u.status.padEnd(9)}  ${u.username.padEnd(30)}  chars=${u._count.characters}  created=${u.createdAt.toISOString().slice(0, 10)}`)
  }
  await prisma.$disconnect()
}

main()
