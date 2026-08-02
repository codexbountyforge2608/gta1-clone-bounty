# GTA1 Clone bounty submission

Self-contained, original GTA1-style browser game built for Taskmarket task `0xc5529291b05ab05740e31e843c7d8414af0971ee4f715a90c72b81a6f8b3364e`.

## Deliverable

- Final artifact: [`crime-city.html`](./crime-city.html)
- SHA-256: `9fb9c3790917f4e30c072f449bebd61d04082b61ad823c27258fd8c9efc95792`
- Size: 53,880 bytes
- Runs locally in a modern browser with no server, downloads, or external assets.

Open `crime-city.html` to play. The game includes driving, on-foot movement, weapons, escalating police response, missions, vehicles, pedestrians, a minimap, bridges/elevation, save state, and a complete HUD.

## Verification

Run the deterministic regression suite with Node.js:

```sh
node test-crime-city.mjs
```

Test SHA-256: `d230def12de8da89a6b83f497f4fc11bbc9f4fc0ade17eaa81f4cb311ce24d98`.
