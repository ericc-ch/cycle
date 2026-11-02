import { Console, Effect, FileSystem } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

const DATASET_URL =
  'https://raw.githubusercontent.com/chiomajaco6/MenstrualCyclePrediction/main/rawFedCycleData.csv'

const DATA_DIRECTORY = 'data'
const DESTINATION = `${DATA_DIRECTORY}/marquette-cycles.csv`
const EXPECTED_HEADER = 'ClientID'

const main = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const exists = yield* fileSystem.exists(DESTINATION)

  if (exists) {
    yield* Console.log(
      `${DESTINATION} is already here. Delete it to download again.`,
    )
    return
  }

  const text = yield* Effect.tryPromise(() =>
    fetch(DATASET_URL).then(response => response.text()),
  )

  if (
    !text.startsWith(EXPECTED_HEADER) &&
    !text.startsWith(`\uFEFF${EXPECTED_HEADER}`)
  ) {
    yield* Console.error(`Unexpected file from ${DATASET_URL}. Not saving it.`)
    return
  }

  yield* fileSystem.makeDirectory(DATA_DIRECTORY, { recursive: true })
  yield* fileSystem.writeFileString(DESTINATION, text)
  yield* Console.log(`Saved ${DESTINATION}.`)
  yield* Console.log(
    'Marquette/Fehring cycle data, for local scoring only. Do not redistribute.',
  )
})

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
