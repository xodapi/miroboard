# Phase 2: Mindmap & Digital Gardens Architecture

**Status:** Planning  
**Target:** Q4 2026 - Q1 2027  
**Version:** 1.0  
**Last Updated:** 2024

---

## 1. Vision

### What Are These Modes?

**Mindmap Mode** transforms MiroBoard into a visual thinking tool where hierarchical ideas branch from a central concept. Each node becomes a container for rich content (Markdown, attachments), enabling users to explore complex topics through spatial organization.

**Digital Gardens Mode** reimagines MiroBoard as a personal knowledge base—a wiki-like environment where pages interconnect through bidirectional links. It emphasizes discovery, growth, and non-linear navigation of ideas.

### Why Add Them to MiroBoard?

1. **Unified Workspace**: Users manage BPMN processes, brainstorm ideas (mindmaps), and document knowledge (gardens) in one offline-first tool.

2. **Leverage Existing Infrastructure**: Phase 1's offline-first architecture, history/checkpoint system, and file-based storage (.mboard) provide a robust foundation.

3. **Differentiation**: Most mindmap/wiki tools require cloud accounts. MiroBoard's offline-first approach fills a privacy-conscious niche.

4. **Natural Evolution**: BPMN is structured process thinking; mindmaps are creative thinking; digital gardens are knowledge management. Together, they cover the full thinking spectrum.

5. **Cross-Pollination**: Users can reference BPMN processes from garden pages, embed mindmap summaries in wiki documentation, or export process analyses to structured notes.

---

## 2. Mindmap Mode

### 2.1 Features

#### Core Visualization
- **Layout Styles**: 
  - Radial (default): Central node with branches radiating outward
  - Tree (horizontal/vertical): Traditional org-chart style
  - Free-form: Manual node positioning with connections
- **Node Interaction**:
  - Single-click: Select node
  - Double-click: Open editor panel
  - Drag: Reposition (free-form mode) or reorder siblings
  - Right-click: Context menu (add child, delete, style)
- **Branch Controls**:
  - Collapse/expand indicators on parent nodes
  - Collapse state persists in .mboard file
  - Keyboard shortcuts: `Space` = toggle, `Tab` = add child, `Enter` = add sibling

#### Node Content System
Each node contains:

```
Node {
  id: uuid
  title: string (plain text, 1-80 chars)
  content: string (Markdown, 0-10,000 chars)
  attachments: Attachment[]
  style: NodeStyle
  collapsed: boolean
  position?: {x, y} // For free-form mode
  children: uuid[]
}

Attachment {
  id: uuid
  filename: string
  mimeType: string
  data: base64 | blobRef
  size: number
  uploadedAt: timestamp
}

NodeStyle {
  backgroundColor: string
  textColor: string
  borderColor: string
  icon?: string // emoji or icon identifier
}
```

#### Editor Panel
- **Sliding Panel** (right side, 400px width):
  - Header: Node title (editable inline)
  - Tabs: "Edit" | "Preview" | "Attachments"
  - **Edit Tab**: Markdown editor with toolbar (bold, italic, lists, code, links)
  - **Preview Tab**: Rendered Markdown with syntax highlighting
  - **Attachments Tab**: Drag-drop zone, file list with delete/download
- **Markdown Features**:
  - CommonMark syntax
  - Code blocks with language detection
  - Task lists (`- [ ]`)
  - Tables
  - Links to external URLs (no auto-linking to other nodes—reserved for Gardens)

#### Export
- **Markdown Hierarchy Export**:
  ```
  # Root Node Title
  Root node content...
  
  ## Child 1 Title
  Child 1 content...
  
  ### Grandchild 1.1 Title
  Grandchild content...
  
  ## Child 2 Title
  ...
  ```
- **PDF Export**: Rendered tree diagram + content outline (Phase 2.2)
- **Image Export**: SVG/PNG snapshot of visual tree

### 2.2 Architecture

#### Data Model
Store mindmap in `.mboard` file as a new `MindmapDocument` type:

```typescript
interface MindmapDocument {
  type: "mindmap"
  version: "2.0"
  rootNodeId: string
  nodes: Map<string, MindmapNode>
  layoutConfig: LayoutConfig
  viewState: {
    zoom: number
    pan: {x: number, y: number}
    selectedNodeId?: string
  }
}

interface LayoutConfig {
  type: "radial" | "tree-horizontal" | "tree-vertical" | "free-form"
  radialConfig?: {
    angleSpacing: number
    levelSpacing: number
  }
  treeConfig?: {
    nodeSpacing: number
    levelSpacing: number
  }
}
```

**Y.js Integration** (for CRDT-based history):
```typescript
// Yjs structure
const yMindmap = yDoc.getMap("mindmap")
yMindmap.set("rootNodeId", rootId)
yMindmap.set("nodes", new Y.Map()) // uuid -> Node
yMindmap.set("layoutConfig", layoutConfigObj)
```

#### Rendering Approach

**Hybrid: SVG for graph, React for UI overlays**

