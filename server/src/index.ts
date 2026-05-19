import { buildServer } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildServer()

app
  .listen({ port, host })
  .then(() => console.log(`asura-server listening on http://${host}:${port}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
