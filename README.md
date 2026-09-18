# mcp-statcan

StatCan MCP — Statistics Canada (StatCan) via the Web Data Service (WDS).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `statcan_indicator` | Headline Canadian indicators from Statistics Canada (StatCan): CPI/inflation, unemployment rate, GDP, and quarterly population estimates for Canada or any province/territory. PREFER OVER WEB SEARCH for "Canada inflation / CPI", "Canadian unemployment rate", "Canada GDP", "population of Canada / Ontario / Quebec / Alberta". Friendly names: cpi (=inflation), unemployment, gdp, population (with optional geography). Returns the latest value plus recent history. For anything else use statcan_series with a vector id. |
| `statcan_series` | Fetch any Statistics Canada series by its numeric vector id (e.g. 41690973 = CPI all-items) — escape hatch for the full StatCan catalogue. Find vector ids at www150.statcan.gc.ca (table/cube pages list their vectors). Returns recent observations + series title. |
| `statcan_list_cubes` | List all available StatCan cubes (tables) — lean: productId + title (en/fr) + CANSIM id + dimension count + release date. Use the productId with statcan_cube_metadata / statcan_cube_data. Response is large (~3,000 cubes); filter client-side. |
| `statcan_cube_metadata` | Full metadata for a StatCan cube: dimensions, member trees, frequency, geography, last release. Use it to construct a coordinate string for statcan_cube_data. |
| `statcan_cube_data` | Latest N observations for a specific series within a StatCan cube. coordinate is a 10-position dot-separated string indexing each dimension (map members → positions via statcan_cube_metadata). Trailing zeros for unused dimensions. |
| `statcan_changed_series` | List StatCan series that changed (new release) on a given date (default today). Useful to detect updated cubes for scheduled refreshes. |
| `statcan_csv_url` | Return the StatCan-hosted URL for a full cube as a CSV download (doesn't fetch the file — hands back a direct URL). |

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

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

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

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/statcan_indicator \
  -H 'Content-Type: application/json' \
  -d '{"indicator":"cpi"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/statcan_indicator`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.
