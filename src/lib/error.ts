/** Human-readable message from an unknown thrown value (AppwriteException included). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
