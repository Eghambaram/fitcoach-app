import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { feedbackRequestSchema } from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Roles } from "../../common/auth/decorators";
import { FeedbackService } from "./feedback.service";

class FeedbackRequestDto extends createZodDto(feedbackRequestSchema) {}
class FeedbackResponseDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/** Trainer feedback (PROMPT §16.0). A suspended trainer can still tell us what's wrong. */
@ApiTags("feedback")
@Roles("trainer")
@AllowInactiveWorkspace()
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(201)
  @ApiOkResponse({ type: FeedbackResponseDto })
  send(@Body() body: FeedbackRequestDto): Promise<{ id: string }> {
    return this.feedback.send(body);
  }
}
