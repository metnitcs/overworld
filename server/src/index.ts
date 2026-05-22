import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { buildServer } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  console.error('JWT_SECRET environment variable is required (see server/.env.example)')
  process.exit(1)
}

const prisma = new PrismaClient()
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:5173']
const adminUsers = (process.env.ADMIN_USERS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const app = buildServer({ prisma, jwtSecret, corsOrigin, adminUsers })

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

app
  .listen({ port, host })
  .then(() => console.log(`asura-server listening on http://${host}:${port}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
