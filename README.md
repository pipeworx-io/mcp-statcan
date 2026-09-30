# StatCan — Statistics Canada

Canada's national statistical office, via the free, keyless Web Data Service (WDS,
`www150.statcan.gc.ca/t1/wds/rest`). Covers the full cube (table) catalogue —
population, CPI/inflation, unemployment, GDP, trade, agriculture, and every other
official Canadian series — plus headline indicators pre-resolved to a vector id.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1684+ live data sources.

## Two access patterns

1. **Friendly / vector-based** — `statcan_indicator` (cpi, unemployment, gdp,
   population by geography) and `statcan_series` (any series by numeric vector id,
   FRED-style).
2. **Cube-based** — `statcan_list_cubes` (catalogue), `statcan_cube_metadata`
   (dimensions + members for one cube), `statcan_cube_vectors` (enumerate the actual
   vector ids for a cube), `statcan_cube_data` (latest N observations at a
   coordinate), `statcan_table` (whole table / filtered slice —
   see below), `statcan_changed_series` (daily change feed), `statcan_csv_url`
   (full-table CSV download link, live upstream URL, never fetches).

## `statcan_table` — whole-table lookup (fleet #2507)

`statcan_cube_data` answers ONE coordinate per call and `statcan_csv_url` only
hands back a download URL — neither can answer "the whole table" or "every
province at once" in one call, which is what most repeat callers actually want
(60d: statcan rep3 146, #2 repeat-demand cluster in the catalog; no_match
evidence: 42100037 child-care-difficulty coords fetched one at a time, 34100035
hydro-electric Quebec, 32100113 milk sold off farms, 98100353 2021 Census
religion by province).

`statcan_table` answers from a curated set of high-demand
StatCan tables (`statcan_table_rows`, refreshed weekly by
`workers/data-pipeline/src/datasets/statcan.ts` from StatCan's own
`getFullTableDownloadCSV` export), not the live WDS API:

```js
statcan_table({ product_id: 42100037 })
// -> every coordinate, every ref_date, member labels (e.g. { "Statistics":
//    "Percentage of children", "Type of difficulty encountered...": "..." }),
//    in one call. Paged (limit/page) past 1000 rows.

statcan_table({ product_id: 32100113, geo: "Quebec", ref_date_from: "2023-01" })
```

**Coverage is curated, not universal.** Calling `statcan_table` on a product_id
that isn't cached REFUSES with a clear error naming the currently-cached ids —
it never silently returns an empty result. For anything outside that set, use
`statcan_cube_data` (per-coordinate, live) or `statcan_csv_url` (raw CSV,
live) instead. The wave-1 list (16 tables — see `statcan.ts` for the full
rationale) covers the tables with verified repeat demand; adding a new table to
the ingest list needs no migration (see next paragraph).

**Schema is generic on purpose.** StatCan's per-table CSV carries a fixed set
of metadata columns (REF_DATE, GEO, DGUID, VECTOR, COORDINATE, VALUE, STATUS,
SYMBOL, TERMINATED, DECIMALS, UOM, UOM_ID, SCALAR_FACTOR, SCALAR_ID) plus
however many table-specific dimension-label columns the table declares (e.g.
"Statistics", "Type of difficulty encountered..." for 42100037) — those vary
per table, so they're captured into a `members` jsonb column rather than a
per-table relational schema.

Every response carries `data_as_of` (from the ingestion pipeline's
`pipeline_state.last_success_at` for that table) and a `licence` field.
**Licence: Statistics Canada Open Licence** (statcan.gc.ca/en/reference/licence)
— explicitly permits reproduction, redistribution and sale of the Information,
conditioned on source acknowledgment ("Source: Statistics Canada, name of
product, reference date...") and not implying StatCan endorsement. No personal
data is stored — every row is an aggregate statistic.

## Table number → vector id, in two calls

Every StatCan question starts with a table (e.g. "32-10-0121-01", the egg
production table, or its 8-digit form `32100121`). Neither the table number nor
`statcan_cube_metadata` hands you a vector id directly — metadata only gives
dimensions and their member lists. Use `statcan_cube_vectors` to bridge that:

```js
statcan_cube_vectors({ product_id: "32100121", filters: { GEO: "Canada" } })
// -> rows: [{ vector_id: 61133, coordinate: "1.1.0.0.0.0.0.0.0.0",
//            members: { Geography: "Canada", "Production and disposition": "Average number of layers" },
//            frequency: "Monthly", terminated: false, series_title: "Canada;Average number of layers" }, ...]

statcan_series({ vector_id: "61133" })
// -> the actual observations
```

`filters` keys match by case-insensitive substring against the cube's dimension
names (so `GEO` matches `Geography`); values match by substring against member
names. Dimensions left unfiltered include **every** member of that dimension —
for a cube with many dimensions that's a large cross-product, so page with
`limit`/`page` (default 100/page, max 500) rather than pulling everything at once.
`total_combinations` and `has_more`/`next_page` in the response tell you whether
you're seeing all of it.

`statcan_cube_metadata` does **not** return vector ids — it only lists dimensions
and members, which is why `statcan_cube_vectors` exists.

## `product_id` accepts either form

- The 8-digit WDS product id: `32100121`
- The public table number: `32-10-0121-01` (StatCan's `NN-NN-NNNN-NN` display
  format — the tool strips the dashes and drops the trailing 2-digit suffix)

## Auth

None. Fully keyless — StatCan WDS has no rate-limit key or auth header.

## Common pitfalls

- **`statcan_cube_data` needs a coordinate you already know.** If you don't have
  one, get it from `statcan_cube_vectors` first — don't hand-build a coordinate
  from `statcan_cube_metadata`'s member list and guess.
- **A wide table has thousands of combinations.** Always filter by at least one
  dimension (most often `GEO`) before enumerating a table you haven't seen —
  otherwise you'll be paging for a long time.
- **`terminated: true`** on a `statcan_cube_vectors` row means that series has
  stopped publishing; the cube's `cube_start_date`/`cube_end_date` describe the
  whole table's range, not any one series' actual last observation.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "statcan": {
      "url": "https://gateway.pipeworx.io/statcan/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/statcan/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1684+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/statcan_indicator \
  -H 'Content-Type: application/json' \
  -d '{"indicator":"cpi"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/statcan_indicator`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "statcan": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-statcan"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-statcan
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Statcan data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
