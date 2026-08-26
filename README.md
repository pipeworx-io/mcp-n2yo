# mcp-n2yo

N2YO MCP — wraps the N2YO Satellite Tracking REST API (n2yo.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `get_positions` | Track where a satellite is right now (or in the next few seconds): get its live latitude, longitude, altitude, and look-angles (azimuth/elevation) from an observer on Earth. Use this to answer "where is the ISS right now?" (NORAD id 25544) or to locate any satellite by NORAD id. Example: get_positions({ norad_id: 25544, lat: 40.71, lon: -74.0 }). |
| `get_visual_passes` | Find when a satellite will be visible to the naked eye overhead from an observer location (visual passes = bright, sunlit passes against a dark sky). Returns start/max/end times, elevation, azimuths, brightness magnitude, and duration. Use this for "when can I see the ISS pass over?" Example: get_visual_passes({ norad_id: 25544, lat: 40.71, lon: -74.0 }). |
| `whats_above` | List what satellites are currently above a location on Earth, within a given radius of the observer's zenith. Use this to answer "what satellites are overhead right now?" Optionally filter by category (e.g. 52 = Starlink, 18 = amateur radio, 1 = brightest). Example: whats_above({ lat: 40.71, lon: -74.0 }). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "n2yo": {
      "url": "https://gateway.pipeworx.io/n2yo/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/n2yo/mcp` returns the tools in the table
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
ask_pipeworx({ question: "your question about N2yo data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
