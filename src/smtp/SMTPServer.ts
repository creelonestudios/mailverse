import Logger from "../Logger.js"
import SMTP from "./SMTP.js"
import User from "../models/User.js"
import getConfig from "../config.js"
import net from "net"
import sendStatus from "./status.js"
import tls from "tls"

const logger = new Logger("SMTPServer", "GREEN")

export default class SMTPServer {

	server: net.Server
	useTLS: boolean

	constructor(port: number, useTLS: boolean, key?: Buffer, cert?: Buffer) {
		this.useTLS = useTLS
		if (useTLS && (!key || !cert)) throw new Error("TLS key or certificate not provided")

		this.server = useTLS ? tls.createServer({
			key,
			cert
		}, this.connection) : net.createServer()
		this.server.listen(port, () => {
			logger.log(`Server listening on port ${port}`)
		})
		if (!useTLS) this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		const status = sendStatus(sock)

		logger.log("Client connected")
		status(220, { message: getConfig("smtp.header", "SMTP Server ready") })
		let receivingData = false
		let info = {
			from:    "",
			to:      [] as string[],
			content: ""
		}

		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()


			// TODO implement regular HELO greeting
			if (receivingData) {
				logger.log(`Received message content: ${msg}`)
				info.content += msg
				if (msg.endsWith(".\r\n")) {
					receivingData = false
					info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n")
					await SMTP.handleNewMail(info)
					status(250)
					logger.log("No longer receiving data -----------------------------------")

					return
				}

				return
			}

			logger.log(`Received data: ${msg}`)
			if (msg.startsWith("EHLO")) {
				sock.write(`250-${getConfig("host", "localhost")}\r\n`)

				// We dont have any smtp extensions yet
				status(250, { message: "HELP" }) // was: 250 HELP
			} else if (msg.startsWith("MAIL FROM:")) {
				// The spec says we should reset the state if the client sends MAIL FROM again
				info = {
					from:    "",
					to:      [],
					content: ""
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")

				logger.log(`MAIL FROM: ${email}`)
				info.from = email
				status(250)
			} else if (msg.startsWith("RCPT TO:")) {
				if (info.from == "") {
					// The spec says we should return 503 if the client has not sent MAIL FROM yet
					status(503)

					return
				}

				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				const [username, domain] = email.split("@")

				if (info.from.endsWith(`@${getConfig("host")}`)) {
					// This is an outgoing mail, we need to forward it to another server
					logger.log("Mail is outgoing.")
					info.to.push(email)
					logger.log(`RCPT TO: ${email}`)
					status(250)

					return
				}

				if (domain != getConfig("host")) {
					// The spec says we MAY forward the message ourselves,
					// but simply returning 550 is fine, and the client should handle it
					status(550)

					return
				}

				const user = await User.findOne({ where: { username } })

				if (!user) {
					status(550)

					return
				}

				info.to.push(email)
				logger.log(`RCPT TO: ${email}`)
				status(250)
			} else if (msg.startsWith("DATA")) {
				// The spec says we should return either 503 or 554 if the client has not sent MAIL FROM or RCPT TO yet
				// We will send 554 because it is more specific
				if (info.from == "" || info.to.length == 0) {
					status(554, { message: "No valid recipients" })

					return
				}

				receivingData = true
				logger.log("Now receiving data -----------------------------------")
				status(354)
			} else if (msg.startsWith("QUIT")) {
				status(221, "2.0.0")
				sock.end()
			} else if (msg.startsWith("VRFY")) {
				// This command is used to verify if a user exists,
				// but that can be a security risk + it is also done with RCPT TO anyway
				status(502)
			} else if (msg.startsWith("EXPN")) status(502)
			 else status(502)
		})
		sock.on("close", () => {
			logger.log("Client disconnected")
		})
	}

}
