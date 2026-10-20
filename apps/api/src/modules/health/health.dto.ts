import { livenessResponseSchema, readinessResponseSchema } from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";

export class LivenessResponseDto extends createZodDto(livenessResponseSchema) {}
export class ReadinessResponseDto extends createZodDto(readinessResponseSchema) {}
