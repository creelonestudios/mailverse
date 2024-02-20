import { mkdir, writeFile } from "fs/promises"
import Logger from "../Logger.js"
import User from "../models/User.js"
import crypto from "node:crypto"
import getConfig from "../config.js"

const logger = new Logger("SMTP", "GREEN")

export default class SMTP {

	static async handleNewMail(info: { from: string, to: string[], content: string }) {
		const id = crypto.randomUUID()

		await mkdir(`mails/`, { recursive: true })
		await writeFile(`mails/${id}.txt`, info.content)
		logger.log(`Saved mail to mails/${id}.txt`)

		const serverName = getConfig("host")

		if (info.from.endsWith(`@${serverName}`)) {
			logger.log("Mail is from this server.")

			if (!info.to.every(email => email.endsWith(`@${serverName}`))) { // if not all recipients are on this server
				logger.log("Not all recipients are on this server. Will forward mail to other servers.")
				logger.error("Forwarding mails to other servers is not implemented yet.")


				// TODO: forward mail to other servers using SMTPClient
				return
			}

			logger.log("All recipients are on this server.")
		} else if (!info.to.every(email => email.endsWith(`@${serverName}`))) logger.warn("Not all recipients are from this server. Will NOT forward mail to other servers.")

		const recipients = info.to.filter(email => email.endsWith(`@${serverName}`))

		recipients.forEach(async rec => {
			logger.log(`Forwarding mail to ${rec}`)
			const user = await User.findOne({ where: { username: rec.substring(0, rec.lastIndexOf("@")) } })

			if (!user) {
				logger.error(`User ${rec} does not exist.`)

				// Since we verify the recipients at the RCPT TO command, we should never get here, but you never know
				return
			}

			await user.$create("mail", {
				from:    info.from,
				to:      rec,
				content: id
			})

			logger.log(`Forwarded mail to ${rec}`)
		})
	}

}