```
┌─────────────────────────────────────────────────┐
│ MindmapCanvas (React)                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ SVG Layer (d3.js for layout)                │ │
│ │   - Edges (paths)                           │ │
│ │   - Node shapes (rects/circles)             │ │
│ │   - Text labels (title only)                │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ React Overlay Layer                         │ │
│ │   - Collapse/expand buttons                 │ │
│ │   - Selection highlights                    │ │
│ │   - Context menus                           │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ EditorPanel (React, conditional render)     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Why SVG?**
- Scalable zoom (no pixelation)
- Efficient for large graphs (1000+ nodes)
- Direct DOM access for d3.js layout algorithms
- Easy export to SVG file

**Why Not Canvas?**
- Harder to overlay React UI components
- More complex hit detection
- No built-in accessibility

#### Markdown Editor Integration

**Recommendation: CodeMirror 6**

| Option       | Pros                                      | Cons                              |
|--------------|-------------------------------------------|-----------------------------------|
| SimpleMDE    | Lightweight, easy setup                   | Abandoned (last update 2018)      |
| CodeMirror 6 | Modern, extensible, offline, small bundle | Requires custom Markdown mode     |
| Monaco       | VSCode quality, feature-rich              | Large bundle (400KB+), overkill   |
| Textarea+MD  | Minimal                                   | Poor UX (no syntax highlighting)  |

**Implementation**:
```typescript
import { EditorView, basicSetup } from "codemirror"
import { markdown } from "@codemirror/lang-markdown"

const editor = new EditorView({
  extensions: [
    basicSetup,
    markdown(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        saveNodeContent(currentNodeId, update.state.doc.toString())
      }
    })
  ],
  parent: editorContainer
})
```

**Preview Rendering**: Use `marked` library (39KB) with `DOMPurify` for XSS protection.

#### Attachment Storage

**Strategy: Base64-encode small files, blob store for large files**

```typescript
const MAX_INLINE_SIZE = 100 * 1024 // 100KB

async function storeAttachment(file: File): Promise<Attachment> {
  const buffer = await file.arrayBuffer()
  
  if (buffer.byteLength <= MAX_INLINE_SIZE) {
    return {
      id: uuid(),
      filename: file.name,
      mimeType: file.type,
      data: arrayBufferToBase64(buffer),
      size: buffer.byteLength,
      uploadedAt: Date.now()
    }
  } else {
    // Store in Y.Doc blob area
    const blobRef = yDoc.getArray("blobs").push([buffer])[0]
    return {
      id: uuid(),
      filename: file.name,
      mimeType: file.type,
      data: `blob:${blobRef}`,
      size: buffer.byteLength,
      uploadedAt: Date.now()
    }
  }
}
```

**Rationale**:
- Small files (images, text) inline → easier history/checkpoints
- Large files (videos, PDFs) in blob store → keep .mboard manageable
- Max .mboard size target: 50MB (warn user at 40MB)

#### Layout Algorithm

**Phase 2.1: Use d3-hierarchy + d3-force**

**Radial Layout**:
```typescript
import { hierarchy, tree } from "d3-hierarchy"

