import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createApp, createNodeHttpHandler } from './app.js'
import { createProductionAdviceService, createProductionTrainingPlannerService } from './composition.js'
import { createProductionHttpHandler } from './production-server.js'

const host = '127.0.0.1'
const port = Number(process.env.PORT ?? 8787)

const apiHandler = createNodeHttpHandler(createApp(createProductionAdviceService(process.env), createProductionTrainingPlannerService(process.env)))
const server = createServer(createProductionHttpHandler(apiHandler, resolve(process.cwd(), 'dist')))

server.listen(port, host, () => {
  console.log(`BrickPulse API listening on http://${host}:${port}`)
})
