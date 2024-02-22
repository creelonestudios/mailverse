import Logger from "../Logger.js"
import net from "net"
import tls from "tls"

const logger = new Logger("POP3 Client", "TEAL")

export default class POP3Client {

	socket: net.Socket

	constructor(host: string, port: number, useTLS: boolean) {
		this.socket = useTLS ? tls.connect(port, host) : net.createConnection(port, host)

		this.socket.on("data", (data: Buffer) => {
			logger.log(`Received data: ${data.toString()}`)
		})
	}

	writeAndWaitForResponse(data: string, untilDot = false) {
		logger.log(`Sending data: ${data}`)

		return new Promise<string>(resolve => {
			const { socket } = this

			socket.write(data)

			let info = ""

			function handler(recv: Buffer) {
				const text = recv.toString()

				if (untilDot) {
					info += text

					if (text.endsWith("\r\n.\r\n")) {
						resolve(info)
						socket.off("data", handler)

						return
					}

					return
				}

				resolve(text)
				socket.off("data", handler)

				return
			}

			socket.on("data", handler)
		})
	}

	read() {
		return new Promise<string>(resolve => {
			this.socket.once("data", (recv: Buffer) => {
				const text = recv.toString()

				logger.log(`Received data: ${text}`)

				resolve(text)
			})
		})
	}

	async login(username: string, password: string) {
		const resp = await this.writeAndWaitForResponse(`USER ${username}\r\n`)

		if (resp.startsWith("+OK")) logger.log("User valid")
		else {
			logger.error(`Failed to log in: ${resp}`)

			return false
		}

		const resp2 = await this.writeAndWaitForResponse(`PASS ${password}\r\n`)

		if (resp2.startsWith("+OK")) logger.log("Logged in")
		else {
			logger.error(`Failed to log in: ${resp2}`)

			return false
		}

		return true
	}

	async stat() {
		const resp = await this.writeAndWaitForResponse("STAT\r\n")

		logger.log(`STAT: ${resp}`)

		return resp
	}

	async list() {
		const resp = await this.writeAndWaitForResponse("LIST\r\n")

		logger.log(`LIST: ${resp}`)

		return resp
	}

	async retrieveMail(id: string) {
		const resp = await this.writeAndWaitForResponse(`RETR ${id}\r\n`, true)

		logger.log(`RETR: ${resp}`)

		return resp
	}

}
