import { Global, Module } from "@nestjs/common";
import { StorageService } from "../../integrations/storage/storage.service";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

/** Global so auth (/me avatar URL) and health (storage readiness) can use them. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, FilesService],
  exports: [StorageService, FilesService],
})
export class FilesModule {}
