import { Injectable } from "@nestjs/common";
import type { AppointmentStatus } from "@fitcoach/shared";

/** What changed about a client appointment that may use (or give back) a package session. */
export interface SessionUseChange {
  appointmentId: string;
  clientId: string;
  from: AppointmentStatus;
  to: AppointmentStatus;
  /** Cancelled inside the late-cancel window (D25). */
  lateCancel: boolean;
}

/**
 * Package session deduction (PROMPT §8.3A, CLAUDE.md rule 20b). Called by the scheduling service
 * inside the same transaction as attendance marking, un-marking and late cancellation.
 *
 * NOT IMPLEMENTED YET — step 3.2 fills this in: write one `package_session_ledger` row per
 * (package, appointment) for attended / no-show / late-cancel per the workspace's D25 policy, and a
 * reversal row when a mark is undone. Until then attendance saves without touching any package,
 * which is honest: packages don't exist yet.
 */
@Injectable()
export class SessionDeductionService {
  async applySessionUse(_change: SessionUseChange): Promise<void> {
    // Step 3.2.
  }
}
