import sendStatus, { type StatusOptions } from "./status.js"
import Logger from "../Logger.js"
import SMTP from "./SMTP.js"
import User from "../models/User.js"
import getConfig from "../config.js"
import net from "net"
import tls from "tls"
import { verify } from "argon2"

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

		// State:
		// 0: No authentication
		// 1: Waiting for authentication (AUTH PLAIN)
		// 2: Authenticated
		const auth = {
			state: 0,
			user:  ""
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
				sock.write(`250-AUTH PLAIN\r\n`)
				status(250, { message: "HELP" }) // was: 250 HELP
			} else if (msg.startsWith("MAIL FROM:")) {
				// The spec says we should reset the state if the client sends MAIL FROM again
				info = {
					from:    "",
					to:      [],
					content: ""
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")

				if (email.endsWith(`@${getConfig("host")}`) && auth.user != email) {
					// RFC 4954 Section 6:
					// 530 5.7.0  Authentication required
					// This response SHOULD be returned by any command other than AUTH, EHLO, HELO,
					// NOOP, RSET, or QUIT when server policy requires
					// authentication in order to perform the requested action and
					// authentication is not currently in force.
					status(530, "5.7.0")

					return
				}

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
			else if (msg.startsWith("AUTH PLAIN") || auth.state == 1) await SMTPServer.authPlain(msg, auth, info, status)
			 else status(502)
		})
		sock.on("close", () => {
			logger.log("Client disconnected")
		})
	}

	static async authPlain(msg: string, auth: { state: number, user: string }, info: { from: string, to: string[], content: string },
		status: (code: number, options?: StatusOptions | `${bigint}.${bigint}.${bigint}` | undefined) => void) {
		if (auth.state == 2 || info.from != "" || info.to.length != 0 || info.content != "") {
			// RFC 4954 Section 4:
			// After a successful AUTH command completes, a server MUST reject any
			// further AUTH commands with a 503 reply.
			// RFC 4954 Section 4:
			// The AUTH command is not permitted during a mail transaction.
			// An AUTH command issued during a mail transaction MUST be rejected with a 503 reply.
			status(503)
		}

		if (auth.state == 0) {
			if (msg.split(" ").length == 3) {
				await SMTPServer.authenticateUser(msg.split(" ")[2], auth, status)

				return
			}

			status(334)
			auth.state = 1
		} else if (auth.state == 1) await SMTPServer.authenticateUser(msg, auth, status)
	}

	static async authenticateUser(msg: string, auth: { state: number, user: string },
		status: (code: number, options?: StatusOptions | `${bigint}.${bigint}.${bigint}` | undefined) => void) {
		const [_, username, password] = Buffer.from(msg, "base64").toString().split("\0")

		if (!username || !password) {
			status(501, "5.5.2")
			auth.state = 0

			return
		}

		const user = await User.findOne({ where: { username } })

		if (!user) {
			status(535)
			auth.state = 0

			return
		}

		if (!(await verify(user.password, password))) {
			status(535)
			auth.state = 0

			return
		}

		auth.state = 2
		auth.user = `${username}@${getConfig("host")}`
		status(235, "2.7.0")
	}

}
