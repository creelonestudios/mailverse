import Logger from "../Logger.js"
import SMTPClient from "../smtp/SMTPClient.js"

type SMTPUpstreamOptions = {
	host: string
	port: number
	useTLS: boolean
	username: string
	password: string
}

const logger = new Logger("SMTP Upstream", "PINK")

export default class SMTPUpstream {

	options: SMTPUpstreamOptions

	constructor(options: SMTPUpstreamOptions) {
		this.options = options
	}

	async sendMail(from: string, to: string, content: string) {
		const smtpclient = new SMTPClient(this.options.host, this.options.port, this.options.useTLS)

		const header = await smtpclient.read()

		if (!header.startsWith("220")) throw new Error(`Error from SMTP server: ${header}`)

		await smtpclient.ehlo("127.0.0.1")
		if (!this.options.useTLS) {
			await smtpclient.startTLS()
			await smtpclient.ehlo("127.0.0.1")
		}

		await smtpclient.login(this.options.username, this.options.password)

		await smtpclient.from(from)
		await smtpclient.to(to)

		await smtpclient.data(content)

		logger.log(`Sent mail to ${to}.`)

		await smtpclient.quit()
	}

}
