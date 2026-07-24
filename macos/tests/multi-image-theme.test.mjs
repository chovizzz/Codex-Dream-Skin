import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPayload } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const fixtureAssets = {
  home: path.join(macosRoot, "assets", "portal-hero.png"),
  task: path.join(macosRoot, "presets", "preset-arina-hashimoto", "background.jpg"),
  sidebar: path.join(macosRoot, "presets", "preset-gothic-void-crusade", "background.jpg"),
};
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-multi-"));

try {
  for (const [surface, source] of Object.entries(fixtureAssets)) {
    const extension = path.extname(source);
    await fs.copyFile(source, path.join(tempRoot, `${surface}${extension}`));
  }
  await fs.writeFile(path.join(tempRoot, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "multi-photo",
    name: "Multi photo",
    image: "home.png",
    homeImage: "home.png",
    taskImage: "task.jpg",
    sidebarImage: "sidebar.jpg",
    art: {
      home: { focusX: 0.62, focusY: 0.48, fit: "cover" },
      task: { focusX: 0.5, focusY: 0.42, fit: "contain" },
      sidebar: { focusX: 0.5, focusY: 0.5, fit: "cover" },
    },
  }, null, 2)}\n`);

  const loaded = await loadPayload(tempRoot);
  assert.equal(loaded.theme.homeImage, "home.png");
  assert.equal(loaded.theme.taskImage, "task.jpg");
  assert.equal(loaded.theme.sidebarImage, "sidebar.jpg");
  assert.equal(loaded.theme.multiImage, true);
  assert.deepEqual(Object.keys(loaded.theme.artMetadataBySurface), ["base", "home", "task", "sidebar"]);
  assert.ok(loaded.imageBytes > (await fs.stat(fixtureAssets.home)).size);
  assert.doesNotMatch(loaded.payload, /__DREAM_SKIN_(?:ART|THEME)_JSON__/);
  assert.match(loaded.payload, /"sidebar":"data:image\/jpeg;base64,/);

  await fs.writeFile(path.join(tempRoot, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "single-photo",
    image: "home.png",
  })}\n`);
  const single = await loadPayload(tempRoot);
  assert.equal(
    single.payload.match(/data:image\/png;base64,/g)?.length,
    1,
    "single-image themes must serialize artwork bytes only once",
  );

  await fs.writeFile(path.join(tempRoot, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "bad-multi-photo",
    image: "home.png",
    taskImage: "../outside.png",
  })}\n`);
  await assert.rejects(loadPayload(tempRoot), /taskImage.*inside its theme directory/);

  console.log("PASS: multi-image themes load isolated home, task, and sidebar artwork.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
