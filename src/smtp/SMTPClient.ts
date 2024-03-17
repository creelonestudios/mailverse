import Logger from "../Logger.js"
import net from "net"
import tls from "tls"

const logger = new Logger("SMTPClient", "TEAL")

export default class SMTPClient {

	socket: net.Socket

	constructor(host: string, port: number, useTLS: boolean) {
		this.socket = useTLS ? tls.connect(port, host) : net.createConnection(port, host)

		this.socket.on("data", (data: Buffer) => {
			logger.log(`Received data: ${data.toString()}`)
		})
	}

	writeAndWaitForResponse(data: string) {
		logger.log(`Sending data: ${data}`)

		return new Promise<string>(resolve => {
			const { socket } = this

			socket.once("data", (recv: Buffer) => {
				const text = recv.toString()

				logger.log(`Received data: ${text}`)

				resolve(text)
			})

			socket.write(data)
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

	async ehlo(host: string) {
		const response = await this.writeAndWaitForResponse(`EHLO ${host}\r\n`)

		if (!response.startsWith("250")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${response}`)
		}

		return true
	}

	async from(from: string) {
		const response = await this.writeAndWaitForResponse(`MAIL FROM:<${from}>\r\n`)

		if (!response.startsWith("250")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${response}`)
		}

		return true
	}

	async to(to: string) {
		const response = await this.writeAndWaitForResponse(`RCPT TO:<${to}>\r\n`)

		if (!response.startsWith("250")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${response}`)
		}

		return true
	}

	async data(content: string) {
		const response = await this.writeAndWaitForResponse("DATA\r\n")

		if (!response.startsWith("354")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${response}`)
		}

		const contentResponse = await this.writeAndWaitForResponse(`${content}\r\n.\r\n`)

		if (!contentResponse.startsWith("250")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${contentResponse}`)
		}

		return true
	}

	async quit() {
		await this.writeAndWaitForResponse("QUIT\r\n")

		return true
	}

	async login(username: string, password: string) {
		const resp = await this.writeAndWaitForResponse(`AUTH LOGIN\r\n`)

		if (!resp.startsWith("334")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${resp}`)
		}

		const userResp = await this.writeAndWaitForResponse(`${Buffer.from(username).toString("base64")}\r\n`)

		if (!userResp.startsWith("334")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${userResp}`)
		}

		const passResp = await this.writeAndWaitForResponse(`${Buffer.from(password).toString("base64")}\r\n`)

		if (!passResp.startsWith("235")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${passResp}`)
		}

		return true
	}

	async startTLS() {
		const response = await this.writeAndWaitForResponse("STARTTLS\r\n")

		if (!response.startsWith("220")) {
			this.socket.end()

			throw new Error(`Error from SMTP server: ${response}`)
		}

		this.socket.removeAllListeners()
		this.socket = tls.connect({ socket: this.socket })
		this.socket.on("data", (data: Buffer) => {
			logger.log(`Received TLS data: ${data.toString()}`)
		})

		return true
	}

	// static sendMessage(host: string, port: number, from: string, to: string, content: string, useTLS: boolean) {
	// 	// const sock = net.createConnection(port, host)
	// 	const sock = useTLS ? tls.connect(port, host) : net.createConnection(port, host)

	// 	sock.on("data", (data: Buffer) => {
	// 		logger.log(`Received data: ${data.toString()}`)
	// 	})
	// 	sock.on("connect", () => {
	// 		logger.log("Connected to server")
	// 		sock.write(`EHLO ${getConfig("host", "localhost")}\r\n`)
	// 		sock.write(`MAIL FROM:<${from}>\r\n`)
	// 		sock.write(`RCPT TO:<${to}>\r\n`)
	// 		sock.write("DATA\r\n")
	// 		sock.write(`${content}\r\n.\r\n`)
	// 		sock.write("QUIT\r\n")
	// 	})
	// }

}
