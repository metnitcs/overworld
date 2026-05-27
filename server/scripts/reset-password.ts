import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.argv[2]
  const newPassword = process.argv[3]
  if (!username || !newPassword) {
    console.error('Usage: tsx scripts/reset-password.ts <username> <newPassword>')
    process.exit(1)
  }
  const hash = await bcrypt.hash(newPassword, 10)
  const updated = await prisma.user.update({
    where: { username },
    data: { password: hash },
    select: { id: true, username: true, role: true, status: true },
  })
  // Verify the hash works for the supplied password (defensive — bcrypt
  // round-trip safety against the wrong salt scheme).
  const ok = await bcrypt.compare(newPassword, hash)
  console.log(`✓ password reset for user '${updated.username}'`)
  console.log(`  id=${updated.id}  role=${updated.role}  status=${updated.status}`)
  console.log(`  bcrypt round-trip verify: ${ok ? 'OK' : 'FAIL'}`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
