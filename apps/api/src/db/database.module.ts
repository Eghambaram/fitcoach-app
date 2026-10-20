import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AppDatabase } from "./database";
import { DbContext, DbContextInterceptor } from "./db-context";
import { SystemDb } from "./system-db";

@Global()
@Module({
  providers: [
    AppDatabase,
    SystemDb,
    DbContext,
    { provide: APP_INTERCEPTOR, useClass: DbContextInterceptor },
  ],
  exports: [AppDatabase, SystemDb, DbContext],
})
export class DatabaseModule {}