function layoutRadial(rootNode: MindmapNode, nodes: Map<string, MindmapNode>) {
  const root = hierarchy(rootNode, (d) => 
    d.children.map(id => nodes.get(id)).filter(Boolean)
  )
  
  const treeLayout = tree<MindmapNode>()
    .size([2 * Math.PI, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth)
  
  treeLayout(root)
  
  // Convert polar to cartesian
  root.each((node) => {
    const angle = node.x
    const radius = node.y
    node.x = radius * Math.cos(angle)
    node.y = radius * Math.sin(angle)
  })
  
  return root
}
```

**Tree Layout** (horizontal/vertical):
```typescript
const treeLayout = tree<MindmapNode>()
  .size([height, width])
  .nodeSize([nodeWidth + spacing, nodeHeight + spacing])
```

**Free-form Mode**: No automatic layout; positions stored in node data.

**Performance**: Layout recalculates only when:
- Node added/removed
- Collapse/expand toggled
- Layout type changed

Cache layout results in component state.

---

## 3. Digital Gardens Mode

### 3.1 Features

#### Page System
- **Page Structure**:
  - Title (plain text, required)
  - Markdown content (unlimited)
  - Attachments
  - Metadata: tags, created date, modified date
  - Aliases (alternative titles for linking)
- **Navigation**:
  - **Sidebar** (left, 250px): Alphabetical page list with search filter
  - **Breadcrumbs**: Show navigation history (back/forward buttons)
  - **Quick Switcher**: `Ctrl+K` opens fuzzy search modal
- **Link Syntax**:
  - `[[Page Title]]` → Wikilink (auto-completes from page list)
  - `[[Page Title|Display Text]]` → Wikilink with custom text
  - `[[Page Title#Heading]]` → Link to specific heading
  - `#tag` → Tag (indexed for filtering)

#### Backlinks System
- **Automatic Indexing**: When a page contains `[[Target]]`, index bidirectional link
- **Backlinks Panel** (bottom of page): "Linked References" section shows all pages linking to current page
- **Unlinked Mentions**: Show pages mentioning current page title (without explicit link)

Example:
```
Page: "React Hooks"
Content: "...see [[useState]] for state management..."

---
On "useState" page, Backlinks Panel shows:
  Linked References (1):
    - React Hooks: "...see useState for state management..."
```

#### Graph View
- **Modes**:
  - **Local Graph**: Current page + immediate neighbors (1-hop)
  - **Global Graph**: All pages + links
- **Visualization**: Force-directed graph (d3-force)
  - Nodes: Pages (size = number of backlinks)
  - Edges: Links between pages
  - Colors: By tag clusters
  - Interaction: Click node → navigate to page, hover → show preview tooltip
- **Filters**: Show/hide by tag, search results, orphaned pages

#### Search
- **Full-Text Search**: Search page titles + content
- **Tag Filter**: Click tag → show all pages with that tag
- **Index**: Client-side inverted index (built on load, updated on edit)
- **Results**: Show title, matched snippet with highlighting, relevance score

#### Export
- **Static HTML Wiki**: Generate self-contained website
  - Single HTML files per page
  - Navigation sidebar
  - Working internal links
  - Embedded CSS (no external dependencies)
  - Attachments copied to `/assets` folder
- **Markdown Export**: Zip file with all pages as `.md` files

### 3.2 Architecture

#### Data Model

```typescript
interface GardenDocument {
  type: "garden"
  version: "2.0"
  pages: Map<string, Page>
  linkIndex: Map<string, LinkEntry[]>  // Target page ID -> links to it
  tagIndex: Map<string, string[]>      // Tag -> page IDs
  searchIndex: InvertedIndex
}

interface Page {
  id: string
  title: string
  aliases: string[]
  content: string  // Markdown with [[wikilinks]]
  attachments: Attachment[]
  tags: string[]
  createdAt: timestamp
  modifiedAt: timestamp
}

interface LinkEntry {
  sourcePageId: string
  targetPageId: string
  targetTitle: string  // Preserve title at link time (for broken link detection)
  contextSnippet: string  // Surrounding text for backlink preview
}

interface InvertedIndex {
  terms: Map<string, PostingList>
  // term -> [{ pageId, positions: [5, 42, ...], tf-idf score }]
}
```

#### Link Parsing and Backlink Indexing

**Parser**: Use regex + AST traversal

```typescript
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function parseLinks(content: string): ParsedLink[] {
  const links: ParsedLink[] = []
  let match: RegExpExecArray | null
  
  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    const targetTitle = match[1].trim()
    const displayText = match[2]?.trim() || targetTitle
    const startPos = match.index
    const endPos = startPos + match[0].length
    
    // Extract context snippet (50 chars before/after)
    const contextStart = Math.max(0, startPos - 50)
    const contextEnd = Math.min(content.length, endPos + 50)
    const contextSnippet = content.slice(contextStart, contextEnd)
    
    links.push({
      targetTitle,
      displayText,
      contextSnippet,
      position: startPos
    })
  }
  
  return links
}

function rebuildLinkIndex(pages: Map<string, Page>): Map<string, LinkEntry[]> {
  const index = new Map<string, LinkEntry[]>()
  
  for (const [pageId, page] of pages) {
    const links = parseLinks(page.content)
    
    for (const link of links) {
      // Find target page (by title or alias)
      const targetPage = findPageByTitleOrAlias(pages, link.targetTitle)
      if (!targetPage) continue  // Broken link
      
      const entry: LinkEntry = {
        sourcePageId: pageId,
        targetPageId: targetPage.id,
        targetTitle: link.targetTitle,
        contextSnippet: link.contextSnippet
      }
      
      if (!index.has(targetPage.id)) {
        index.set(targetPage.id, [])
      }
      index.get(targetPage.id)!.push(entry)
    }
  }
  
  return index
}
```

**Incremental Updates**: When page edited, only re-parse that page and update affected index entries (don't rebuild entire index).

#### Graph Layout

**Force-Directed Graph (d3-force)**:

```typescript
import { forceSimulation, forceLink, forceManyBody, forceCenter } from "d3-force"

function createGraphLayout(pages: Page[], links: LinkEntry[]) {
  const nodes = pages.map(p => ({
    id: p.id,
    title: p.title,
    group: p.tags[0] || "untagged",
    linkCount: calculateBacklinkCount(p.id, links)
  }))
  
  const edges = links.map(l => ({
    source: l.sourcePageId,
    target: l.targetPageId
  }))
  
  const simulation = forceSimulation(nodes)
    .force("link", forceLink(edges).id(d => d.id).distance(100))
    .force("charge", forceManyBody().strength(-300))
    .force("center", forceCenter(width / 2, height / 2))
  
  return { nodes, edges, simulation }
}
```

**Rendering**: SVG (same rationale as Mindmap) with WebGL fallback for 1000+ nodes (use `pixi.js`).

#### Search Implementation

**Inverted Index with TF-IDF**:

```typescript
interface PostingList {
  pageId: string
  positions: number[]  // Character positions of term in document
  termFrequency: number
}

function buildSearchIndex(pages: Map<string, Page>): InvertedIndex {
  const index = new Map<string, PostingList[]>()
  
  for (const [pageId, page] of pages) {
    const text = `${page.title} ${page.content}`.toLowerCase()
    const terms = tokenize(text)  // Split on whitespace, remove stopwords
    
    for (const [term, positions] of terms) {
      if (!index.has(term)) {
        index.set(term, [])
      }
      index.get(term)!.push({
        pageId,
        positions,
        termFrequency: positions.length
      })
    }
  }
  
  return { terms: index }
}

function search(query: string, index: InvertedIndex, pages: Map<string, Page>): SearchResult[] {
  const queryTerms = tokenize(query.toLowerCase())
  const scores = new Map<string, number>()
  
  for (const term of queryTerms.keys()) {
    const postings = index.terms.get(term) || []
    const idf = Math.log(pages.size / (postings.length || 1))
    
    for (const posting of postings) {
      const tfidf = posting.termFrequency * idf
      scores.set(posting.pageId, (scores.get(posting.pageId) || 0) + tfidf)
    }
  }
  
  // Sort by score, return top 50
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([pageId, score]) => ({
      page: pages.get(pageId)!,
      score,
      snippet: extractSnippet(pages.get(pageId)!.content, queryTerms)
    }))
}
```

**Optimization**: Store index in Y.Doc, rebuild only when pages change (debounce 500ms).

#### Navigation UI

```
┌────────────────────────────────────────────────────────────┐
│ Header: [MiroBoard] [Mode: Digital Garden ▼] [Graph] [⚙]  │
├──────────┬─────────────────────────────────────────────────┤
│          │ ┌─────────────────────────────────────────────┐ │
│ Sidebar  │ │ Page Title                                  │ │
│ ┌──────┐ │ │ ─────────────────────────────────────────── │ │
│ │Search│ │ │                                             │ │
│ └──────┘ │ │ Markdown content rendered here...           │ │
│          │ │                                             │ │
│ Pages:   │ │                                             │ │
│ • Home   │ │                                             │ │
│ • React  │ │                                             │ │
│ • TypeS…│ │ │                                             │ │
│ • Y.js   │ │                                             │ │
│          │ │                                             │ │
│ [+ New]  │ │ ─────────────────────────────────────────── │ │
│          │ │ Linked References (3)                       │ │
│          │ │ • Page A: "...mentioned in context..."      │ │
│          │ │ • Page B: "...another reference..."         │ │
│          │ └─────────────────────────────────────────────┘ │
└──────────┴─────────────────────────────────────────────────┘
```

**Graph View Modal** (fullscreen overlay):
- Canvas fills viewport
- Controls: Zoom, pan, filter panel, legend
- Close button (ESC key)

---

## 4. Shared Architecture Considerations

### 4.1 Mode Coexistence with BPMN

**Plugin-Based Architecture** (Phase 2.0 prerequisite):

```typescript
interface MiroBoardPlugin {
  id: string
  name: string
  icon: string
  documentType: "bpmn" | "mindmap" | "garden"
  
  // Factory functions
  createNewDocument(): Document
  loadDocument(data: any): Document
  
  // UI components
  EditorComponent: React.ComponentType<{document: Document}>
  ToolbarComponent: React.ComponentType<{document: Document}>
  
  // Capabilities
  exportFormats: ExportFormat[]
  importFormats: ImportFormat[]
}

// Registration
const pluginRegistry = new Map<string, MiroBoardPlugin>()
pluginRegistry.set("bpmn", BPMNPlugin)
pluginRegistry.set("mindmap", MindmapPlugin)
pluginRegistry.set("garden", GardenPlugin)
```

**Document Type Detection**:
```typescript
interface MBoardFile {
  version: "2.0"
  documentType: "bpmn" | "mindmap" | "garden"
  metadata: {
    created: timestamp
    modified: timestamp
    author?: string
  }
  history: Checkpoint[]
  data: BPMNDocument | MindmapDocument | GardenDocument
}
```

When opening `.mboard` file:
1. Parse `documentType` field
2. Load corresponding plugin
3. Render plugin's `EditorComponent`

### 4.2 Mode Switcher UI

**Options**:

**Option A: Dropdown in Header** (Recommended)
```
[MiroBoard] [Mode: BPMN ▼] [File] [Edit] [View]
             ├─ BPMN
             ├─ Mindmap
             └─ Digital Garden
```

**Option B: Sidebar Tabs**
```
[📊] BPMN
[🧠] Mindmap
[🌱] Garden
```

**Option C: Workspace Switcher** (Future: multi-document workspace)
```
[Workspace: Project X ▼]
  Documents:
    • process-flow.mboard (BPMN)
    • brainstorm.mboard (Mindmap)
    • wiki.mboard (Garden)
```

**Phase 2.1 Implementation**: Option A (simplest, consistent with current UI).

**Switching Behavior**:
- Switching modes **does not convert** document type
- User must explicitly export/import to transfer content between modes
- Prompt: "Create new Mindmap document?" when switching from BPMN → Mindmap

### 4.3 File Format Evolution

**V2 Schema** (backward compatible with V1):

```typescript
// V1 (Phase 1): BPMN-only
{
  version: "1.0",
  elements: [...],  // BPMN-specific
  history: [...]
}

// V2 (Phase 2): Multi-mode
{
  version: "2.0",
  documentType: "bpmn" | "mindmap" | "garden",
  metadata: {...},
  history: [...],
  data: {
    // Type-specific data
    ...
  }
}
```

**Migration Path**:
- V1 files auto-upgraded on open: `documentType = "bpmn"`, `data = { elements: [...] }`
- V2 files saved with new structure
- V1 readers ignore `documentType` field (graceful degradation)

### 4.4 History/Checkpoint Compatibility

**Challenge**: Different document types have different data structures.

**Solution**: Checkpoint system remains agnostic:

```typescript
interface Checkpoint {
  id: string
  timestamp: number
  message: string
  yDocSnapshot: Uint8Array  // Y.Doc snapshot (opaque binary)
}
```

- **BPMN**: Snapshot contains `Y.Array` of BPMN elements
- **Mindmap**: Snapshot contains `Y.Map` of nodes + config
- **Garden**: Snapshot contains `Y.Map` of pages + indexes

Each plugin handles its own Y.Doc structure. Core history system just stores/restores snapshots.

**Implication**: Can't checkpoint across document types (no "undo" when switching modes).

### 4.5 Performance Considerations

#### Large Mindmaps (1000+ nodes)
- **Rendering**: Virtualize off-screen nodes (don't render SVG elements)
- **Layout**: Incremental layout updates (only affected subtree)
- **Collapse**: Encourage users to collapse branches (default: auto-collapse at depth 4)
- **Warning**: Show notification at 500 nodes ("Performance may degrade")

#### Large Gardens (500+ pages)
- **Search Index**: Build incrementally (index new/modified pages only)
- **Graph View**: 
  - Lazy-load: Only render visible nodes (viewport culling)
  - LOD (Level of Detail): Simplify distant nodes (just circles, no labels)
  - WebGL fallback for 1000+ nodes
- **Sidebar**: Virtualized list (render only visible page titles)
- **Link Index**: Store in IndexedDB (don't keep all in memory)

#### File Size Management
- **Attachments**: Warn at 10MB per file, block at 50MB
- **Total .mboard size**: Warn at 40MB, suggest splitting gardens or archiving nodes
- **Compression**: Use gzip on .mboard save/load (reduce size 60-70%)

---

## 5. Implementation Roadmap

### Phase 2.0: Plugin Foundation (Q3 2026)
**Prerequisites for Mindmap & Garden modes**

**Duration**: 6 weeks

**Deliverables**:
- [ ] Plugin interface definition (`MiroBoardPlugin` type)
- [ ] Plugin registry and loader
- [ ] Refactor BPMN editor into `BPMNPlugin`
- [ ] V2 file format with `documentType` field
- [ ] V1 → V2 migration logic
- [ ] Mode switcher UI (dropdown in header)
- [ ] Plugin-aware history system

**Breaking Changes**: None (V1 files auto-migrate)

**Risks**:
- Refactoring BPMN into plugin may introduce regressions → Extensive testing
- Plugin interface may need revision after Mindmap implementation → Keep flexible

---

### Phase 2.1: Mindmap Mode (Q4 2026)
**MVP: Radial layout, Markdown editor, export**

**Duration**: 8 weeks

#### Sprint 1-2: Core Data Model & Rendering (2 weeks)
- [ ] `MindmapDocument` type and Y.js schema
- [ ] Basic SVG rendering (circles + lines)
- [ ] Radial layout algorithm (d3-hierarchy)
- [ ] Node add/delete/select
- [ ] Pan & zoom controls

#### Sprint 3-4: Content Editing (2 weeks)
- [ ] Editor panel UI (slide-in from right)
- [ ] CodeMirror 6 integration
- [ ] Markdown preview (marked + DOMPurify)
- [ ] Node title inline editing
- [ ] Auto-save on edit (debounced 500ms)

#### Sprint 5-6: Attachments & Styling (2 weeks)
- [ ] Attachment storage (base64 + blob store)
- [ ] Drag-drop file upload
- [ ] Attachment preview (images, text files)
- [ ] Node styling (colors, icons)
- [ ] Collapse/expand branches

#### Sprint 7-8: Export & Polish (2 weeks)
- [ ] Markdown hierarchy export
- [ ] SVG/PNG image export
- [ ] Tree layout (horizontal/vertical)
- [ ] Keyboard shortcuts
- [ ] Performance testing (1000+ nodes)
- [ ] Documentation and examples

**Success Metrics**:
- Can create 100-node mindmap in <5 minutes
- Layout renders in <100ms for 500 nodes
- Markdown editor responsive (<50ms keystroke latency)
- .mboard file <10MB for typical mindmap (50 nodes, 10 images)

**Dependencies**:
- Phase 2.0 complete (plugin architecture)
- CodeMirror 6 + marked libraries
- d3-hierarchy library

**Risks**:
- SVG performance issues with large graphs → Mitigation: Virtualization, collapse
- Attachment storage bloat → Mitigation: Size limits, compression
- Layout algorithm complexity → Mitigation: Start with simple radial, iterate

---

### Phase 2.2: Digital Gardens Mode (Q1 2027)
**MVP: Pages, wikilinks, backlinks, graph view, search**

**Duration**: 10 weeks

#### Sprint 1-2: Core Data Model & Pages (2 weeks)
- [ ] `GardenDocument` type and Y.js schema
- [ ] Page CRUD operations
- [ ] Markdown editor (reuse from Mindmap)
- [ ] Sidebar navigation UI
- [ ] Quick switcher (Ctrl+K)

#### Sprint 3-4: Wikilinks & Backlinks (2 weeks)
- [ ] Wikilink parser (regex + AST)
- [ ] Link index builder
- [ ] Auto-complete for `[[...]]` syntax
- [ ] Backlinks panel
- [ ] Broken link detection

#### Sprint 5-6: Search (2 weeks)
- [ ] Inverted index with TF-IDF
- [ ] Full-text search UI
- [ ] Tag filtering
- [ ] Search result highlighting
- [ ] Performance testing (500+ pages)

#### Sprint 7-8: Graph View (2 weeks)
- [ ] Force-directed layout (d3-force)
- [ ] Local/global graph modes
- [ ] Node click → navigate
- [ ] Hover preview tooltip
- [ ] Tag-based coloring

#### Sprint 9-10: Export & Polish (2 weeks)
- [ ] Static HTML export
- [ ] Markdown export
- [ ] Unlinked mentions
- [ ] Orphaned page detection
- [ ] Performance optimization (IndexedDB for index)
- [ ] Documentation and examples

**Success Metrics**:
- Can create 50-page wiki in <30 minutes
- Search returns results in <100ms for 200 pages
- Graph view renders in <200ms for 100 pages
- Link index rebuilds in <500ms for 200 pages

**Dependencies**:
- Phase 2.1 complete (reuse Markdown editor)
- d3-force library
- marked + DOMPurify (shared)

**Risks**:
- Link parsing ambiguity (e.g., `[[Page [A]]]`) → Mitigation: Define clear syntax rules
- Graph layout performance → Mitigation: WebGL fallback, LOD
- Search index size in memory → Mitigation: IndexedDB persistence
- Static HTML export complexity → Mitigation: Keep template simple, defer styling

---

### Phase 2.3: Cross-Mode Features (Q2 2027)
**Future enhancements**

- [ ] **Cross-references**: Link from Garden page to BPMN process, embed Mindmap in Garden
- [ ] **Templates**: Starter templates for common mindmap/wiki structures
- [ ] **Mobile View**: Read-only mode for mobile browsers
- [ ] **Collaboration**: Real-time co-editing (Y.js WebRTC)
- [ ] **AI Assist**: Auto-generate mindmap from text, suggest backlinks

---

## 6. Technical Research Needed

### 6.1 Markdown Editors for Offline Use

**Candidates**:
1. **CodeMirror 6** ⭐ Recommended
   - **Pros**: Modern, modular, small bundle (~100KB), excellent TypeScript support, offline-first
   - **Cons**: Requires custom Markdown mode setup
   - **Research**: Test performance with 10,000-char documents

2. **Monaco Editor**
   - **Pros**: VSCode quality, rich features (IntelliSense, diff view)
   - **Cons**: Large bundle (400KB+), may be overkill
   - **Research**: Evaluate bundle size impact on load time

3. **Textarea + marked**
   - **Pros**: Minimal, no dependencies
   - **Cons**: Poor UX, no syntax highlighting
   - **Use Case**: Fallback only

**Action Items**:
- [ ] Build prototype with CodeMirror 6 (Mindmap MVP)
- [ ] Measure bundle size and performance
- [ ] Test accessibility (screen reader support)

---

### 6.2 Graph Layout Algorithms

**Mindmap Layouts**:
- **Radial**: `d3-hierarchy` (tree layout in polar coordinates)
- **Tree**: `d3-hierarchy` (standard tree layout)
- **Free-form**: Manual positioning (no algorithm)

**Garden Graph Layout**:
- **Force-Directed**: `d3-force` (simulate physics: attraction/repulsion)
- **Hierarchical**: `d3-dag` (directed acyclic graph layout)
- **Circular**: `d3-chord` (nodes in circle, edges as chords)

**Research Questions**:
- [ ] Can `d3-force` handle 1000+ nodes at 60fps?
  - **Hypothesis**: No. Need WebGL fallback (pixi.js) or simplification.
- [ ] Does hierarchical layout work for non-DAG gardens (cycles)?
  - **Answer**: No. Stick with force-directed for general case.
- [ ] What's the best initial layout for new gardens (no links)?
  - **Option**: Grid layout until first link created.

**Action Items**:
- [ ] Benchmark d3-force with 100/500/1000 nodes
- [ ] Test pixi.js integration for large graphs
- [ ] Prototype layout animations (smooth transitions)

---

### 6.3 File Attachment Strategies

**Options**:

1. **Base64-encode in JSON** (Current recommendation for <100KB files)
   - **Pros**: Simple, no external files, works with Y.js snapshots
   - **Cons**: 33% size overhead, increases .mboard size
   - **Best For**: Small images, text files

2. **Blob store in Y.Doc**
   - **Pros**: Efficient for large files, deduplication
   - **Cons**: Complex Y.js integration, harder to export
   - **Best For**: Large PDFs, videos

3. **External files in `.mboard.files/` directory**
   - **Pros**: Clean separation, no size overhead
   - **Cons**: Multiple files to manage, breaks single-file principle
   - **Best For**: Desktop app with file system access

4. **IndexedDB (browser only)**
   - **Pros**: Large storage quota (gigabytes)
   - **Cons**: Not portable, web-only
   - **Best For**: Web version future enhancement

**Recommendation**: Hybrid (1 + 2) for Phase 2.1.

**Research Questions**:
- [ ] How does Y.js handle large binary arrays?
  - **Test**: Store 10MB video in Y.Array, measure memory/performance.
- [ ] What's the max practical .mboard size for Electron?
  - **Hypothesis**: 100MB (test load time).
- [ ] Should attachments be deduplicated (same file in multiple nodes)?
  - **Answer**: Yes for large files (hash-based dedup in blob store).

**Action Items**:
- [ ] Implement attachment storage prototype
- [ ] Test Y.js binary performance
- [ ] Define attachment size limits (per-file, total)

---

### 6.4 Link Parsing Libraries

**Requirements**:
- Parse Markdown with custom `[[wikilink]]` syntax
- Extract links for backlink indexing
- Render links as clickable elements
- Handle edge cases: `[[A|B]]`, `[[#heading]]`, `[[A#B|C]]`

**Options**:

1. **Custom Regex** (Current recommendation)
   - **Pros**: Simple, full control, no dependencies
   - **Cons**: May miss edge cases, harder to extend
   - **Implementation**: `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`

2. **Remark Plugin** (markdown-it or remark)
   - **Pros**: Robust, extensible, handles complex Markdown
   - **Cons**: Heavier dependency, learning curve
   - **Example**: `remark-wiki-link` plugin

3. **PEG Parser** (e.g., peggy)
   - **Pros**: Formal grammar, precise parsing
   - **Cons**: Overkill for simple syntax, bundle size
   - **Best For**: Complex query languages

**Recommendation**: Start with regex (Phase 2.2 MVP), migrate to remark if edge cases emerge.

**Research Questions**:
- [ ] Can regex handle nested brackets? `[[A [B] C]]`
  - **Answer**: Tricky. Define syntax to disallow (or require escaping).
- [ ] How to handle pipe character in display text? `[[Page|Text with | symbol]]`
  - **Answer**: Escape with backslash: `\|`.
- [ ] Should wikilinks work in code blocks?
  - **Answer**: No. Ignore links in fenced code blocks.

**Action Items**:
- [ ] Define formal wikilink syntax (document in garden mode spec)
- [ ] Test regex against edge cases
- [ ] Evaluate remark-wiki-link plugin as alternative

---

### 6.5 Additional Research Areas

#### Accessibility
- [ ] Ensure keyboard navigation works in mindmap (Tab, arrows, Enter)
- [ ] Test graph view with screen readers (ARIA labels for nodes)
- [ ] Markdown preview should be semantic HTML (proper heading hierarchy)

#### Export Formats
- [ ] Static HTML garden: Test with 100+ pages (bundle size, performance)
- [ ] PDF mindmap: Evaluate headless Chrome vs. custom SVG→PDF library
- [ ] Markdown export: Handle attachments (embed images as base64 or extract to files?)

#### Integration Opportunities
- [ ] **Obsidian compatibility**: Can we import/export Obsidian vaults?
- [ ] **Roam Research**: Similar [[wikilink]] syntax, but different features (block refs)
- [ ] **Notion**: API for import/export?

#### Security
- [ ] Sanitize Markdown rendering (DOMPurify confirmed safe?)
- [ ] File upload validation (check MIME type, scan for malware?)
- [ ] Wikilink injection attacks (e.g., `[[<script>...]]`)?

---

## 7. Open Questions & Decisions Needed

### 7.1 Mindmap Mode

**Q1: Should nodes support embedding other media (videos, iframes)?**
- **Options**: 
  - A) Yes (full media support)
  - B) No (Markdown + attachments only)
  - C) Phase 3 enhancement
- **Recommendation**: B (keep MVP simple, add media in Phase 3)
- **Rationale**: Embedding adds complexity (sandboxing, performance, file size)

**Q2: How to handle very deep mindmaps (10+ levels)?**
- **Options**:
  - A) Auto-collapse at depth 4
  - B) Zoom-to-fit (scale down entire tree)
  - C) Breadcrumb navigation (show subtree only)
