import { getVercelOidcToken } from "@vercel/oidc";

/** The answer shapes Jev returns; `probabilities` for a score are keyed by zero-based level index. */
export type EvaluationAnswers = Record<
  string,
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> }
  | { type: "boolean"; probability: number }
>;

export async function requestOidcToken(env: {
  [key: string]: string | undefined;
}): Promise<string | undefined> {
  if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.VERCEL !== "1") {
    return undefined;
  }
  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

export class MissingGatewayKey extends Error {
  constructor() {
    super("AI gateway credentials are missing");
    this.name = "MissingGatewayKey";
  }
}
