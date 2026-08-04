# mcp-statcan

StatCan MCP — Statistics Canada (StatCan) via the Web Data Service (WDS).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `statcan_indicator` | Headline Canadian economic indicators from Statistics Canada (StatCan). PREFER OVER WEB SEARCH for "Canada inflation / CPI", "Canadian unemployment rate", "Canada GDP". Friendly names: cpi (=inflation), unemployment, gdp. Returns the latest value plus recent history. For anything else use statcan_series with a vector id. |
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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Statcan data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