- **Recommendation**: A + C (collapse deep branches, add breadcrumb for context)

**Q3: Should mindmap support multiple roots (forest layout)?**
- **Answer**: No for Phase 2.1 (single root only). Consider for Phase 3.

---

### 7.2 Digital Gardens Mode

**Q1: Should gardens support hierarchical pages (parent/child)?**
- **Context**: Some wikis have page hierarchy (e.g., `/Projects/Miroboard/Architecture`)
- **Options**:
  - A) Flat structure only (all pages at root level)
  - B) Hierarchical with folders
  - C) Hybrid (folders in sidebar, but pages linked via wikilinks)
- **Recommendation**: A for MVP (flat structure simpler), B in Phase 3
- **Rationale**: Wikilinks provide navigation; hierarchy adds organizational complexity

**Q2: How to handle duplicate page titles?**
- **Options**:
  - A) Disallow (enforce unique titles)
  - B) Allow (disambiguate with aliases or IDs)
- **Recommendation**: A (unique titles required)
- **Rationale**: Simpler implementation, clearer mental model

**Q3: Should graph view be navigable (drag nodes, create links visually)?**
- **Answer**: Phase 2.2 = read-only. Phase 3 = interactive editing.
- **Rationale**: MVP focuses on visualization; editing adds complexity.

