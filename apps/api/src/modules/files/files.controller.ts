import { Controller, Delete, HttpCode, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, type ApiBodyOptions, ApiConsumes, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  ERROR_CODES,
  MAX_UPLOAD_BYTES,
  type OkResponse,
  type UploadedPhotoResponse,
  uploadedPhotoResponseSchema,
} from "@fitcoach/shared";
import { memoryStorage } from "multer";
import { createZodDto } from "nestjs-zod";
import { Roles } from "../../common/auth/decorators";
import { DomainError } from "../../common/errors/domain-error";
import { OkResponseDto } from "../auth/auth.dto";
import { FilesService } from "./files.service";

class UploadedPhotoResponseDto extends createZodDto(uploadedPhotoResponseSchema) {}

/**
 * Uploads go through the API only (PROMPT D11): size and type checks, EXIF strip, WebP re-encode.
 * Multer keeps the file in memory (max 10 MB + 1 byte, so the over-limit case is detected) — nothing
 * touches the container disk.
 */
const photoUpload = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1, fields: 0 },
});

const PHOTO_BODY: ApiBodyOptions = {
  schema: {
    type: "object",
    properties: { file: { type: "string", format: "binary" } },
    required: ["file"],
  },
};

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Roles("trainer")
  @Post("profile-photo")
  @HttpCode(200)
  @UseInterceptors(photoUpload)
  @ApiConsumes("multipart/form-data")
  @ApiBody(PHOTO_BODY)
  @ApiOkResponse({ type: UploadedPhotoResponseDto })
  uploadProfilePhoto(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadedPhotoResponse> {
    if (!file) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Choose a photo to upload.", {
        file: ["Choose a photo to upload."],
      });
    }
    return this.files.uploadProfilePhoto({ buffer: file.buffer, size: file.size });
  }

  @Roles("trainer")
  @Delete("profile-photo")
  @ApiOkResponse({ type: OkResponseDto })
  async removeProfilePhoto(): Promise<OkResponse> {
    await this.files.removeProfilePhoto();
    return { ok: true };
  }
}
