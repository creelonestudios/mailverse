import Logger from "../Logger.js"
import Mail from "../models/Mail.js"
import User from "../models/User.js"
import commands from "./POP3Commands.js"
import net from "net"
import tls from "tls"

const logger = new Logger("POP3", "YELLOW")

export default class POP3Server {

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
		logger.log("Client connected")
		sock.write("+OK POP3 server ready\r\n")
		const state = {
			username:          "",
			user:              undefined as User | undefined,
			markedForDeletion: [] as Mail[],
			login:             false
		}

		// eslint-disable-next-line complexity
		sock.on("data", async (data: Buffer) => {
			const msg = data.toString()

			logger.log(`Received data: ${msg}`)
			const args = msg.split(" ").slice(1)

			const sentCmd = msg.includes(" ") ? msg.substring(0, msg.indexOf(" ")) : msg.trim()
			const command = commands.find(c => c.command == sentCmd)

			if (!command) {
				sock.write("-ERR Unknown command\r\n")

				return
			}

			await command?.handle(sock, args, state)
		})
		sock.addListener("close", () => {
			logger.log("Client disconnected")
		})
	}

}