**Q4: Unlinked mentions: How to present them?**
- **Options**:
  - A) Separate "Unlinked Mentions" section below backlinks
  - B) Inline suggestions ("Did you mean to link to X?")
  - C) Hidden by default (toggle to show)
- **Recommendation**: A (Obsidian-style section)

---

### 7.3 Cross-Cutting

**Q1: Should MiroBoard support importing existing mindmaps/wikis?**
- **Formats**: OPML (mindmaps), Markdown vaults (Obsidian), Roam JSON
- **Phase**: Phase 3 (not MVP)
- **Rationale**: Focus on creation first, then interop

**Q2: Mobile app or PWA?**
- **Answer**: Phase 3 (web version with responsive UI)
- **Rationale**: Desktop focus for MVP (Electron)

**Q3: Real-time collaboration?**
- **Answer**: Phase 3 (Y.js already supports it, but need backend)
- **Rationale**: Offline-first is core value prop; don't complicate MVP

---

## 8. Risk Assessment

### High Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **SVG performance degrades with 1000+ nodes** | Users abandon tool for large mindmaps | Virtualization, collapse, WebGL fallback |
| **File size bloat (attachments)** | .mboard files become unmanageable | Size limits, compression, external storage |
| **Complex link parsing edge cases** | Broken links, incorrect backlink index | Formal syntax spec, extensive testing |
| **Plugin architecture refactor breaks BPMN** | Phase 1 users experience regressions | Comprehensive test suite, gradual rollout |

