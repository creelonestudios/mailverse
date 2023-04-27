import net from "net"
import tls from "tls"
import getConfig from "../config.js"
import Logger from "../Logger.js"

const logger = new Logger("SMTPClient", "TEAL")

export default class SMTPClient {

	static async sendMessage(host: string, port: number, from: string, to: string, content: string, useTLS: boolean) {
		// const sock = net.createConnection(port, host)
		const sock = useTLS ? tls.connect(port, host) : net.createConnection(port, host)
		sock.on("data", (data: Buffer) => {
			logger.log(`Received data: ${data.toString()}`)
		})
		sock.on("connect", async () => {
			logger.log("Connected to server")
			sock.write(`EHLO ${getConfig("host", "localhost")}\r\n`)
			sock.write("MAIL FROM:<" + from + ">\r\n")
			sock.write("RCPT TO:<" + to + ">\r\n")
			sock.write("DATA\r\n")
			sock.write(content + "\r\n.\r\n")
			sock.write("QUIT\r\n")
		})
	}

}
