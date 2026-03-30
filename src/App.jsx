import { useEffect, useMemo, useRef, useState } from "react";
import { getWatermarkText } from "./watermarkShared";

const API_URL = "https://picsum.photos/v2/list?page=2&limit=120";
const MIN_CARD_WIDTH = 280;
const CARD_HEIGHT = 290;
const GAP = 14;
const ROW_BUFFER = 8;

function App() {
  const viewportRef = useRef(null);
  const workerRef = useRef(null);
  const reqMapRef = useRef(new Map());

  const [images, setImages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [layout, setLayout] = useState({
    columnCount: 1,
    cardWidth: MIN_CARD_WIDTH,
    rowHeight: CARD_HEIGHT + GAP,
    totalRows: 0,
    totalHeight: 0
  });
  const [scrollTop, setScrollTop] = useState(0);
  const [previewSrc, setPreviewSrc] = useState("");
  const [toast, setToast] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const imageMap = useMemo(() => {
    const map = new Map();
    images.forEach((item) => map.set(item.id, item));
    return map;
  }, [images]);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./workers/imageProcessor.worker.js", import.meta.url), { type: "module" });
    workerRef.current.onmessage = (event) => {
      const { requestId, success, buffer, mimeType, message } = event.data;
      const entry = reqMapRef.current.get(requestId);
      if (!entry) {
        return;
      }
      reqMapRef.current.delete(requestId);
      if (success) {
        const blob = new Blob([buffer], { type: mimeType || "image/jpeg" });
        entry.resolve(blob);
      } else {
        entry.reject(new Error(message || "Worker failed"));
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    let closed = false;
    async function run() {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) {
          throw new Error("Load failed");
        }
        const data = await res.json();
        if (!closed) {
          setImages(data.slice(0, 120));
          popToast("Loaded 120 images");
        }
      } catch {
        if (!closed) {
          popToast("Unable to load gallery");
        }
      }
    }
    run();
    return () => {
      closed = true;
    };
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const calc = () => {
      const width = node.clientWidth;
      const columnCount = Math.max(1, Math.floor((width - GAP) / (MIN_CARD_WIDTH + GAP)));
      const cardWidth = Math.floor((width - GAP * (columnCount + 1)) / columnCount);
      const totalRows = Math.ceil(images.length / columnCount);
      const totalHeight = totalRows * (CARD_HEIGHT + GAP) + GAP;
      setLayout({
        columnCount,
        cardWidth,
        rowHeight: CARD_HEIGHT + GAP,
        totalRows,
        totalHeight
      });
    };

    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(node);
    return () => ro.disconnect();
  }, [images.length]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setPreviewSrc("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = setTimeout(() => setToast(""), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  const totalSelected = selectedIds.size;
  const allSelected = images.length > 0 && totalSelected === images.length;
  const indeterminate = totalSelected > 0 && totalSelected < images.length;

  function popToast(message) {
    setToast(message);
  }

  function processInWorker(image) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      reqMapRef.current.set(requestId, { resolve, reject });
      workerRef.current.postMessage({
        type: "watermark",
        requestId,
        imageId: image.id,
        imageUrl: image.download_url,
        watermarkText: getWatermarkText()
      });
    });
  }

  function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 9000);
  }

  async function downloadSingle(image) {
    const blob = await processInWorker(image);
    triggerDownload(blob, `picsum-${image.id}-watermarked.jpg`);
  }

  async function downloadSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      return;
    }

    setBulkBusy(true);
    const queue = ids.map((id) => imageMap.get(id)).filter(Boolean);
    let completed = 0;
    const concurrency = 3;

    const run = async () => {
      while (queue.length) {
        const image = queue.shift();
        try {
          const blob = await processInWorker(image);
          triggerDownload(blob, `picsum-${image.id}-watermarked.jpg`);
          completed += 1;
          popToast(`Downloaded ${completed}/${ids.length}`);
        } catch {
          popToast("One image failed");
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, run));
    setBulkBusy(false);
  }

  const range = useMemo(() => {
    if (!images.length) {
      return { startIndex: 0, endIndex: -1 };
    }
    const viewportHeight = viewportRef.current?.clientHeight || 0;
    const startRow = Math.max(0, Math.floor(scrollTop / layout.rowHeight) - ROW_BUFFER);
    const endRow = Math.min(
      layout.totalRows - 1,
      Math.floor((scrollTop + viewportHeight) / layout.rowHeight) + ROW_BUFFER
    );
    return {
      startIndex: startRow * layout.columnCount,
      endIndex: Math.min(images.length - 1, (endRow + 1) * layout.columnCount - 1)
    };
  }, [images.length, layout, scrollTop]);

  const visibleItems = useMemo(() => {
    if (range.endIndex < range.startIndex) {
      return [];
    }
    const list = [];
    for (let i = range.startIndex; i <= range.endIndex; i += 1) {
      const image = images[i];
      if (!image) {
        continue;
      }
      const row = Math.floor(i / layout.columnCount);
      const col = i % layout.columnCount;
      list.push({
        image,
        top: GAP + row * layout.rowHeight,
        left: GAP + col * (layout.cardWidth + GAP)
      });
    }
    return list;
  }, [images, layout, range]);

  const visibleCount = visibleItems.length;

  function onScroll() {
    setScrollTop(viewportRef.current?.scrollTop || 0);
  }

  function toggleSelect(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleSelectAll(checked) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(images.map((item) => item.id)));
  }

  return (
    <div className="relative min-h-screen overflow-hidden transition-colors duration-500">
      <div className="pointer-events-none fixed -right-20 -top-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-[100px] dark:bg-indigo-500/5" />
      <div className="pointer-events-none fixed -bottom-20 -left-20 h-96 w-96 rounded-full bg-pink-500/10 blur-[100px] dark:bg-pink-500/5" />

      <header className="glass-panel relative z-20 mx-4 mt-4 rounded-3xl p-4 md:px-8 md:py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsDark(!isDark)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              {isDark ? "🌙" : "☀️"}
            </button>
            <div className="min-w-0">
              <h1 className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1 font-display text-xl font-black tracking-tight shadow-sm dark:border-slate-700 dark:bg-slate-900/85 md:text-2xl">
                <span className="text-slate-900 dark:text-slate-100">Virtual</span>
                <span className="text-indigo-700 dark:text-amber-300">Gallery</span>
              </h1>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-2xl bg-indigo-50/80 px-2.5 py-1.5 dark:bg-indigo-500/10">
              <span className="text-[9px] font-black uppercase text-indigo-500/60 dark:text-indigo-400/60">Total</span>
              <span className="text-xs font-black text-indigo-700 dark:text-indigo-400">{images.length}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl bg-emerald-50/80 px-2.5 py-1.5 dark:bg-emerald-500/10">
              <span className="text-[9px] font-black uppercase text-emerald-500/60 dark:text-emerald-400/60">Active</span>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">{visibleCount}</span>
            </div>
            <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 md:block" />
            <label className="group col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 transition-all hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 sm:col-auto sm:justify-start sm:py-1.5">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(node) => { if (node) node.indeterminate = indeterminate; }}
                onChange={(event) => handleSelectAll(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 transition-all dark:border-slate-600"
              />
              <span className="text-[11px] font-black uppercase tracking-wider text-white">Select All</span>
            </label>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-4 pb-20 pt-4">
        <div
          ref={viewportRef}
          onScroll={onScroll}
          className="gallery-scroll glass-panel relative h-[calc(100vh-176px)] overflow-auto rounded-[2rem] p-4 sm:h-[calc(100vh-140px)]"
        >
          <div style={{ height: layout.totalHeight }} />
          <div className="absolute inset-0">
            {visibleItems.map(({ image, top, left }) => (
              <article
                key={image.id}
                className="group absolute overflow-hidden rounded-[2rem] border border-slate-200/50 bg-white shadow-xl shadow-indigo-500/5 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10 dark:border-white/5 dark:bg-slate-900"
                style={{ width: layout.cardWidth, height: CARD_HEIGHT, top, left }}
              >
                <div 
                  className="relative h-[220px] w-full overflow-hidden cursor-zoom-in group"
                  onClick={() => setPreviewSrc(`${image.download_url}`)}
                >
                  <img
                    src={`${image.download_url}?w=620&h=420`}
                    alt={`Photo by ${image.author}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <p className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-widest text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 translate-y-2">
                    {image.author}
                  </p>
                </div>
                
                <div className="flex items-center justify-between p-4 dark:bg-slate-900/50">
                  <label className="flex cursor-pointer items-center gap-2">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(image.id)}
                        onChange={(event) => toggleSelect(image.id, event.target.checked)}
                        className="peer h-4 w-4 appearance-none rounded border border-slate-300 bg-white transition-all checked:border-indigo-600 checked:bg-indigo-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 dark:text-slate-400">Select</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await downloadSingle(image);
                        popToast("Processing...");
                      } catch {
                        popToast("Failed");
                      }
                    }}
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-[10px] font-bold uppercase text-white transition-all hover:bg-indigo-600 dark:bg-white dark:text-slate-900 dark:hover:bg-indigo-400"
                  >
                    Export
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      {previewSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm animate-fade-in"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewSrc("");
            }
          }}
        >
          <div className="relative w-full max-w-[600px] overflow-hidden rounded-3xl border border-white/20 bg-white p-2 shadow-2xl animate-slide-up dark:bg-slate-900">
            <img src={previewSrc} alt="Preview" className="block h-auto w-full rounded-2xl shadow-inner" />
            <button 
              onClick={() => setPreviewSrc("")}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-xs text-white backdrop-blur-md transition-all hover:bg-black/60"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {totalSelected > 0 ? (
        <div className="fixed bottom-10 left-0 right-0 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-[500px] items-center justify-between rounded-full border border-white/20 bg-slate-900/95 p-2 pr-2 text-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-slide-up dark:bg-white dark:text-slate-900">
            <div className="flex items-center gap-4 pl-4">
               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/40">
                  <span className="text-sm font-black">{totalSelected}</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Selected</span>
                  <span className="text-xs font-bold">Ready to export</span>
               </div>
            </div>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={downloadSelected}
              className="h-12 rounded-full bg-indigo-600 px-8 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {bulkBusy ? "Processing..." : "Batch Export"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`pointer-events-none fixed bottom-10 right-10 z-[60] rounded-2xl bg-slate-900 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-2xl transition-all duration-500 dark:bg-white dark:text-slate-900 ${toast ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
      >
        {toast}
      </div>
    </div>
  );
}

export default App;
