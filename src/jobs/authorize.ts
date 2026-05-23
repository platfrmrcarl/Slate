/**
 * Returns true when the incoming job request carries the expected
 * `Authorization: Bearer ${INTERNAL_JOB_SECRET}` header.
 */
export async function authorizeJobRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INTERNAL_JOB_SECRET ?? ""}`;
  return !!auth && auth === expected;
}
