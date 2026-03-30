# Virtual Gallery Worker

A React + Tailwind image gallery that loads 100+ images, keeps scrolling smooth with virtualization, and downloads images with a real Canvas watermark processed inside a Web Worker.

## Project Highlights

- Loads 120 images from Picsum API.
- Virtualized rendering so only visible cards are mounted in DOM.
- Smooth scrolling with low main-thread work.
- Click image to open preview modal.
- Click outside modal or press Escape to close.
- Per-image export with Canvas watermark text: `Celebrare`.
- Watermark processing runs in a separate Web Worker file.
- Select All support.
- Bottom action tray appears when images are selected.
- Batch export for selected images.
- Light and dark mode support.

## Tech Stack

- React 18
- Vite 5
- Tailwind CSS 3
- Web Worker + OffscreenCanvas
- Picsum public image API

## Folder Structure

```text
.
├─ src/
│  ├─ App.jsx
│  ├─ index.css
│  ├─ main.jsx
│  ├─ watermarkShared.js
│  └─ workers/
│     └─ imageProcessor.worker.js
├─ index.html
├─ package.json
├─ postcss.config.js
├─ tailwind.config.js
├─ vite.config.js
├─ video_script.txt
└─ README.md
```

## How It Works

### 1) Image Loading

- App fetches image list from: `https://picsum.photos/v2/list?page=2&limit=120`
- First 120 items are used for gallery.

### 2) Virtualization

- Grid layout is computed based on viewport width.
- Each card has fixed height and dynamic width.
- On scroll, app calculates start and end rows with overscan buffer.
- Only cards inside that range are rendered.
- Spacer div preserves total scroll height so scroll behaves like full list.

### 3) Preview

- Clicking image opens modal preview.
- Close on outside click or Escape key.

### 4) Watermark Pipeline

- Main thread sends image job to worker with `requestId`, `imageId`, `imageUrl`.
- Worker fetches image, draws it on `OffscreenCanvas`, and draws watermark text.
- Worker converts output to JPEG blob and returns `ArrayBuffer`.
- Main thread receives processed image and triggers browser download.

### 5) Shared Watermark Logic

- `src/watermarkShared.js` provides reusable watermark text and layout.
- Used by worker to ensure consistent watermark rendering.

### 6) Selection + Batch Export

- User can select individual images or Select All.
- Selected count appears in bottom tray.
- Batch export processes selected items in controlled concurrency.

## Scripts

Current scripts:

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

Run locally:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Assignment Requirement Mapping

- Minimum 100 images from free API: Done (120 images).
- Gallery should not freeze while scrolling: Done using virtualization.
- Full-screen/large preview with outside-click close: Done.
- Download button on each image: Done.
- Watermark must be drawn using Canvas API: Done.
- Move watermark logic to Web Worker: Done.
- UI responsive during processing: Done.
- Select All and Download Selected tray: Done.

## Performance Notes

- Virtualized rendering avoids mounting all 120 cards at once.
- Worker-based image processing keeps main thread responsive.
- Download tasks are batched with limited concurrency.


