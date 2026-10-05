import type { Request, Response } from "express";
import { httpError, idSchema } from "../schemas.ts";
import type { Repository } from "../types.ts";

export function createAttachmentController(repository: Repository) {
  return {
    async upload(request: Request, response: Response) {
      const threadId = idSchema.parse(request.body?.threadId);
      await repository.requireThread(threadId);
      const file = request.file;
      if (!file) throw httpError(400, "Choose an image to upload.");
      const mimeType = detectImageType(file.buffer);
      if (!mimeType || mimeType !== file.mimetype)
        throw httpError(415, "Upload a PNG, JPEG, GIF, or WebP image.");
      const name = file.originalname.slice(0, 240);
      const id = await repository.createAttachment(threadId, {
        name,
        mimeType,
        size: file.size,
        data: file.buffer,
      });
      response.status(201).json({
        id,
        name,
        size: file.size,
        content: { type: "image", url: `/attachments/${id}`, mimeType },
      });
    },
    async get(request: Request, response: Response) {
      const file = await repository.requireAttachment(
        idSchema.parse(request.params.attachmentId),
      );
      response
        .set({
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, max-age=3600",
        })
        .send(file.data);
    },
  };
}

function detectImageType(buffer: Buffer) {
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  )
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6)))
    return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
