import { buildWatermarkLayout, getWatermarkText } from "../watermarkShared";

self.onmessage = async (event) => {
  const payload = event.data;
  if (!payload || payload.type !== "watermark") {
    return;
  }

  const { requestId, imageId, imageUrl } = payload;

  try {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error("Failed to fetch image");
    }

    const imageBlob = await response.blob();
    const bitmap = await createImageBitmap(imageBlob);
    const width = bitmap.width;
    const height = bitmap.height;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const text = getWatermarkText();
    const layout = buildWatermarkLayout(width, height, text);

    ctx.save();
    ctx.translate(layout.x, layout.y);
    ctx.rotate(layout.angle);
    ctx.font = layout.font;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = layout.lineWidth;
    ctx.strokeStyle = layout.stroke;
    ctx.fillStyle = layout.fill;
    ctx.strokeText(layout.text, 0, 0);
    ctx.fillText(layout.text, 0, 0);
    ctx.restore();

    const outputBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.93 });
    const buffer = await outputBlob.arrayBuffer();

    self.postMessage(
      {
        requestId,
        imageId,
        success: true,
        mimeType: outputBlob.type,
        buffer
      },
      [buffer]
    );
  } catch (error) {
    self.postMessage({
      requestId,
      imageId,
      success: false,
      message: error instanceof Error ? error.message : "Processing failed"
    });
  }
};
