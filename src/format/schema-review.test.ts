import { describe, expect, it } from 'vitest'
import { loadMboard } from './schema'

const retention = '"retention":{"keepAllNamed":true,"keepLastAuto":20,"decayBucketsHours":[1,6,24,168],"maxSnapshots":120,"maxHistoryRatio":3}'
const meta = '"createdAt":"2026-08-13T00:00:00.000Z","updatedAt":"2026-08-13T00:00:00.000Z","createdWith":{"version":"schema-review","commit":"hand-authored"}'

const mindMap = `{
  "format":"mboard","schemaVersion":1,
  "meta":{"id":"review-mindmap","title":"Hand-authored mind map",${meta},"profiles":["core","mindmap"]},
  "nodes":[
    {"id":"central","order":0,"kind":"text","parentId":null,"frame":{"x":0,"y":0,"w":180,"h":60,"rotation":0},"z":0,"style":{"color":"#111827","fill":null,"stroke":null},"content":{"text":"Research"},"profileData":{"mindmap":{"layout":"radial"}}},
    {"id":"branch","order":1,"kind":"sticky","parentId":null,"frame":{"x":220,"y":80,"w":160,"h":90,"rotation":0},"z":1,"style":{"color":"#FFD93D","fill":"#FFD93D","stroke":null},"content":{"text":"Evidence"},"profileData":{"mindmap":{"parent":"central","collapsed":false}}}
  ],
  "edges":[{"id":"mindmap-link","order":2,"kind":"connector","source":{"nodeId":"central","anchor":"auto"},"target":{"nodeId":"branch","anchor":"auto"},"style":{"color":"#374151","stroke":2,"arrowHead":"none"},"content":{"label":"supports"},"profileData":{"mindmap":{"relationship":"branch"}}}],
  "profileConfig":{"mindmap":{"defaultLayout":"radial"}},"history":{"yjsState":null,"snapshots":[],${retention}},"assets":{}
}`

const eepc = `{
  "format":"mboard","schemaVersion":1,
  "meta":{"id":"review-eepc","title":"Hand-authored eEPC",${meta},"profiles":["core","eepc"]},
  "nodes":[
    {"id":"event-start","order":0,"kind":"circle","parentId":null,"frame":{"x":0,"y":0,"w":80,"h":80,"rotation":0},"z":0,"style":{"color":"#059669","fill":null,"stroke":2},"content":{"text":"Order received"},"profileData":{"eepc":{"symbol":"event"}}},
    {"id":"function-check","order":1,"kind":"rect","parentId":null,"frame":{"x":160,"y":0,"w":160,"h":80,"rotation":0},"z":1,"style":{"color":"#2563EB","fill":null,"stroke":2},"content":{"text":"Check order"},"profileData":{"eepc":{"symbol":"function","role":"sales"}}}
  ],
  "edges":[{"id":"control-flow","order":2,"kind":"connector","source":{"nodeId":"event-start","anchor":"auto"},"target":{"nodeId":"function-check","anchor":"auto"},"style":{"color":"#374151","stroke":2,"arrowHead":"triangle"},"profileData":{"eepc":{"relation":"controlFlow"}}}],
  "profileConfig":{"eepc":{"notation":"eEPC"}},"history":{"yjsState":null,"snapshots":[],${retention}},"assets":{}
}`

describe('pre-freeze hand-authored schema review', () => {
  it('expresses a mind-map without adding a core field', () => {
    expect(loadMboard(mindMap)).toMatchObject({ ok: true })
  })

  it('expresses an eEPC without adding a core field', () => {
    expect(loadMboard(eepc)).toMatchObject({ ok: true })
  })
})
