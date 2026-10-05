import { createServer } from 'node:http'
import { createApp, createNodeHttpHandler } from './app.js'
import { createProductionAdviceService, createProductionTrainingPlannerService } from './composition.js'

const host = '127.0.0.1'
const port = Number(process.env.PORT ?? 8787)

const server = createServer(
  createNodeHttpHandler(createApp(createProductionAdviceService(process.env), createProductionTrainingPlannerService(process.env))),
)

server.listen(port, host, () => {
  console.log(`BrickPulse API listening on http://${host}:${port}`)
})
