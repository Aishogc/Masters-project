# Visualiser for STL files and CAD Subtraction

 Drop the og STL in the first, the STL with supports in the second, and it shows the part (blue) and the supports (orange) in a 3D view you can rotate, pan and zoom.

How supports are found: every triangle of the with-supports file is compared with the surface of the plain STL.
Both files must share one coordinate frame (same position, orientation and units)

## Files
- `index.html`  the page (layout and styling)
- `app.js`      upload boxes and the 3D viewer (java script)
- `core.js`     STL reader and the subtraction code
- `samples/`    `bunny.stl` and `bunny_with_supports.stl` (10 synthetic column supports) to try it with
- `test/core.test.mjs`  tests for `core.js`:  `node test/core.test.mjs`

## Publish on GitHub Pages
1. Create a repository on github.com and upload all of these files (keep the folders).
2. Settings > Pages > Build and deployment > Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`, Save.
3. After about a minute the page is live at `https://<your-username>.github.io/<repository-name>/`.

