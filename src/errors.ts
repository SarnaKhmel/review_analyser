/** An error whose message is safe and useful to show to the end user. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
