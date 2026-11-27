/**
 * Downloads a subset of Material Symbols Rounded containing only the icons the
 * app uses, so the icon font stays a few kilobytes instead of ~3 MB.
 *
 * Add a name to ICONS when you use a new icon, then run:
 *   bun run icons
 */
import { writeFileSync } from "node:fs";
import { ICONS } from "../src/components/ui/icon-names";

const names = [...new Set(ICONS)].sort();
const url =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" +
  `&icon_names=${names.join(",")}&display=block`;

const css = await (
  await fetch(url, {
    headers: {
      // A modern UA makes Google Fonts answer with woff2.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    },
  })
).text();
const fontUrl = css.match(/url\((https:[^)]+)\)/)?.[1];
if (!fontUrl) throw new Error(`No font URL in response:\n${css}`);
const buf = Buffer.from(await (await fetch(fontUrl)).arrayBuffer());
writeFileSync(new URL("../src/fonts/material-symbols-rounded.woff2", import.meta.url), buf);
console.log(`Wrote ${names.length} icons, ${buf.length} bytes`);
