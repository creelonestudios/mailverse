import Logger from "../Logger.js"
import net from "net"
import tls from "tls"

const logger = new Logger("IMAP Client", "GREEN")

export default class IMAPClient {

	socket: net.Socket
	tag: number

	constructor(host: string, port: number, useTLS: boolean) {
		this.tag = 1
		this.socket = useTLS ? tls.connect(port, host) : net.createConnection(port, host)

		this.socket.on("data", (data: Buffer) => {
			logger.log(`Received data: ${data.toString()}`)
		})
	}

	writeAndWaitForResponse(data: string) {
		logger.log(`Sending data: ${data}`)
		const tag = `A${this.tag++}`

		return new Promise<string>(resolve => {
			const { socket } = this

			socket.write(`${tag} ${data}`)

			let info = ""

			function handler(recv: Buffer) {
				const fullText = recv.toString()

				for (const text of fullText.split("\n")) {
					logger.log(`Received line: ${text}`)
					const msgTag = text.substring(0, text.indexOf(" "))

					logger.log(`Message tag: <${msgTag}>`)

					// If the message tag is not the same as the tag we sent, ignore it
					// If the message tag is "*", don't ignore it
					if (msgTag !== tag && msgTag !== "*") continue

					logger.log("Message tag matches our tag")

					const noTag = text.substring(text.indexOf(" ") + 1)

					info += `${noTag}\n`

					if (msgTag === "*") continue

					logger.log("Message is complete")

					resolve(info)

					socket.off("data", handler)

					return
				}
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
		const resp = await this.writeAndWaitForResponse(`LOGIN "${username}" "${password}"\r\n`)

		if (resp.startsWith("OK")) {
			logger.log("Logged in")

			return true
		}

		logger.error(`Failed to log in: ${resp}`)

		return false
	}

	async namespaces() {
		const resp = await this.writeAndWaitForResponse("NAMESPACE\r\n")

		logger.warn(`Namespaces: ${resp}`)

		return resp
	}

	async listInboxes(namespace: string, seperator = "/") {
		const resp = await this.writeAndWaitForResponse(`LIST "${namespace}${seperator}" "*"\r\n`)

		logger.warn(`Inboxes: ${resp}`)

		return resp
	}

	async selectInbox(inbox: string) {
		const resp = await this.writeAndWaitForResponse(`SELECT "${inbox}"\r\n`)

		logger.warn(`Selected inbox: ${resp}`)

		return resp
	}

	async search(query: string) {
		const resp = await this.writeAndWaitForResponse(`SEARCH ${query}\r\n`)

		logger.warn(`Search results: ${resp}`)

		return resp
	}

	async fetchMessage(id: string) {
		const resp = await this.writeAndWaitForResponse(`FETCH ${id} RFC822\r\n`)

		logger.warn(`Fetched message: ${resp}`)

		return resp
	}

}
