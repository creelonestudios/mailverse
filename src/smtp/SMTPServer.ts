import net from "net"
import { writeFileSync, mkdirSync } from "fs"
import getConfig from "../config.js"
import Mail from "../models/Mail.js"
import User from "../models/User.js"
import crypto from "node:crypto";
import sendStatus from "./status.js"
import Logger from "../Logger.js"

const logger = new Logger("SMTP", "GREEN")

export default class SMTPServer {

	server: net.Server

	constructor(port: number) {
		this.server = net.createServer()
		this.server.listen(port, () => {
			logger.log(`Server listening on port ${port}`)
		});
		this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		const status = sendStatus(sock)

		logger.log("Client connected")
		status(220, { message: getConfig("smtp_header", "SMTP Server ready") })
		let receivingData = false
		let info = {
			from: "",
			to: [] as string[],
			content: ""
		}
		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()
			// TODO implement regular HELO greeting
			if(receivingData) {
				logger.log(`Received message content: ${msg}`)
				info.content += msg
				if(msg.endsWith(".\r\n")) {
					receivingData = false;
					info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n")
					await this.handleNewMail(info)
					status(250)
					logger.log("No longer receiving data -----------------------------------")
					return
				}
				return
			}
			logger.log(`Received data: ${msg}`)
			if(msg.startsWith("EHLO")) {
				sock.write(`250-${getConfig("host", "localhost")}\r\n`)
				// We dont have any smtp extensions yet
				status(250, {message: "HELP"}) // was: 250 HELP
			} else if(msg.startsWith("MAIL FROM:")) {
				// The spec says we should reset the state if the client sends MAIL FROM again
				info = {
					from: "",
					to: [],
					content: ""
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				logger.log(`MAIL FROM: ${email}`)
				info.from = email
				status(250)
			} else if(msg.startsWith("RCPT TO:")) {
				if(info.from == "") {
					// The spec says we should return 503 if the client has not sent MAIL FROM yet
					status(503)
					return
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				const username = email.split("@")[0]
				const domain = email.split("@")[1]
				if(domain != getConfig("host")) {
					// The spec says we MAY forward the message ourselves, but simply returning 550 is fine, and the client should handle it
					status(550)
					return
				}
				const user = await User.findOne({ where: { username } })
				if(!user) {
					status(550)
					return
				}
				info.to.push(email)
				logger.log(`RCPT TO: ${email}`)
				status(250)
			} else if(msg.startsWith("DATA")) {
				// The spec says we should return either 503 or 554 if the client has not sent MAIL FROM or RCPT TO yet
				// We will send 554 because it is more specific
				if(info.from == "" || info.to.length == 0) {
					status(554, {message: "No valid recipients"})
					return
				}
				receivingData = true;
				logger.log("Now receiving data -----------------------------------")
				status(354)
			} else if(msg.startsWith("QUIT")) {
				status(221, "2.0.0")
				sock.end()
			} else if(msg.startsWith("VRFY")) {
				// This command is used to verify if a user exists, but that can be a security risk + it is also done with RCPT TO anyway
				status(502)
			} else if(msg.startsWith("EXPN")) {
				status(502)
			} else {
				status(502)
			}
		});
		sock.on("close", () => {
			logger.log("Client disconnected")
		})
	}

	async handleNewMail(info: { from: string, to: string[], content: string }) {
		const id = crypto.randomUUID()
		mkdirSync(`mails/`, { recursive: true })
		writeFileSync(`mails/${id}.txt`, info.content)
		logger.log(`Saved mail to mails/${id}.txt`)
		const serverName = getConfig("host")
		if(info.from.endsWith("@" + serverName)) {
			logger.log("Mail is from this server.")
			if(!info.to.every(email => email.endsWith("@" + serverName))) { // if not all recipients are on this server
				logger.log("Not all recipients are on this server. Will forward mail to other servers.");
				logger.error("Forwarding mails to other servers is not implemented yet.")
				// TODO: forward mail to other servers using SMTPClient
				return
			}
			logger.log("All recipients are on this server.")
		} else if(!info.to.every(email => email.endsWith("@" + serverName))) {
			logger.warn("Not all recipients are from this server. Will NOT forward mail to other servers.")
		}
		const recipients = info.to.filter(email => email.endsWith("@" + serverName))
		for(const rec of recipients) {
			logger.log("Forwarding mail to " + rec);
			const user = await User.findOne({ where: { username: rec.split("@")[0] } });
			if(!user) {
				logger.error("User " + rec + " does not exist.")
				// Since we verify the recipients at the RCPT TO command, we should never get here, but you never know
				continue
			}
			await user.$create("mail", {
				from: info.from,
				to: rec,
				content: id
			});
			logger.log("Forwarded mail to " + rec);
		}
	}

}
