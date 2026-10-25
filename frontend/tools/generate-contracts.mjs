import fs from 'node:fs/promises'
import { compile } from 'json-schema-to-typescript'

const openapi = JSON.parse(
  await fs.readFile(new URL('../../contracts/openapi.json', import.meta.url), 'utf8'),
)
const definitions = JSON.parse(
  JSON.stringify(openapi.components.schemas).replaceAll('#/components/schemas/', '#/definitions/'),
)
for (const [name, schema] of Object.entries(definitions)) schema['x-model-name'] = name
const schema = {
  title: 'WireContracts',
  type: 'object',
  additionalProperties: false,
  'x-model-name': 'WireContracts',
  properties: Object.fromEntries(
    Object.keys(definitions).map((name) => [name, { $ref: '#/definitions/' + name }]),
  ),
  definitions,
}
const output = await compile(schema, 'WireContracts', {
  bannerComment: '/* Generated from contracts/openapi.json; run npm run contracts. */',
  customName: (schema) => schema['x-model-name'] || (schema.title ? 'Field' + schema.title : undefined),
  additionalProperties: false,
  style: { singleQuote: true, semi: false },
  maxItems: 0,
})
await fs.writeFile(new URL('../src/wire.ts', import.meta.url), output)
