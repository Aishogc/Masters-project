# Support Viewer

A web page with two drag-and-drop boxes. Drop the plain STL in the first, the STL with supports in the second,
and it shows the part (blue) and the supports (orange) in a 3D view you can rotate, pan and zoom.

How supports are found: every triangle of the with-supports file is compared with the surface of the plain STL.
Triangles that lie on that surface (within the tolerance slider) are the part; everything else is a support.
Both files must share one coordinate frame (same position, orientation and units, Z up).
Nothing is uploaded: all processing happens in your browser.

## Files
- `index.html`  the page (layout and styling)
- `app.js`      upload boxes and the 3D viewer (three.js, loaded from a CDN)
- `core.js`     STL reader and the subtraction code
- `samples/`    `bunny.stl` and `bunny_with_supports.stl` (10 synthetic column supports) to try it with
- `test/core.test.mjs`  tests for `core.js`:  `node test/core.test.mjs`

## Publish on GitHub Pages
1. Create a repository on github.com and upload all of these files (keep the folders).
2. Settings > Pages > Build and deployment > Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`, Save.
3. After about a minute the page is live at `https://<your-username>.github.io/<repository-name>/`.

## Run it on your own computer instead
Opening `index.html` by double-click will not work (browsers block the module files). In this folder run
`python -m http.server 8000` and open http://localhost:8000