### Medium Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Markdown editor bundle size** | Slow initial load | Code splitting, lazy load editor |
| **Search index memory usage** | Browser crashes on large gardens | IndexedDB persistence, incremental indexing |
| **Graph layout too slow for real-time** | Janky interactions | Pre-compute layouts, cache, throttle updates |
| **Export quality (HTML/PDF) insufficient** | Users resort to screenshots | Iterate on templates, user testing |

### Low Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Wikilink syntax conflicts with Markdown** | Confusing escaping rules | Clear documentation, syntax highlighting |
| **Attachment type restrictions too strict** | User frustration | Allow all types, warn on size |
| **Mode switching UX unclear** | Users lost in UI | Tooltips, onboarding tour |

---

## 9. Success Criteria

### Phase 2.1 (Mindmap)
- [ ] 100 beta users create mindmaps
- [ ] Average mindmap: 30 nodes, 5 attachments
- [ ] Positive feedback on Markdown editor UX
- [ ] Zero critical bugs in attachment storage
- [ ] Export to Markdown works for 95% of mindmaps

### Phase 2.2 (Garden)
- [ ] 50 beta users create wikis
- [ ] Average wiki: 20 pages, 50 backlinks
- [ ] Search returns relevant results in <100ms
- [ ] Graph view renders smoothly for typical wikis
- [ ] Static HTML export viewed as "production-ready"

