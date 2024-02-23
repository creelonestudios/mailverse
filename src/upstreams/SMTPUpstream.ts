import Logger from "../Logger.js"
import SMTPClient from "../smtp/SMTPClient.js"

type SMTPUpstreamOptions = {
	host: string
	port: number
	useTLS: boolean
	username: string
	password: string
}

function sleep(ms: number) {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}

const logger = new Logger("SMTP Upstream", "PINK")

export default class SMTPUpstream {

	options: SMTPUpstreamOptions

	constructor(options: SMTPUpstreamOptions) {
		this.options = options
	}

	async sendMail(from: string, to: string, content: string) {
		const smtpclient = new SMTPClient(this.options.host, this.options.port, this.options.useTLS)

		await sleep(300)
		await smtpclient.ehlo("127.0.0.1")
		if (!this.options.useTLS) {
			await smtpclient.startTLS()
			await smtpclient.ehlo("127.0.0.1")
		}

		await smtpclient.login(this.options.username, this.options.password)

		await smtpclient.from(from)
		await smtpclient.to(to)

		const { response, contentResponse } = await smtpclient.data(content)

		logger.log(`Sent mail to ${to}. Response: ${response}. Content response: ${contentResponse}`)

		await smtpclient.quit()
	}

}
