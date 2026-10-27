import type {
  AddWorkoutExerciseRequest,
  AppointmentDetail,
  PutWorkoutSetRequest,
  WorkoutDetail,
} from "@fitcoach/shared";
import { browserApi, unwrap } from "@/lib/api/browser";

/**
 * What the live workout screen can do. The trainer and the client app share the screen (§8.5,
 * client board 5); only the endpoints differ, and trainer-only actions are absent for clients.
 */
export interface WorkoutApi {
  key: readonly unknown[];
  get(): Promise<WorkoutDetail>;
  start(): Promise<WorkoutDetail>;
  putSet(id: string, body: PutWorkoutSetRequest): Promise<WorkoutDetail>;
  finish(feedback: string, idempotencyKey: string): Promise<WorkoutDetail>;
  skip?: (reason: string) => Promise<WorkoutDetail>;
  substitute?: (sessionExerciseId: string, exerciseId: string) => Promise<WorkoutDetail>;
  addExercise?: (body: AddWorkoutExerciseRequest) => Promise<WorkoutDetail>;
  markAttended?: (appointmentId: string) => Promise<AppointmentDetail>;
}

export function trainerWorkoutApi(id: string): WorkoutApi {
  const path = { params: { path: { id } } };
  return {
    key: ["workout", id],
    get: () => unwrap(browserApi.GET("/v1/workout-sessions/{id}", path)),
    start: () => unwrap(browserApi.POST("/v1/workout-sessions/{id}/start", path)),
    putSet: (setId, body) =>
      unwrap(browserApi.PUT("/v1/workout-sets/{id}", { params: { path: { id: setId } }, body })),
    finish: (feedback, idempotencyKey) =>
      unwrap(
        browserApi.POST("/v1/workout-sessions/{id}/finish", {
          params: { path: { id }, header: { "Idempotency-Key": idempotencyKey } },
          body: { feedback },
        }),
      ),
    skip: (reason) =>
      unwrap(browserApi.POST("/v1/workout-sessions/{id}/skip", { ...path, body: { reason } })),
    substitute: (sessionExerciseId, exerciseId) =>
      unwrap(
        browserApi.POST("/v1/workout-session-exercises/{id}/substitute", {
          params: { path: { id: sessionExerciseId } },
          body: { exerciseId },
        }),
      ),
    addExercise: (body) =>
      unwrap(browserApi.POST("/v1/workout-sessions/{id}/exercises", { ...path, body })),
    markAttended: (appointmentId) =>
      unwrap(
        browserApi.POST("/v1/appointments/{id}/attendance", {
          params: { path: { id: appointmentId } },
          body: { status: "completed" },
        }),
      ),
  };
}

/** The client app's own endpoints; they return the workout with trainer-only fields removed. */
export function clientWorkoutApi(id: string): WorkoutApi {
  const path = { params: { path: { id } } };
  const workout = async (call: Promise<{ workout: WorkoutDetail }>) => (await call).workout;
  return {
    key: ["client-workout", id],
    get: () => workout(unwrap(browserApi.GET("/v1/client/workouts/{id}", path))),
    start: () => workout(unwrap(browserApi.POST("/v1/client/workouts/{id}/start", path))),
    putSet: (setId, body) =>
      workout(
        unwrap(
          browserApi.PUT("/v1/client/workout-sets/{id}", { params: { path: { id: setId } }, body }),
        ),
      ),
    finish: (feedback, idempotencyKey) =>
      workout(
        unwrap(
          browserApi.POST("/v1/client/workouts/{id}/finish", {
            params: { path: { id }, header: { "Idempotency-Key": idempotencyKey } },
            body: { feedback },
          }),
        ),
      ),
  };
}