### Phase 2.3 (Adoption)
- [ ] 500 active users across all modes
- [ ] 30% of users use multiple modes
- [ ] Positive reviews on "offline-first wiki" niche
- [ ] Community-contributed templates/examples

---

## 10. Conclusion

Mindmap and Digital Gardens modes transform MiroBoard from a specialized BPMN tool into a **universal thinking environment**. By leveraging Phase 1's solid offline-first foundation and introducing a plugin architecture, we enable users to:

- **Brainstorm** with spatial mindmaps
- **Document** with interconnected wikis  
- **Process** with BPMN diagrams

All in one file, no cloud required.

**Next Steps**:
1. Review this document with stakeholders
2. Finalize Phase 2.0 plugin architecture spec
3. Prototype Mindmap MVP (Sprint 1-2)
4. Iterate based on beta feedback

**Key Architectural Decisions**:
- ✅ SVG rendering (performance + export quality)
- ✅ CodeMirror 6 (modern, lightweight)
- ✅ Hybrid attachment storage (base64 + blob store)
- ✅ Force-directed graph for gardens (d3-force)
- ✅ Flat page structure for MVP (defer hierarchy)

**Open for Discussion**:
- Media embedding in nodes (Phase 3?)
- Real-time collaboration priority
- Mobile app roadmap

---

**Document History**
- v1.0 (2024): Initial architecture plan
