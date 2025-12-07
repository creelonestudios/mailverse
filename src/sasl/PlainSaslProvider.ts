import { verify } from "argon2"
import User from "../db/User.js"
import SaslProvider, { SaslResponse } from "./SaslProvider.js"

export default class PlainSaslProvider implements SaslProvider {

	async data(data: string): Promise<SaslResponse> {
		data = atob(data)

		if (data.split("\0").length !== 3) {
			return { type: "failure" }
		}

		const [authzid, authcid, password] = data.split("\0")

		if (authzid.trim() !== "" && authzid !== authcid) {
			// The user wants to authenticate as a different user than the one they are providing credentials for
			// Not gonna allow that
			return { type: "failure" }
		}

		const username = authcid.includes("@") ? authcid.split("@")[0] : authcid

		const user = await User.getUserFromUsername(username)

		if (!user) {
			return { type: "failure" }
		}

		if (!(await verify(user.password, password))) {
			return { type: "failure" }
		}

		return { type: "success", user }
	}

}
