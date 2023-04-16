import net from "net"
import { writeFileSync, mkdirSync } from "fs"
import getConfig from "../config.js"
import Mail from "../models/Mail.js"
import User from "../models/User.js"
import { smtpserver } from "../main.js"
import crypto from "node:crypto";

export default class SMTPServer {

	server: net.Server

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
					info.content = info.content.substring(0, info.content.length - 3)
					await smtpserver.handleNewMail(info)
					sock.write("250 OK\r\n")
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
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				console.log("[SMTP] MAIL FROM: " + email)
				info.from = email
				sock.write("250 OK\r\n")
			} else if(msg.startsWith("RCPT TO:")) {
				const email = msg.split(":")[1].split(">")[0].replace("<", "")
				info.to.push(email)
				console.log("[SMTP] RCPT TO: " + email)
				sock.write("250 OK\r\n")
			} else if(msg.startsWith("DATA")) {
				receivingData = true;
				console.log("[SMTP] Now receiving data -----------------------------------")
				sock.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n")
			} else if(msg.startsWith("QUIT")) {
				sock.write("221 Bye\r\n")
				sock.end()
			} else {
				sock.write("500 Command not implemented\r\n")
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