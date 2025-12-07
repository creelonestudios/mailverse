import User from "../db/User.js"
import PlainSaslProvider from "./PlainSaslProvider.js"

export interface SaslResponse {
	type: "continue" | "success" | "failure";
	user?: User;
}

export default interface SaslProvider {
	data(data: string): Promise<SaslResponse>;
}

export const SASL_PROVIDERS: Record<string, new () => SaslProvider> = {	PLAIN: PlainSaslProvider }
