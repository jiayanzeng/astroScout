export type ActionFailureStatus =
  | "auth_required"
  | "validation_error"
  | "database_error"
  | "no_affected_rows";

export type ActionResult<T> =
  | { status: "success"; data: T }
  | { status: ActionFailureStatus; error: string };

export function actionFailure(
  status: ActionFailureStatus,
  error: string,
): ActionResult<never> {
  return { status, error };
}
