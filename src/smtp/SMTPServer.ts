import net from "net"
import { writeFileSync, mkdirSync } from "fs"
import getConfig from "../config.js"
import Mail from "../models/Mail.js"
import User from "../models/User.js"
import { smtpserver } from "../main.js"
import crypto from "node:crypto";

export default class SMTPServer {

	server: net.Server
	messages: Map<number, string> = new Map([
		[500, "Syntax error, command unrecognized"],
		[501, "Syntax error in parameters or arguments"],
		[502, "Command not implemented"],
		[503, "Bad sequence of commands"],
		[504, "Command parameter not implemented"],
		[221, "Bye"],
		[421, "Service not available, closing transmission channel"], // This may be a reply to any command if the service knows it must shut down
		[250, "Requested mail action okay, completed"],
		[251, "User not local; will forward to <forward-path>"],
		[252, "Cannot VRFY user, but will accept message and attempt delivery"],
		[450, "Requested mail action not taken: mailbox unavailable"],
		[550, "Requested action not taken: mailbox unavailable"], // when we cant find the user
		[451, "Requested action aborted: error in processing"],
		[551, "User not local; please try <forward-path>"],
		[452, "Requested action not taken: insufficient system storage"],
		[552, "Requested mail action aborted: exceeded storage allocation"], // when the user has exceeded their quota
		[553, "Requested action not taken: mailbox name not allowed"], // when the user has an invalid name
		[354, "Start mail input; end with <CRLF>.<CRLF>"],
		[554, "No valid recipients"],
		[250, "OK"],
	]);

	constructor(port: number) {
		this.server = net.createServer()
		this.server.listen(port, () => {
			console.log("[SMTP] Server listening on port " + port)
		});
		this.server.on("connection", this.connection)
	}

	connection(sock: net.Socket) {
		console.log("[SMTP] Client connected")
		sock.write("220 localhost SMTP Mailverse\r\n")
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
				console.log("[SMTP] Received message content: " + msg)
				info.content += msg
				if(msg.endsWith(".\r\n")) {
					receivingData = false;
					info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n")
					await smtpserver.handleNewMail(info)
					sock.write(`250 ${this.messages.get(250)}\r\n`)
					console.log("[SMTP] No longer receiving data -----------------------------------")
					return
				}
				return
			}
			console.log("[SMTP] Received data: " + msg)
			if(msg.startsWith("EHLO")) {
				sock.write("250-localhost\r\n")
				// We dont have any smtp extensions yet
				sock.write("250 HELP\r\n")
			} else if(msg.startsWith("MAIL FROM:")) {
				// The spec says we should reset the state if the client sends MAIL FROM again
				info = {
					from: "",
					to: [],
					content: ""
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				console.log("[SMTP] MAIL FROM: " + email)
				info.from = email
				sock.write(`250 ${this.messages.get(250)}\r\n`)
			} else if(msg.startsWith("RCPT TO:")) {
				if(info.from == "") {
					// The spec says we should return 503 if the client has not sent MAIL FROM yet
					sock.write(`503 ${this.messages.get(503)}\r\n`)
					return
				}
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				const username = email.split("@")[0]
				const domain = email.split("@")[1]
				if(domain != getConfig("host")) {
					// The spec says we MAY forward the message ourselves, but simply returning 550 is fine, and the client should handle it
					sock.write(`550 ${this.messages.get(550)}\r\n`)
					return
				}
				const user = await User.findOne({ where: { username } })
				if(!user) {
					sock.write(`550 ${this.messages.get(550)}\r\n`)
					return
				}
				info.to.push(email)
				console.log("[SMTP] RCPT TO: " + email)
				sock.write(`250 ${this.messages.get(250)}\r\n`)
			} else if(msg.startsWith("DATA")) {
				// The spec says we should return either 503 or 554 if the client has not sent MAIL FROM or RCPT TO yet
				// We will send 554 because it is more specific
				if(info.from == "" || info.to.length == 0) {
					sock.write(`554 ${this.messages.get(554)}\r\n`)
					return
				}
				receivingData = true;
				console.log("[SMTP] Now receiving data -----------------------------------")
				sock.write(`354 ${this.messages.get(354)}\r\n`)
			} else if(msg.startsWith("QUIT")) {
				sock.write(`221 ${this.messages.get(221)}\r\n`)
				sock.end()
			} else if(msg.startsWith("VRFY")) {
				// This command is used to verify if a user exists, but that can be a security risk + it is also done with RCPT TO anyway
				sock.write(`502 ${this.messages.get(502)}\r\n`)
			} else if(msg.startsWith("EXPN")) {
				sock.write(`502 ${this.messages.get(502)}\r\n`)
			} else {
				sock.write(`500 ${this.messages.get(500)}\r\n`)
			}
		});
		sock.on("close", () => {
			console.log("[SMTP] Client disconnected")
		})
	}

	async handleNewMail(info: { from: string, to: string[], content: string }) {
		const id = crypto.randomUUID()
		mkdirSync(`mails/`, { recursive: true })
		writeFileSync(`mails/${id}.txt`, info.content)
		console.log("[SMTP] Saved mail to " + `mails/${id}.txt`)
		const serverName = getConfig("serverName")
		if(info.from.endsWith("@" + serverName)) {
			console.log("[SMTP] Mail is from this server.")
			if(info.to.every(email => email.endsWith("@" + serverName))) { // if all recipients are on this server
				console.log("[SMTP] All recipients are on this server.")
				// TODO: add mail to mailboxes
				return
			}
			console.log("[SMTP] Not all recipients are on this server. Will forward mail to other servers.");
			console.error("[SMTP] Forwarding mails to other servers is not implemented yet.")
			return
		}
		// Mail is not from this server
		if(!info.to.every(email => email.endsWith("@" + serverName))) {
			console.error("[SMTP] Not all recipients are from this server. Will NOT forward mail to other servers.")
		}
		const recipients = info.to.filter(email => email.endsWith("@" + serverName))
		for(const rec of recipients) {
			console.log("[SMTP] Forwarding mail to " + rec);
			const user = await User.findOne({ where: { username: rec.split("@")[0] } });
			if(!user) {
				console.error("[SMTP] User " + rec + " does not exist.")
				continue
			}
			await user.$create("mail", {
				from: info.from,
				to: rec,
				content: id
			});
			console.log("[SMTP] Forwarded mail to " + rec);
		}
	}

}